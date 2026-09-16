import { execFile } from "node:child_process";
import { lstatSync, watch, type FSWatcher } from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ReviewWatchEvent } from "./review-watch-types";

const exec = promisify(execFile);
const MAX_DIRECTORIES = 256;
const MAX_SIGNATURES = 8192;
const DEBOUNCE_MS = 300;

export interface ReviewWatchRepository {
  root: string;
  gitDirectories: string[];
}

async function git(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  const { stdout } = await exec("git", ["--literal-pathspecs", "-c", "core.fsmonitor=false", "-C", cwd, ...args], {
    encoding: "utf8", timeout: 3000, maxBuffer: 2 * 1024 * 1024, signal,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  return stdout;
}

export async function resolveReviewWatchRepository(cwd: string): Promise<ReviewWatchRepository> {
  const root = await realpath((await git(cwd, ["rev-parse", "--show-toplevel"])).trim());
  const locations = (await git(root, ["rev-parse", "--absolute-git-dir", "--git-common-dir"])).trim().split("\n");
  const gitDirectories = await Promise.all(locations.map((location) => realpath(path.resolve(root, location))));
  return { root, gitDirectories: [...new Set(gitDirectories)] };
}

function signature(filename: string): string {
  try {
    const stat = lstatSync(filename, { bigint: true });
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.mode}`;
  } catch { return "missing"; }
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function startWatch(repository: ReviewWatchRepository, emit: (event: ReviewWatchEvent) => void) {
  const abort = new AbortController();
  const watchers = new Map<string, FSWatcher>();
  const directoryIdentities = new Map<string, string>();
  const signatures = new Map<string, string>();
  let stopped = false;
  let limited = false;
  let announced = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rebuilding = true;
  let dirty = false;
  let topologyDirty = false;

  /*
   * Record that part of this Worktree is unwatched, and say so at once: the
   * next change event may never come, because losing a watcher is what stops
   * it coming. Coverage before the stream opened travels with `ready`.
   */
  const limit = () => {
    if (limited) return;
    limited = true;
    if (announced && !stopped) emit({ type: "status", limited });
  };

  const changed = (rebuild = false) => {
    if (stopped) return;
    dirty = true;
    topologyDirty ||= rebuild;
    if (timer || rebuilding) return;
    timer = setTimeout(() => {
      timer = undefined;
      void refresh();
    }, DEBOUNCE_MS);
    timer.unref?.();
  };

  const add = async (directory: string) => {
    if (stopped) return;
    try {
      if (await realpath(directory) !== directory) { limit(); return; }
      if (stopped) return;
      const stat = lstatSync(directory, { bigint: true });
      const identity = `${stat.dev}:${stat.ino}`;
      if (directoryIdentities.get(directory) === identity && watchers.has(directory)) return;
      watchers.get(directory)?.close();
      watchers.delete(directory);
      if (watchers.size >= MAX_DIRECTORIES) { limit(); return; }
      const watcher = watch(directory, { recursive: false, persistent: false }, (event, filename) => {
        if (stopped) return;
        const name = filename?.toString();
        if (!name) { limit(); changed(true); return; }
        if (directory === repository.root && name === ".git") limit();
        if (repository.gitDirectories.includes(directory) && !["HEAD", "index", "packed-refs", "config", "refs"].includes(name)) return;
        const target = path.resolve(directory, name);
        if (!within(directory, target)) return;
        const next = signature(target);
        if (signatures.get(target) === next) return;
        if (signatures.size >= MAX_SIGNATURES) { signatures.clear(); limit(); }
        signatures.set(target, next);
        changed(event === "rename" || name === "index");
      });
      watcher.on("error", () => {
        watcher.close(); watchers.delete(directory); limit(); changed(true);
      });
      watchers.set(directory, watcher);
      directoryIdentities.set(directory, identity);
    } catch (error) {
      // A deleted directory or a not-yet-created refs directory has no contents to watch.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") limit();
    }
  };

  const discover = async () => {
    const directories = new Set([repository.root, ...repository.gitDirectories]);
    const addParents = (root: string, filename: string) => {
      let directory = path.dirname(path.resolve(root, filename));
      while (within(root, directory)) {
        if (directories.size >= MAX_DIRECTORIES) { limit(); break; }
        directories.add(directory);
        if (directory === root) break;
        directory = path.dirname(directory);
      }
    };
    try {
      const files = await git(repository.root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], abort.signal);
      for (const filename of files.split("\0").filter(Boolean)) addParents(repository.root, filename);
      const refs = await git(repository.root, ["for-each-ref", "--format=%(refname)"], abort.signal);
      for (const directory of repository.gitDirectories) {
        directories.add(path.join(directory, "refs"));
        for (const section of ["heads", "remotes", "tags"]) directories.add(path.join(directory, "refs", section));
        for (const ref of refs.trim().split("\n").filter(Boolean)) addParents(directory, ref);
      }
      // Empty and wholly untracked directory trees can contain unwatched descendants.
      const untrackedDirectories = await git(repository.root, ["ls-files", "--others", "--exclude-standard", "--directory", "-z"], abort.signal);
      if (untrackedDirectories.split("\0").some((entry) => entry.endsWith("/"))) limit();
    } catch { limit(); }
    if (stopped) return;
    for (const [directory, watcher] of watchers) {
      if (!directories.has(directory)) { watcher.close(); watchers.delete(directory); directoryIdentities.delete(directory); }
    }
    for (const directory of directories) await add(directory);
  };

  async function refresh() {
    if (stopped || rebuilding) return;
    rebuilding = true;
    dirty = false;
    const rebuild = topologyDirty;
    topologyDirty = false;
    try { if (rebuild) await discover(); }
    finally {
      rebuilding = false;
      if (!stopped) emit({ type: "change", limited });
      if (dirty) changed();
    }
  }

  const ready = discover().finally(() => {
    rebuilding = false;
    announced = true;
    if (dirty) changed();
  });
  return {
    ready,
    get limited() { return limited; },
    close() {
      stopped = true;
      abort.abort();
      if (timer) clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear(); directoryIdentities.clear(); signatures.clear();
    },
  };
}

type Listener = (event: ReviewWatchEvent) => void;
interface SharedWatch {
  listeners: Set<Listener>;
  watcher: ReturnType<typeof startWatch>;
}
const shared = globalThis as typeof globalThis & { __reeveReviewWatches?: Map<string, SharedWatch> };
const watches = shared.__reeveReviewWatches ??= new Map<string, SharedWatch>();

export function subscribeReviewWatch(repository: ReviewWatchRepository, listener: Listener): () => void {
  const subscription: Listener = (event) => listener(event);
  let entry = watches.get(repository.root);
  if (!entry) {
    const listeners = new Set<Listener>();
    entry = { listeners, watcher: startWatch(repository, (event) => {
      for (const subscriber of listeners) subscriber(event);
    }) };
    watches.set(repository.root, entry);
  }
  entry.listeners.add(subscription);
  const owned = entry;
  const watcher = owned.watcher;
  void watcher.ready.then(() => {
    if (owned.listeners.has(subscription)) subscription({ type: "ready", limited: watcher.limited });
  }).catch(() => {
    if (owned.listeners.has(subscription)) subscription({ type: "ready", limited: true });
  });
  return () => {
    owned.listeners.delete(subscription);
    if (!owned.listeners.size) {
      watcher.close();
      if (watches.get(repository.root) === owned) watches.delete(repository.root);
    }
  };
}
