import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import type { TurnProvenance } from "./review-turn-attribution";

const run = promisify(execFile);

/**
 * Where Review keeps the before and after state of a prompt.
 *
 * Everything lives under the agent directory, never in the Project. More than
 * one Reeve can share that directory — a development server and a packaged
 * application run side by side — so the record of a run is written once, under
 * an identifier no other run uses, and is never rewritten by anyone else. A
 * session keeps a separate pointer naming its current run, so two processes
 * working one session can overwrite which run is current without either
 * destroying the other's record or its objects.
 *
 * Each run owns a store directory no other run touches. Collection takes whole
 * stores, so no process removes an object another is writing, and nothing here
 * needs a lock.
 */
export interface TurnBudget {
  maxFiles: number;
  maxBytes: number;
  maxMilliseconds: number;
}

/** What one capture may read before it gives up. */
export const DEFAULT_TURN_BUDGET: TurnBudget = {
  maxFiles: 2000,
  maxBytes: 64 * 1024 * 1024,
  maxMilliseconds: 4000,
};

/**
 * What the whole opening path may take: finding the repository, creating the
 * store, capturing, and recording. The capture budget above bounds one command
 * sequence rather than the path, so the deadline is carried through and tested
 * between stages.
 */
export const OPEN_DEADLINE_MS = 10_000;
/** The same bound for the closing capture. */
export const CLOSE_DEADLINE_MS = 10_000;

export const MAX_RETAINED_RUNS = 64;
/**
 * What the stores should occupy. This is a target rather than a ceiling: a run
 * whose owner is alive, or whose owner cannot be questioned, is never
 * collected, so a machine with many live runs can sit above it.
 */
export const TARGET_TOTAL_STORE_BYTES = 512 * 1024 * 1024;
/** Retention walks the stores at most this often, and never on the way into a prompt. */
export const RETENTION_INTERVAL_MS = 5 * 60 * 1000;
export type TurnUnavailableReason =
  | "not-a-repository"
  | "budget-exceeded"
  | "capture-failed"
  | "baseline-missing"
  /** The snapshot store could not be created or written. */
  | "store-unavailable"
  /** The run never reported a terminal end, so no end state was taken. */
  | "unsettled"
  /** The prompt is still open, or the process that was recording it stopped. */
  | "in-progress";

export type TurnSpanStatus = "running" | "completed" | "interrupted" | "failed" | "superseded";

/**
 * The process that opened a run.
 *
 * A process identifier alone is not an identity: the system reuses numbers.
 * Beside it sits the moment the system says that process began, read from the
 * system and kept exactly as it was given. Comparing those two strings is what
 * tells one process from the next to inherit its number.
 */
export interface SpanOwner {
  host: string;
  pid: number;
  /** Absent when the system could not be asked, which keeps the run forever. */
  birth?: string;
}

export interface TurnSpan {
  /** Unique to this run, and the name of the store holding its objects. */
  runId: string;
  sessionId: string;
  promptId: string;
  cwd: string;
  repositoryRoot: string;
  startedAt: string;
  endedAt?: string;
  status: TurnSpanStatus;
  owner: SpanOwner;
  beforeTree?: string;
  afterTree?: string;
  unavailable?: TurnUnavailableReason;
  /** Files the capture could not represent faithfully. */
  skippedPaths?: string[];
  /** Paths the baseline holds as raw bytes, so the closing capture matches it. */
  overlayPaths?: string[];
  /**
   * Where the Session's own directory sits inside the repository, as a path.
   *
   * A tool names a file relative to the Session's directory, and the interval
   * names it relative to the repository. The two are joined by this, which is
   * resolved once when the run opens: the Session's directory can be a symlink
   * to the repository, and comparing the two paths as given would put every
   * file the run wrote outside the repository it is in. Empty when the Session
   * stands at the top of it.
   */
  cwdPrefix?: string;
  /**
   * What the run itself did, as its tool executions reported it.
   *
   * Absent on a run recorded before this was kept, which is why a reader
   * refuses such a run rather than showing its interval: an interval with
   * nothing to attribute it to cannot be told from somebody else's work.
   */
  provenance?: TurnProvenance;
}

export function reviewTurnDir(agentDir = getAgentDir()): string {
  return path.join(agentDir, "review-turns");
}

function runsDir(agentDir: string): string {
  return path.join(reviewTurnDir(agentDir), "runs");
}

function sessionsDir(agentDir: string): string {
  return path.join(reviewTurnDir(agentDir), "sessions");
}

function storesDir(agentDir: string): string {
  return path.join(reviewTurnDir(agentDir), "stores");
}

function fileSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

function runFile(runId: string, agentDir: string): string {
  return path.join(runsDir(agentDir), runId + ".json");
}

function sessionFile(sessionId: string, agentDir: string): string {
  return path.join(sessionsDir(agentDir), fileSafe(sessionId) + ".json");
}

/** An identifier no other run uses, however many processes share the directory. */
export function newRunId(sessionId: string): string {
  return fileSafe(sessionId) + "-" + randomUUID();
}

export function storePathFor(span: { runId: string }, agentDir = getAgentDir()): string {
  return path.join(storesDir(agentDir), span.runId + ".git");
}

/**
 * When the system says a process began.
 *
 * Read as an absolute moment rather than an age, and compared later exactly as
 * it was given. An age has to be subtracted from the current clock to mean
 * anything, and a clock that is corrected or a machine that sleeps moves that
 * arithmetic underneath a live process. The recorded start does not move: the
 * system keeps it from the moment of birth, whatever happens to the clock
 * afterwards. Time zone and language are pinned because they are what the
 * formatting depends on.
 */
type ProcessBirth = { kind: "born"; at: string } | { kind: "absent" } | { kind: "unknown" };

async function processBirth(pid: number): Promise<ProcessBirth> {
  try {
    const { stdout } = await run("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
    });
    const at = stdout.trim();
    return at ? { kind: "born", at } : { kind: "absent" };
  } catch (error) {
    // A plain refusal means the system knows no such process. Anything else —
    // no `ps`, no permission, a timeout — answers nothing.
    return (error as { code?: number | string }).code === 1 ? { kind: "absent" } : { kind: "unknown" };
  }
}

/** Asked once: a process's own birth cannot change while it runs. */
let ownBirth: Promise<ProcessBirth> | undefined;

export async function currentOwner(): Promise<SpanOwner> {
  ownBirth ??= processBirth(process.pid);
  const birth = await ownBirth;
  return { host: hostname(), pid: process.pid, ...(birth.kind === "born" ? { birth: birth.at } : {}) };
}

/**
 * Whether a run's owner is certainly gone.
 *
 * Only two answers are evidence of death: the system knows no process of that
 * number, or it knows one whose recorded birth differs from the birth recorded
 * here — a different process that inherited the number. Everything else keeps
 * the run. A machine that cannot be questioned, a system without `ps`, or a
 * record made before a birth could be read all fail closed, because collecting
 * a store a capture is still writing is the one outcome worth avoiding.
 */
export async function ownerIsGone(owner: SpanOwner | undefined): Promise<boolean> {
  if (!owner || owner.host !== hostname()) return false;
  const birth = await processBirth(owner.pid);
  if (birth.kind === "absent") return true;
  if (birth.kind === "unknown" || !owner.birth) return false;
  return birth.at !== owner.birth;
}

async function replaceFile(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = target + "." + process.pid + "." + randomUUID() + ".tmp";
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, target);
}

/**
 * Record one run.
 *
 * The file is named by the run, so only the process that opened it ever writes
 * here and no other process's record can be lost. It is also written before
 * the run's store directory exists, which is what lets retention list the
 * stores first and still never see a store being created as unclaimed.
 */
export async function writeSpan(span: TurnSpan, agentDir = getAgentDir()): Promise<void> {
  await replaceFile(runFile(span.runId, agentDir), JSON.stringify(span, null, 2));
}

/** Point a session at the run that is now current for it. */
export async function setSessionRun(sessionId: string, runId: string, agentDir = getAgentDir()): Promise<void> {
  await replaceFile(sessionFile(sessionId, agentDir), JSON.stringify({ runId }, null, 2));
}

export async function readRun(runId: string, agentDir = getAgentDir()): Promise<TurnSpan | null> {
  try {
    return JSON.parse(await readFile(runFile(runId, agentDir), "utf8")) as TurnSpan;
  } catch {
    return null;
  }
}

/** The run a session currently points at, if its record is still there. */
export async function readSpan(sessionId: string, agentDir = getAgentDir()): Promise<TurnSpan | null> {
  try {
    const pointer = JSON.parse(await readFile(sessionFile(sessionId, agentDir), "utf8")) as { runId?: string };
    return pointer.runId ? await readRun(pointer.runId, agentDir) : null;
  } catch {
    return null;
  }
}

export async function readRuns(agentDir = getAgentDir()): Promise<TurnSpan[]> {
  const names = await readdir(runsDir(agentDir)).catch(() => [] as string[]);
  const spans: TurnSpan[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const raw = await readFile(path.join(runsDir(agentDir), name), "utf8").catch(() => "");
    try {
      const span = JSON.parse(raw) as TurnSpan;
      if (span?.runId && span.sessionId) spans.push(span);
    } catch {
      // A record mid-replacement or edited by hand is not a run.
    }
  }
  return spans;
}

/**
 * What a reader may do with a run.
 *
 * A run still marked running has no end state, whether its prompt is in flight
 * or the process recording it stopped. Either way it is unavailable, and never
 * a finished interval.
 */
export function spanDiffState(
  span: TurnSpan,
): { kind: "ready"; beforeTree: string; afterTree: string } | { kind: "unavailable"; reason: TurnUnavailableReason } {
  if (span.status === "running") return { kind: "unavailable", reason: "in-progress" };
  if (span.unavailable) return { kind: "unavailable", reason: span.unavailable };
  if (!span.beforeTree || !span.afterTree) return { kind: "unavailable", reason: "baseline-missing" };
  return { kind: "ready", beforeTree: span.beforeTree, afterTree: span.afterTree };
}

function retentionStampPath(agentDir: string): string {
  return path.join(reviewTurnDir(agentDir), "retention.json");
}

/** True when retention has not run for {@link RETENTION_INTERVAL_MS}. */
export async function retentionIsDue(agentDir = getAgentDir()): Promise<boolean> {
  const age = await stat(retentionStampPath(agentDir)).then(
    (stats) => Date.now() - stats.mtimeMs,
    () => Number.POSITIVE_INFINITY,
  );
  return age > RETENTION_INTERVAL_MS;
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const next = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(next);
    else total += await stat(next).then((stats) => stats.size, () => 0);
  }
  return total;
}

async function dropRun(span: TurnSpan, agentDir: string): Promise<void> {
  await rm(runFile(span.runId, agentDir), { force: true });
  await rm(storePathFor(span, agentDir), { recursive: true, force: true });
}

/** A run a process may still be writing into is never collected. */
async function collectable(span: TurnSpan): Promise<boolean> {
  return span.status !== "running" || (await ownerIsGone(span.owner));
}

/**
 * Bound what the snapshots occupy, in one pass, after a prompt has closed.
 *
 * The unit of collection is a whole store, so nothing here reads or removes an
 * individual object and no Git command runs. The stores are listed before the
 * runs that claim them: a store created after that listing is not a candidate,
 * and since a store is only created after its run record is written, a capture
 * in flight is never collected. Every run record claims its store, so a run
 * another process opened is claimed too, whatever a session pointer says.
 */
export async function runRetention(
  agentDir = getAgentDir(),
  /** Lowered by tests, so a budget can be reached without writing one. */
  limits?: { maxRuns?: number; maxBytes?: number },
): Promise<void> {
  const maxRuns = limits?.maxRuns ?? MAX_RETAINED_RUNS;
  const maxBytes = limits?.maxBytes ?? TARGET_TOTAL_STORE_BYTES;
  await mkdir(reviewTurnDir(agentDir), { recursive: true });
  await writeFile(retentionStampPath(agentDir), new Date().toISOString(), { mode: 0o600 }).catch(() => undefined);

  const stores = await readdir(storesDir(agentDir)).catch(() => [] as string[]);
  const spans = await readRuns(agentDir);
  const claimed = new Set(spans.map((span) => span.runId + ".git"));
  for (const name of stores) {
    if (claimed.has(name)) continue;
    await rm(path.join(storesDir(agentDir), name), { recursive: true, force: true }).catch(() => undefined);
  }

  const kept: TurnSpan[] = [];
  for (const span of [...spans].sort((left, right) => right.startedAt.localeCompare(left.startedAt))) {
    if (kept.length >= maxRuns && (await collectable(span))) {
      await dropRun(span, agentDir).catch(() => undefined);
      continue;
    }
    kept.push(span);
  }

  const sized: { span: TurnSpan; bytes: number }[] = [];
  let total = 0;
  for (const span of kept) {
    const bytes = await directorySize(storePathFor(span, agentDir));
    total += bytes;
    sized.push({ span, bytes });
  }
  if (total > maxBytes) {
    for (const entry of sized.sort((left, right) => left.span.startedAt.localeCompare(right.span.startedAt))) {
      if (total <= maxBytes) break;
      if (!(await collectable(entry.span))) continue;
      await dropRun(entry.span, agentDir).catch(() => undefined);
      total -= entry.bytes;
    }
  }

  // A pointer to a run that is gone would read as a session with no record at
  // all, which is what it now is.
  const remaining = new Set((await readRuns(agentDir)).map((span) => span.runId));
  for (const name of await readdir(sessionsDir(agentDir)).catch(() => [] as string[])) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(sessionsDir(agentDir), name);
    const raw = await readFile(file, "utf8").catch(() => "");
    try {
      const pointer = JSON.parse(raw) as { runId?: string };
      if (!pointer.runId || !remaining.has(pointer.runId)) await rm(file, { force: true });
    } catch {
      await rm(file, { force: true }).catch(() => undefined);
    }
  }
}
