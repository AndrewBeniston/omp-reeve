import { execFile } from "node:child_process";
import { mkdir, lstat, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_TURN_BUDGET,
  spanDiffState,
  storePathFor,
  type TurnBudget,
  type TurnSpan,
  type TurnUnavailableReason,
} from "./review-turn-store";
import { classifyGitFailure } from "./review-git";
import { REVIEW_PER_DIFF_BYTE_CAP } from "./review-limits";

const run = promisify(execFile);

/** The longest any single command may take when no deadline is pressing. */
const COMMAND_CEILING_MS = 10_000;

/** Raised instead of spawning anything once a path's time is gone. */
class DeadlineExpired extends Error {
  constructor() {
    super("The time this capture was given has run out.");
    this.name = "DeadlineExpired";
  }
}

/**
 * What is left of a path's budget, as a command timeout, or nothing to run.
 *
 * A deadline only bounds a path if every command after it is told about it.
 * Give each its own fixed timeout instead and the real bound is their sum,
 * which makes the deadline decoration rather than a limit.
 *
 * Expiry is refused here rather than passed on. A timeout of zero or less
 * means "no timeout at all" to the system, and clamping to a millisecond only
 * spawns a process that is killed immediately — both turn an exhausted budget
 * into more work rather than less.
 */
function commandTimeout(deadlineAt: number | undefined, ceiling = COMMAND_CEILING_MS): number {
  const remaining = deadlineAt === undefined ? ceiling : Math.min(ceiling, deadlineAt - Date.now());
  if (remaining <= 0) throw new DeadlineExpired();
  return remaining;
}

/** True when a path still has time for one more command. */
function withinDeadline(deadlineAt: number | undefined): boolean {
  return deadlineAt === undefined || deadlineAt - Date.now() > 0;
}

export type CaptureResult =
  | { kind: "tree"; tree: string; files: number; bytes: number; skippedPaths: string[]; overlayPaths: string[] }
  | { kind: "unavailable"; reason: TurnUnavailableReason };

interface CaptureOptions {
  repositoryRoot: string;
  /** The private store this capture writes its objects into. */
  storePath: string;
  budget?: TurnBudget;
  /**
   * When the path this capture belongs to must be finished, which can fall
   * sooner than the capture's own budget allows.
   */
  deadlineAt?: number;
  /**
   * Paths the baseline represented as raw working-tree bytes.
   *
   * Given on the closing capture so both sides of an interval describe one
   * file the same way. Without it a file that went back to being clean would
   * be compared against its repository form.
   */
  baselineOverlay?: string[];
}

/**
 * Run Git against Reeve's own store, reading the Project's objects.
 *
 * The alternates variable is a read path, so a capture can resolve the
 * Project's commits and trees while every object it writes lands in the
 * private store. Hooks are disabled on the store and no command here runs one.
 */
/**
 * The Project's object directory.
 *
 * A linked worktree has a `.git` file rather than a directory, so the path
 * cannot be assembled by hand: Git is asked, and it answers with the common
 * object directory the worktree shares with its repository.
 */
export async function projectObjectsDir(repositoryRoot: string, deadlineAt?: number): Promise<string> {
  const plain = { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" };
  const answer = (
    await git(["-c", "core.fsmonitor=false", "-C", repositoryRoot, "rev-parse", "--git-path", "objects"], plain, undefined, deadlineAt)
  ).trim();
  return path.resolve(repositoryRoot, answer);
}

function storeEnvironment(objectsDir: string, indexFile?: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LC_ALL: "C",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: objectsDir,
    ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}),
  };
}

async function git(
  args: string[],
  environment: NodeJS.ProcessEnv,
  cwd?: string,
  deadlineAt?: number,
  maxBuffer = 16 * 1024 * 1024,
): Promise<string> {
  const timeout = commandTimeout(deadlineAt);
  const result = await run("git", ["--literal-pathspecs", ...args], {
    encoding: "utf8",
    env: environment,
    maxBuffer,
    timeout,
    ...(cwd ? { cwd } : {}),
  });
  return result.stdout;
}

export async function ensureObjectStore(store: string, deadlineAt?: number): Promise<string> {
  const options = () => ({ encoding: "utf8" as const, timeout: commandTimeout(deadlineAt) });
  await mkdir(path.dirname(store), { recursive: true });
  await run("git", ["init", "--quiet", "--bare", store], options());
  // Nothing here runs a hook, and a store that cannot run one cannot be made to.
  await run("git", ["--git-dir", store, "config", "core.hooksPath", path.join(store, "no-hooks")], options());
  // Snapshot trees are reachable from no ref, so a collection would take them.
  // Disk is bounded by dropping whole stores instead. See review-turn-store.
  await run("git", ["--git-dir", store, "config", "gc.auto", "0"], options());
  return store;
}

/**
 * Make a span's trees reachable inside the private store.
 *
 * Snapshot trees belong to no branch, so without a ref a prune would take
 * them. A ref per span is also what lets a prune take everything else: an
 * older prompt's objects stop being reachable the moment its span is replaced.
 */
export async function pinSpanTrees(storePath: string, span: TurnSpan, deadlineAt?: number): Promise<void> {
  // A baseline taken from a clean workspace is the Project's own HEAD tree, so
  // it lives in the Project's objects and is reachable here only through the
  // alternates. Without them `update-ref` cannot see the object it is asked to
  // name, and the span's before side would silently go unpinned.
  let environment: NodeJS.ProcessEnv;
  try {
    environment = storeEnvironment(await projectObjectsDir(span.repositoryRoot, deadlineAt));
  } catch {
    return;
  }
  for (const [name, tree] of [["before", span.beforeTree], ["after", span.afterTree]] as const) {
    const ref = `refs/spans/${encodeURIComponent(span.sessionId)}/${name}`;
    if (!withinDeadline(deadlineAt)) return;
    const options = { encoding: "utf8" as const, env: environment, timeout: commandTimeout(deadlineAt) };
    if (tree) await run("git", ["--git-dir", storePath, "update-ref", ref, tree], options).catch(() => undefined);
    else await run("git", ["--git-dir", storePath, "update-ref", "-d", ref], options).catch(() => undefined);
  }
  // A ref that names no live span keeps its objects alive for ever.
  if (!withinDeadline(deadlineAt)) return;
  const listTimeout = commandTimeout(deadlineAt);
  const { stdout } = await run("git", ["--git-dir", storePath, "for-each-ref", "--format=%(refname)", "refs/spans"], {
    encoding: "utf8",
    env: environment,
    timeout: listTimeout,
  }).catch(() => ({ stdout: "" }));
  const keep = new Set([
    `refs/spans/${encodeURIComponent(span.sessionId)}/before`,
    `refs/spans/${encodeURIComponent(span.sessionId)}/after`,
  ]);
  for (const ref of stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (!keep.has(ref) && ref.startsWith(`refs/spans/${encodeURIComponent(span.sessionId)}/`)) {
      if (!withinDeadline(deadlineAt)) return;
      await run("git", ["--git-dir", storePath, "update-ref", "-d", ref], {
        encoding: "utf8", env: environment, timeout: commandTimeout(deadlineAt),
      }).catch(() => undefined);
    }
  }
}

/**
 * Command-line settings that stop a Project's own configuration running during
 * a capture.
 *
 * `git status` compares content, and for a file whose size is unchanged it
 * must hash the working copy — through the repository's clean filter, which is
 * an arbitrary command the project chose. Reading configuration executes
 * nothing, so the driver names are read first and each one's `clean` and
 * `process` is overridden to empty on the command line, where it wins over
 * repository configuration. `core.fsmonitor` is another configured command
 * status may run, so it goes too.
 *
 * The captures on both sides of an interval hash raw bytes, so refusing the
 * filters costs nothing: both trees describe the same unfiltered content.
 */
export async function filterSafetyArguments(repositoryRoot: string, deadlineAt?: number): Promise<string[]> {
  // `core.fsmonitor` can name a program, and a plain status runs it. It is
  // disabled first, so even the configuration read below cannot start one.
  const safety = ["-c", "core.fsmonitor=false"];
  let discovered: string;
  try {
    const { stdout } = await run("git", [...safety, "-C", repositoryRoot, "config", "--get-regexp", "^filter\\..*\\.(clean|process|smudge)$"], {
      encoding: "utf8",
      timeout: commandTimeout(deadlineAt, 5000),
    });
    discovered = stdout;
  } catch (error) {
    if (error instanceof DeadlineExpired) throw error;
    // Git reports "no matching configuration" by exiting 1, which is an empty
    // answer rather than a failure. Any other failure means the drivers were
    // never read, and a capture that cannot see what a Project configures must
    // not go on to run commands that would execute them.
    if ((error as { code?: number | string }).code !== 1) {
      throw new Error("The Project's filter configuration could not be read.");
    }
    return safety;
  }
  const names = new Set<string>();
  for (const line of discovered.split("\n")) {
    const key = line.split(" ")[0];
    const match = /^filter\.(.+)\.(?:clean|process|smudge)$/.exec(key ?? "");
    if (match) names.add(match[1]);
  }
  for (const name of names) {
    safety.push("-c", `filter.${name}.clean=`, "-c", `filter.${name}.process=`, "-c", `filter.${name}.smudge=`);
  }
  return safety;
}

/** A changed path, as Git's porcelain status reports it. */
interface ChangedPath {
  relativePath: string;
  deleted: boolean;
}

async function changedPaths(repositoryRoot: string, safety: string[], deadlineAt?: number): Promise<ChangedPath[]> {
  const output = await git([
    ...safety, "-C", repositoryRoot,
    "status", "--porcelain=v1", "-z", "--untracked-files=all",
    // A submodule holds its own configuration, and descending into one would
    // run that configuration. Its contents are its own repository's business.
    "--ignore-submodules=all",
  ], {
    ...process.env,
    LC_ALL: "C",
    GIT_OPTIONAL_LOCKS: "0",
  }, undefined, deadlineAt);
  const records = output.split("\0").filter(Boolean);
  const paths: ChangedPath[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const codes = record.slice(0, 2);
    const relativePath = record.slice(3);
    // A rename reports its source in the next record; both sides are captured.
    if (codes.startsWith("R") || codes.startsWith("C")) {
      const source = records[index + 1];
      if (source) {
        paths.push({ relativePath: source, deleted: true });
        index += 1;
      }
    }
    paths.push({ relativePath, deleted: codes.includes("D") });
  }
  return paths;
}

/**
 * The workspace as one tree object, without touching the Project.
 *
 * Content is hashed with `--no-filters`, so a clean filter a repository
 * configures never executes: an automatic capture must not run a project's
 * code, trusted or not. The Project's index and working tree are never
 * written; the temporary index lives beside the store.
 */
export async function captureWorkspaceTree(options: CaptureOptions): Promise<CaptureResult> {
  const { repositoryRoot, baselineOverlay } = options;
  const budget = options.budget ?? DEFAULT_TURN_BUDGET;
  const startedAt = Date.now();
  // Whichever falls first: this capture's own budget, or the deadline of the
  // path it serves.
  const deadline = Math.min(startedAt + budget.maxMilliseconds, options.deadlineAt ?? Number.POSITIVE_INFINITY);
  const overdue = () => Date.now() > deadline;
  const store = options.storePath;
  if (overdue()) return { kind: "unavailable", reason: "budget-exceeded" };
  try {
    await ensureObjectStore(store, deadline);
  } catch (error) {
    if (error instanceof DeadlineExpired) return { kind: "unavailable", reason: "budget-exceeded" };
    return { kind: "unavailable", reason: "store-unavailable" };
  }
  const indexFile = path.join(store, `capture-${process.pid}-${startedAt}.index`);
  let environment: NodeJS.ProcessEnv;
  try {
    environment = storeEnvironment(await projectObjectsDir(repositoryRoot, deadline), indexFile);
  } catch {
    return { kind: "unavailable", reason: "not-a-repository" };
  }

  try {
    // One safety set for every command this capture points at the Project:
    // no configured filter, no configured monitor, no submodule descent.
    const safety = await filterSafetyArguments(repositoryRoot, deadline);
    const changed = await changedPaths(repositoryRoot, safety, deadline);
    if (changed.length > budget.maxFiles) return { kind: "unavailable", reason: "budget-exceeded" };
    if (overdue()) return { kind: "unavailable", reason: "budget-exceeded" };

    // A path the baseline holds raw must stay raw here, even where the run put
    // it back the way it was: one file, one representation, on both sides.
    const baseline = new Set(baselineOverlay ?? []);
    const changedNames = new Set(changed.map((entry) => entry.relativePath));
    const realigned = [...baseline].filter((relativePath) => !changedNames.has(relativePath));
    // Where the baseline kept the committed blob, only a path Git cannot
    // convert can be compared against raw bytes now.
    const newlyChanged = changed
      .filter((entry) => !entry.deleted && !baseline.has(entry.relativePath))
      .map((entry) => entry.relativePath);
    const risk = baselineOverlay
      ? await conversionRiskPaths(repositoryRoot, newlyChanged, safety, deadline)
      : { always: new Set<string>(), lineEndings: new Set<string>() };
    const unrepresentable = new Set(risk.always);
    for (const relativePath of risk.lineEndings) {
      if (!(await lineEndingsAreSettled(path.join(repositoryRoot, relativePath)))) unrepresentable.add(relativePath);
    }

    let bytes = 0;
    const skippedPaths: string[] = [];
    const entries: { relativePath: string; mode: string; blob: string }[] = [];
    const removed: string[] = [];

    for (const entry of [...changed, ...realigned.map((relativePath) => ({ relativePath, deleted: false }))]) {
      if (overdue()) return { kind: "unavailable", reason: "budget-exceeded" };
      if (unrepresentable.has(entry.relativePath)) {
        skippedPaths.push(entry.relativePath);
        continue;
      }
      const absolute = path.join(repositoryRoot, entry.relativePath);
      if (entry.deleted) {
        removed.push(entry.relativePath);
        continue;
      }
      let stats;
      try {
        stats = await lstat(absolute);
      } catch {
        removed.push(entry.relativePath);
        continue;
      }
      // A symlink or a directory has no content this capture can represent.
      if (!stats.isFile()) {
        skippedPaths.push(entry.relativePath);
        continue;
      }
      bytes += stats.size;
      if (bytes > budget.maxBytes) return { kind: "unavailable", reason: "budget-exceeded" };
      const blob = (await git(["--git-dir", store, "hash-object", "-w", "--no-filters", "--", absolute], environment, undefined, deadline)).trim();
      entries.push({ relativePath: entry.relativePath, mode: stats.mode & 0o111 ? "100755" : "100644", blob });
    }

    const head = await git([...safety, "-C", repositoryRoot, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"], {
      ...process.env,
      LC_ALL: "C",
    }, undefined, deadline).catch(() => "");
    await rm(indexFile, { force: true });
    if (head.trim()) await git(["--git-dir", store, "read-tree", head.trim()], environment, undefined, deadline);
    for (const entry of entries) {
      await git(["--git-dir", store, "update-index", "--add", "--cacheinfo", `${entry.mode},${entry.blob},${entry.relativePath}`], environment, undefined, deadline);
    }
    for (const relativePath of removed) {
      // `--force-remove` refuses outside a work tree ("this operation must be
      // run in a work tree"), and the failure is silent here, so without the
      // work tree a deleted file stays in the captured tree and the deletion
      // vanishes from the turn. Only the index is written; the Project's files
      // are never touched.
      await git(
        ["--git-dir", store, "--work-tree", repositoryRoot, "update-index", "--force-remove", "--", relativePath],
        environment,
        repositoryRoot,
        deadline,
      ).catch(() => "");
    }
    const tree = (await git(["--git-dir", store, "write-tree"], environment, undefined, deadline)).trim();
    return {
      kind: "tree",
      tree,
      files: entries.length,
      bytes,
      skippedPaths,
      overlayPaths: entries.map((entry) => entry.relativePath),
    };
  } catch (error) {
    if (error instanceof DeadlineExpired) return { kind: "unavailable", reason: "budget-exceeded" };
    return { kind: "unavailable", reason: "capture-failed" };
  } finally {
    await rm(indexFile, { force: true });
  }
}

/**
 * The patch between two captured trees.
 *
 * This is an interval, not an attribution: it reports what changed in the
 * workspace between the two moments, including anything a shell command or a
 * person outside Reeve changed while the prompt ran.
 */
export async function diffCapturedTrees(options: {
  repositoryRoot: string;
  storePath: string;
  beforeTree: string;
  afterTree: string;
  relativeCwd?: string;
  /**
   * Restrict the patch to these paths. Given by attribution, so a change the
   * run cannot be held to is left out rather than drawn as its work.
   */
  paths?: string[];
  /** Lowered by tests. The cap every other Review scope reads at once. */
  byteCap?: number;
}): Promise<{ kind: "patch"; patch: string } | { kind: "unavailable"; reason: TurnUnavailableReason }> {
  const store = options.storePath;
  let environment: NodeJS.ProcessEnv;
  try {
    environment = storeEnvironment(await projectObjectsDir(options.repositoryRoot));
  } catch {
    return { kind: "unavailable", reason: "baseline-missing" };
  }
  const scope = options.relativeCwd && options.relativeCwd !== "." ? options.relativeCwd : null;
  // A restriction and a directory are both narrowing, so they narrow together:
  // given as two pathspecs Git would union them and show the whole directory.
  const restricted = options.paths?.filter((entry) => !scope || entry === scope || entry.startsWith(scope + "/"));
  // An empty restriction is not "no restriction": it means nothing here is the
  // run's work, and the patch must be empty rather than whole.
  if (restricted && restricted.length === 0) return { kind: "patch", patch: "" };
  const pathspec = restricted ? ["--", ...restricted] : scope ? ["--", scope] : [];
  try {
    const patch = await git([
      // The same rendering the Git-backed scopes use, so one file has one
      // identity across them and a comment written in one still belongs here.
      // `--no-textconv` and `--no-ext-diff` also keep a program the Project
      // configured from running while a diff is drawn.
      "--git-dir", store, "diff-tree", "-p", "--no-color", "--no-ext-diff", "--no-textconv", "--full-index",
      "--find-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/",
      options.beforeTree, options.afterTree, ...pathspec,
    ], environment, undefined, undefined, options.byteCap ?? REVIEW_PER_DIFF_BYTE_CAP);
    return { kind: "patch", patch };
  } catch (error) {
    // A turn larger than one read is the same refusal the other scopes give,
    // with the same message and status, rather than a record that reads as
    // though its snapshot had gone. Raised rather than returned, because this
    // reason belongs to the Git-read union the route already answers from.
    const classified = classifyGitFailure(error);
    if (classified) throw classified;
    return { kind: "unavailable", reason: "baseline-missing" };
  }
}

/**
 * The interval a span recorded, ready for a reader.
 *
 * A span whose pair of trees cannot be trusted is refused here rather than
 * diffed into an empty patch, which a reader would show as nothing having
 * changed.
 */
export async function diffSpan(
  span: TurnSpan,
  options?: { relativeCwd?: string; agentDir?: string; paths?: string[] },
): Promise<{ kind: "patch"; patch: string } | { kind: "unavailable"; reason: TurnUnavailableReason }> {
  const state = spanDiffState(span);
  if (state.kind === "unavailable") return state;
  return diffCapturedTrees({
    repositoryRoot: span.repositoryRoot,
    storePath: storePathFor(span, options?.agentDir),
    beforeTree: state.beforeTree,
    afterTree: state.afterTree,
    ...(options?.relativeCwd ? { relativeCwd: options.relativeCwd } : {}),
    ...(options?.paths ? { paths: options.paths } : {}),
  });
}

/**
 * Every path the interval touched, and the content it ends on.
 *
 * The closing hash is what attribution compares a recorded write against, so a
 * file somebody wrote after the run did stops matching. Renames are not
 * detected here on purpose: a rename that is reported as one change would hide
 * the second path, and both sides have to be accounted for separately.
 */
export async function intervalEntries(
  span: TurnSpan,
  options?: { agentDir?: string; byteCap?: number },
): Promise<
  { kind: "entries"; entries: { path: string; afterHash: string | null }[] }
  | { kind: "unavailable"; reason: TurnUnavailableReason }
> {
  const state = spanDiffState(span);
  if (state.kind === "unavailable") return state;
  const store = storePathFor(span, options?.agentDir);
  let environment: NodeJS.ProcessEnv;
  try {
    environment = storeEnvironment(await projectObjectsDir(span.repositoryRoot));
  } catch {
    return { kind: "unavailable", reason: "baseline-missing" };
  }
  let output: string;
  try {
    output = await git([
      "--git-dir", store, "diff-tree", "-r", "--raw", "-z", "--no-renames",
      state.beforeTree, state.afterTree,
    ], environment, undefined, undefined, options?.byteCap ?? REVIEW_PER_DIFF_BYTE_CAP);
  } catch (error) {
    const classified = classifyGitFailure(error);
    if (classified) throw classified;
    return { kind: "unavailable", reason: "baseline-missing" };
  }
  // Raw records arrive as a metadata field, then the path, each ending in NUL:
  // ":<srcmode> <dstmode> <srcsha> <dstsha> <status>\0<path>\0".
  const fields = output.split("\0").filter((field) => field.length > 0);
  const entries: { path: string; afterHash: string | null }[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const meta = fields[index];
    const path = fields[index + 1];
    if (!meta.startsWith(":")) continue;
    const destination = meta.slice(1).split(" ")[3] ?? "";
    // An all-zero hash is Git saying the file is not there on that side.
    entries.push({ path, afterHash: /[^0]/.test(destination) ? destination : null });
  }
  return { kind: "entries", entries };
}

/**
 * What a captured tree holds for one path, or nothing where it holds no such
 * file.
 *
 * This is the trusted state a run starts from: before a tool is allowed to
 * claim a file, the file on disk has to still hold what the run was last known
 * to leave there — and for the first touch, that is whatever the baseline took.
 * Failure is reported as failure rather than as an absent file, because the two
 * lead to opposite conclusions.
 */
export async function blobHashInTree(options: {
  repositoryRoot: string;
  storePath: string;
  tree: string;
  relativePath: string;
}): Promise<{ kind: "hash"; hash: string } | { kind: "absent" } | { kind: "unreadable" }> {
  let environment: NodeJS.ProcessEnv;
  try {
    environment = storeEnvironment(await projectObjectsDir(options.repositoryRoot));
  } catch {
    return { kind: "unreadable" };
  }
  try {
    const output = await git(
      ["--git-dir", options.storePath, "rev-parse", "--verify", "--quiet", options.tree + ":" + options.relativePath],
      environment,
    );
    const hash = output.trim();
    return hash ? { kind: "hash", hash } : { kind: "absent" };
  } catch (error) {
    // Git answers "no such path in this tree" by exiting 1 with nothing to say.
    return (error as { code?: number | string }).code === 1 ? { kind: "absent" } : { kind: "unreadable" };
  }
}
/**
 * Paths whose repository form may differ from their bytes on disk.
 *
 * Git stores a converted form: line endings, a working-tree encoding, or a
 * filter driver can all make a file that Git calls clean hold different bytes
 * from its blob. A baseline that reuses the committed blob is only faithful
 * where no conversion applies, so the paths where one might are named here and
 * left out rather than diffed against a form they never had. `check-attr`
 * reads attributes; it runs no filter.
 */
export interface ConversionRisk {
  /** Git may rewrite these bytes in a way this capture cannot reproduce. */
  always: Set<string>;
  /** Only line endings are at stake, which the content itself can settle. */
  lineEndings: Set<string>;
}

export async function conversionRiskPaths(repositoryRoot: string, paths: string[], safety: string[] = ["-c", "core.fsmonitor=false"], deadlineAt?: number): Promise<ConversionRisk> {
  const always = new Set<string>();
  const lineEndings = new Set<string>();
  if (paths.length === 0) return { always, lineEndings };
  const plain = { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" };
  const setting = async (key: string) =>
    (await git([...safety, "-C", repositoryRoot, "config", "--get", key], plain, undefined, deadlineAt).catch(() => "")).trim().toLowerCase();
  const autocrlf = await setting("core.autocrlf");
  const eol = await setting("core.eol");
  // A repository-wide conversion reaches every file, so none can be trusted
  // to hold its committed bytes.
  if (autocrlf === "true" || autocrlf === "input" || eol === "crlf") {
    for (const relativePath of paths) always.add(relativePath);
    return { always, lineEndings };
  }

  // Paths go as arguments rather than on stdin: an argument list is bounded
  // here by the capture budget, and a reader that waits on stdin would hang.
  for (let start = 0; start < paths.length; start += 200) {
    const batch = paths.slice(start, start + 200);
    // Out of time: the rest cannot be examined, and a path that was not
    // examined is treated as one Git might convert rather than assumed safe.
    if (!withinDeadline(deadlineAt)) {
      for (const relativePath of paths.slice(start)) always.add(relativePath);
      return { always, lineEndings };
    }
    const result = await run("git", [
      ...safety, "-C", repositoryRoot, "check-attr", "-z", "text", "eol", "working-tree-encoding", "filter", "--", ...batch,
    ], { encoding: "utf8", env: plain, maxBuffer: 16 * 1024 * 1024, timeout: commandTimeout(deadlineAt) }).catch(() => null);
    // A batch that cannot be read is treated as convertible, never as safe.
    if (!result) {
      for (const relativePath of batch) always.add(relativePath);
      continue;
    }
    const fields = result.stdout.split("\0");
    for (let index = 0; index + 2 < fields.length; index += 3) {
      const [filePath, attribute, value] = [fields[index], fields[index + 1], fields[index + 2]];
      if (!value || value === "unspecified" || value === "unset") continue;
      // A filter or an encoding rewrites content arbitrarily. `text` and `eol`
      // only decide line endings.
      if (attribute === "filter" || attribute === "working-tree-encoding") always.add(filePath);
      else lineEndings.add(filePath);
    }
  }
  return { always, lineEndings };
}

/**
 * Whether a file's own bytes settle the line-ending question.
 *
 * With no carriage return present, Git's normalisation is a no-op, so the
 * committed blob and these bytes are the same text and both sides of an
 * interval agree. A file that does hold carriage returns is left out: its
 * form at the baseline cannot be recovered without running checkout or a
 * filter, and a guess there would invent a change.
 */
async function lineEndingsAreSettled(absolutePath: string): Promise<boolean> {
  try {
    return !(await readFile(absolutePath)).includes(0x0d);
  } catch {
    return false;
  }
}
