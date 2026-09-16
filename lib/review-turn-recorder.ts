import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { blobHashInTree, captureWorkspaceTree, pinSpanTrees, type CaptureResult } from "./review-turn-capture";
import {
  isCurrentProvenance,
  readToolOutcome,
  TURN_PROVENANCE_VERSION,
  type TurnProvenance,
} from "./review-turn-attribution";
import {
  IDLE_TURN_LIFECYCLE,
  isAwaitingSettle,
  stepTurnLifecycle,
  type TurnLifecycleClose,
  type TurnLifecycleEvent,
  type TurnLifecycleState,
  type TurnToolEvent,
} from "./review-turn-spans";
import {
  CLOSE_DEADLINE_MS,
  OPEN_DEADLINE_MS,
  currentOwner,
  newRunId,
  readRun,
  readSpan,
  retentionIsDue,
  runRetention,
  setSessionRun,
  storePathFor,
  writeSpan,
  type TurnSpan,
  type TurnUnavailableReason,
} from "./review-turn-store";

const run = promisify(execFile);

/**
 * How long a prompt may wait for the half of its ending that has not arrived
 * before Review stops expecting it.
 */
export const SETTLE_TIMEOUT_MS = 60 * 1000;

/**
 * What one run may record before recording stops being the whole truth.
 *
 * A run that writes more than this is marked as overflowed rather than
 * truncated, because a partial record would attribute a subset and quietly
 * drop the rest into somebody else's column.
 */
const MAX_RECORDED_WRITES = 2000;

/**
 * Records what a workspace looked like before and after each prompt.
 *
 * Every path is total. A capture that fails, a directory outside a repository,
 * or a workspace over budget records why it has nothing rather than recording
 * nothing at all: a prompt must never fail because Review wanted a snapshot,
 * and a reader must never be left guessing.
 *
 * One session's events are applied one at a time, in the order they were
 * handed over, and each carries the generation of the session it belonged to.
 * Ending a session raises that generation, so a queued event or a timer from
 * the run before it cannot touch the run after it.
 */
interface SessionRecord {
  state: TurnLifecycleState;
  span?: TurnSpan;
  queue: Promise<void>;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  /** Arguments of calls still running, held until their results arrive. */
  pendingTools?: Map<string, unknown>;
  /**
   * What the run is last known to have left at each path it wrote.
   *
   * A tool may claim a file only if the file still holds this when it starts.
   * Seeded from the interval's own baseline the first time a path is touched.
   */
  trusted?: Map<string, string | null>;
}

const sessions = new Map<string, SessionRecord>();
/** Never reused, so a generation from a destroyed session matches no later one. */
let nextGeneration = 1;

function recordFor(sessionId: string): SessionRecord {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const created: SessionRecord = {
    state: IDLE_TURN_LIFECYCLE,
    queue: Promise.resolve(),
    generation: nextGeneration,
  };
  nextGeneration += 1;
  sessions.set(sessionId, created);
  return created;
}

type RepositoryRoot = { kind: "root"; root: string } | { kind: "unavailable"; reason: TurnUnavailableReason };

async function repositoryRootFor(cwd: string, timeout: number): Promise<RepositoryRoot> {
  if (timeout <= 0) return { kind: "unavailable", reason: "budget-exceeded" };
  try {
    const { stdout } = await run("git", ["-c", "core.fsmonitor=false", "-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout,
    });
    const root = stdout.trim();
    return root ? { kind: "root", root } : { kind: "unavailable", reason: "not-a-repository" };
  } catch (error) {
    // Killed means the deadline took it, not that the directory is unmanaged.
    const killed = (error as { killed?: boolean }).killed === true;
    return { kind: "unavailable", reason: killed ? "budget-exceeded" : "not-a-repository" };
  }
}

async function capture(options: Parameters<typeof captureWorkspaceTree>[0]): Promise<CaptureResult> {
  try {
    return await captureWorkspaceTree(options);
  } catch {
    return { kind: "unavailable", reason: "capture-failed" };
  }
}

/** Bound the snapshots, after a prompt has ended and never on its way in. */
async function maybeRunRetention(agentDir?: string): Promise<void> {
  try {
    if (!(await retentionIsDue(agentDir))) return;
    await runRetention(agentDir);
  } catch {
    // Bounding disk is not worth interrupting a session for.
  }
}

/**
 * The lifecycle event an SDK event stands for, if any.
 *
 * `isTerminal` is optional on the wire and absent means terminal: the field is
 * documented as "False when an async delivery will resume the session", the
 * only emitter of a public `agent_end` always sets it, and every consumer
 * inside the SDK tests it against `false` rather than for presence. Reading
 * absence as terminal is therefore the SDK's own convention rather than a
 * guess, and a run that starts again clears the end regardless.
 */
export function turnEventForAgentEvent(event: { type: string; isTerminal?: boolean }): TurnLifecycleEvent | null {
  if (event.type === "agent_start") return { type: "agent_started" };
  if (event.type === "agent_end") return { type: "agent_ended", terminal: event.isTerminal !== false };
  return null;
}

/**
 * The tool execution an SDK event stands for, if any.
 *
 * Only the two ends matter. The update in between repeats the arguments of a
 * call already open, and acting on it would record the same write twice.
 */
export function turnToolEventForAgentEvent(event: {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}): TurnToolEvent | null {
  if (!event.toolCallId || !event.toolName) return null;
  if (event.type === "tool_execution_start") {
    return { type: "tool_started", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args };
  }
  if (event.type === "tool_execution_end") {
    return {
      type: "tool_ended",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      result: event.result,
      isError: event.isError === true,
    };
  }
  return null;
}

export function noteTurnLifecycle(
  sessionId: string,
  cwd: string,
  event: TurnLifecycleEvent | TurnToolEvent,
  /** Overridden by tests, which must never write into the real agent directory. */
  agentDir?: string,
): Promise<void> {
  const record = recordFor(sessionId);
  const generation = record.generation;
  // The chain is taken synchronously, so events queue in the order they were
  // raised however long each one takes to record.
  const applied = record.queue.then(() => apply(sessionId, cwd, event, agentDir, generation)).catch(() => undefined);
  record.queue = applied;
  return applied;
}

async function apply(
  sessionId: string,
  cwd: string,
  event: TurnLifecycleEvent | TurnToolEvent,
  agentDir: string | undefined,
  generation: number,
): Promise<void> {
  const record = sessions.get(sessionId);
  if (!record || record.generation !== generation) return;

  if (event.type === "tool_started" || event.type === "tool_ended") {
    await recordToolExecution(record, event, agentDir);
    return;
  }

  const decision = stepTurnLifecycle(record.state, event);
  record.state = decision.state;

  if (decision.close) {
    const span = record.span ?? (await readSpan(sessionId, agentDir));
    record.span = undefined;
    if (span && span.promptId === decision.close.promptId) await closeSpan(span, decision.close, agentDir);
    void maybeRunRetention(agentDir);
  }

  if (decision.open) record.span = await openSpan(sessionId, cwd, decision.open.promptId, agentDir, generation);

  if (isAwaitingSettle(record.state)) armSettleTimer(sessionId, cwd, agentDir, generation);
  else clearSettleTimer(record);
}

async function openSpan(
  sessionId: string,
  cwd: string,
  promptId: string,
  agentDir: string | undefined,
  generation: number,
): Promise<TurnSpan> {
  const deadlineAt = Date.now() + OPEN_DEADLINE_MS;
  const opening: TurnSpan = {
    runId: newRunId(sessionId),
    sessionId,
    promptId,
    cwd,
    repositoryRoot: cwd,
    startedAt: new Date().toISOString(),
    status: "running",
    owner: await currentOwner(),
    // Empty from the moment the run opens, so a run that executed no tool is
    // a run that is known to have written nothing — which is not the same as
    // a run recorded before any of this was kept, and must not read like one.
    provenance: { version: TURN_PROVENANCE_VERSION, writes: [], opaqueTools: [] },
  };

  const located = await repositoryRootFor(cwd, deadlineAt - Date.now());
  if (located.kind === "unavailable") {
    const span: TurnSpan = { ...opening, unavailable: located.reason };
    await publishRun(span, agentDir, generation);
    return span;
  }
  opening.repositoryRoot = located.root;
  // Resolved here, once, while the run is opening: every tool path afterwards
  // is joined onto it rather than compared against a directory that may be an
  // alias of the repository.
  const realCwd = await realpath(cwd).catch(() => cwd);
  const prefix = path.relative(located.root, realCwd);
  opening.cwdPrefix = prefix && !prefix.startsWith("..") && !path.isAbsolute(prefix) ? prefix : "";

  // The record claiming the store is written before the store exists, so
  // retention can never find that directory unclaimed. It also means a process
  // that dies mid-capture leaves a run that reads as unavailable rather than
  // leaving no record at all. The run this one replaces keeps its record and
  // its objects: another process may be part-way through it, and retention is
  // the only thing that decides a store is finished with.
  await publishRun(opening, agentDir, generation);

  const before = await capture({
    repositoryRoot: located.root,
    storePath: storePathFor(opening, agentDir),
    deadlineAt,
  });
  const span: TurnSpan = {
    ...opening,
    ...(before.kind === "tree"
      ? {
          beforeTree: before.tree,
          overlayPaths: before.overlayPaths,
          ...(before.skippedPaths.length ? { skippedPaths: before.skippedPaths } : {}),
        }
      : { unavailable: before.reason }),
  };
  // Only the record is updated here. Publishing again would let a capture that
  // finished after another run opened point the Session back at itself.
  await writeSpan(span, agentDir).catch(() => undefined);
  if (span.beforeTree) await pinSpanTrees(storePathFor(span, agentDir), span, deadlineAt).catch(() => undefined);
  return span;
}

/**
 * Publication, serialised by Session rather than by record.
 *
 * Opening a run takes time — the owner is asked of the system, the repository
 * is resolved, the record is written — and a Session can be destroyed and
 * started again inside that window. The replacement gets a fresh record with a
 * queue of its own, so nothing about the record it replaced holds it back: its
 * run can open and publish while the earlier one is still opening. One chain
 * per Session identifier keeps the two in a line, and the generation is tested
 * inside that chain, after the record is written and immediately before the
 * pointer moves, so the run belonging to the Session as it now stands is the
 * one the pointer ends on.
 *
 * Between processes the rule is unchanged and deliberately weaker: whoever
 * opens last wins, and no record is lost either way.
 */
const publications = new Map<string, Promise<void>>();

function publishRun(span: TurnSpan, agentDir: string | undefined, generation: number): Promise<void> {
  const queued = (publications.get(span.sessionId) ?? Promise.resolve())
    .then(async () => {
      await writeSpan(span, agentDir).catch(() => undefined);
      // Tested here rather than on the way in: the write above is itself a
      // wait, and a Session replaced during it has already published its own.
      if (sessions.get(span.sessionId)?.generation !== generation) return;
      await setSessionRun(span.sessionId, span.runId, agentDir).catch(() => undefined);
    })
    .catch(() => undefined);
  publications.set(span.sessionId, queued);
  void queued.then(() => {
    if (publications.get(span.sessionId) === queued) publications.delete(span.sessionId);
  });
  return queued;
}

async function closeSpan(span: TurnSpan, close: TurnLifecycleClose, agentDir?: string): Promise<void> {
  const deadlineAt = Date.now() + CLOSE_DEADLINE_MS;
  const after: CaptureResult = !close.capture
    ? { kind: "unavailable", reason: "unsettled" }
    : span.beforeTree
      ? await capture({
          repositoryRoot: span.repositoryRoot,
          storePath: storePathFor(span, agentDir),
          baselineOverlay: span.overlayPaths ?? [],
          deadlineAt,
        })
      : { kind: "unavailable", reason: span.unavailable ?? "capture-failed" };
  const skipped = [...new Set([...(span.skippedPaths ?? []), ...(after.kind === "tree" ? after.skippedPaths : [])])];
  const closed: TurnSpan = {
    ...span,
    status: close.status,
    endedAt: new Date().toISOString(),
    ...(skipped.length ? { skippedPaths: skipped } : {}),
    ...(after.kind === "tree" ? { afterTree: after.tree } : { unavailable: after.reason }),
  };
  await writeSpan(closed, agentDir).catch(() => undefined);
  // Nothing was captured for a run that was superseded or never settled, so
  // there is no tree to keep reachable.
  if (closed.beforeTree || closed.afterTree) {
    await pinSpanTrees(storePathFor(closed, agentDir), closed, deadlineAt).catch(() => undefined);
  }
}

function armSettleTimer(sessionId: string, cwd: string, agentDir: string | undefined, generation: number): void {
  const record = sessions.get(sessionId);
  if (!record || record.timer) return;
  const timer = setTimeout(() => {
    if (sessions.get(sessionId)?.generation !== generation) return;
    void noteTurnLifecycle(sessionId, cwd, { type: "settle_timeout" }, agentDir);
  }, SETTLE_TIMEOUT_MS);
  timer.unref?.();
  record.timer = timer;
}

function clearSettleTimer(record: SessionRecord): void {
  if (record.timer) clearTimeout(record.timer);
  record.timer = undefined;
}

/**
 * Where a tool's path argument sits in the repository, or nothing.
 *
 * A tool may name a path relative to the Session's directory or absolutely,
 * and either may point outside the repository the interval covers. A path that
 * lands outside is dropped: it cannot appear in the interval, so recording it
 * could only ever attribute something the interval does not hold.
 */
function repositoryRelative(span: TurnSpan, given: string): string | null {
  const inside = (relative: string): string | null =>
    !relative || relative.startsWith("..") || path.isAbsolute(relative) ? null : relative;

  if (!path.isAbsolute(given)) return inside(path.normalize(path.join(span.cwdPrefix ?? "", given)));

  // Absolute, and either form of the repository's path may be the one it took.
  const fromRoot = inside(path.relative(span.repositoryRoot, given));
  if (fromRoot) return fromRoot;
  const fromCwd = inside(path.relative(span.cwd, given));
  return fromCwd ? inside(path.normalize(path.join(span.cwdPrefix ?? "", fromCwd))) : null;
}

/**
 * What the run is last known to have left at a path.
 *
 * Seeded from the interval's own baseline the first time a path is touched, and
 * moved on by each verified claim. Never read from the working tree: disk holds
 * whatever anybody wrote, and an observation of it races the tool it describes.
 */
type TrustedState = { kind: "known"; hash: string | null } | { kind: "unknown" };

async function trustedState(
  record: SessionRecord,
  span: TurnSpan,
  relativePath: string,
  agentDir: string | undefined,
): Promise<TrustedState> {
  const held = record.trusted?.get(relativePath);
  if (held !== undefined) return { kind: "known", hash: held };
  if (!span.beforeTree) return { kind: "unknown" };
  const baseline = await blobHashInTree({
    repositoryRoot: span.repositoryRoot,
    storePath: storePathFor(span, agentDir),
    tree: span.beforeTree,
    relativePath,
  });
  if (baseline.kind === "unreadable") return { kind: "unknown" };
  return { kind: "known", hash: baseline.kind === "hash" ? baseline.hash : null };
}

function noteOpaque(provenance: TurnProvenance, tool: string): void {
  if (!provenance.opaqueTools.includes(tool)) provenance.opaqueTools.push(tool);
}

/**
 * Record what one tool execution establishes about the files the run changed.
 *
 * The arguments arrive when the call starts and the result when it ends, so the
 * first is held until the second: only together do they say what the file was
 * asked to become and what the tool reports it became. Nothing here touches the
 * working tree, and nothing here can delay or fail the prompt.
 */
async function recordToolExecution(
  record: SessionRecord,
  event: TurnToolEvent,
  agentDir: string | undefined,
): Promise<void> {
  const span = record.span;
  // A tool outside an open prompt belongs to no interval.
  if (!span) return;

  if (event.type === "tool_started") {
    (record.pendingTools ??= new Map()).set(event.toolCallId, event.args);
    return;
  }

  const args = record.pendingTools?.get(event.toolCallId);
  record.pendingTools?.delete(event.toolCallId);

  // A record this version cannot read is left exactly as it is, so the reader
  // refuses the turn rather than a half-written record being trusted or a
  // missing field failing at read time.
  if (span.provenance !== undefined && !isCurrentProvenance(span.provenance)) return;
  const provenance: TurnProvenance = span.provenance
    ?? { version: TURN_PROVENANCE_VERSION, writes: [], opaqueTools: [] };
  const outcome = readToolOutcome({
    toolName: event.toolName,
    args,
    result: event.result,
    isError: event.isError,
  });
  if (outcome.kind === "ignored") return;
  if (outcome.kind === "opaque") noteOpaque(provenance, outcome.tool);
  else {
    // One call can prove some files and say nothing usable about others, so a
    // gap is recorded alongside the claims rather than instead of them.
    if (outcome.incompleteTool) noteOpaque(provenance, outcome.incompleteTool);
    const claimed = outcome.groups.flat().length;
    if (provenance.writes.length + claimed > MAX_RECORDED_WRITES) provenance.overflowed = true;
    else {
      for (const group of outcome.groups) {
        // A group stands or falls whole. A move whose source no longer holds
        // what the run left there carries somebody else's text into the
        // destination, so neither path can be claimed on its own.
        const resolved = [];
        let usable = true;
        for (const claim of group) {
          const relative = repositoryRelative(span, claim.path);
          // A path outside the repository cannot be checked here, and the SDK
          // does report one: a move names its source wherever it sat. Skipping
          // it would drop the requirement and leave the destination claimed on
          // its own, so an unresolved claim takes its group with it.
          if (!relative) {
            usable = false;
            break;
          }
          if (claim.requires !== undefined) {
            const trusted = await trustedState(record, span, relative, agentDir);
            if (trusted.kind === "unknown" || trusted.hash !== claim.requires) {
              usable = false;
              break;
            }
          }
          resolved.push({ path: relative, hash: claim.expects });
        }
        if (!usable) continue;
        for (const write of resolved) {
          provenance.writes.push(write);
          (record.trusted ??= new Map()).set(write.path, write.hash);
        }
      }
    }
  }
  span.provenance = provenance;
  await writeSpan(span, agentDir).catch(() => undefined);
}

/** Whether a session is still holding a timer against the ending it is owed. */
export function hasSettleTimer(sessionId: string): boolean {
  return sessions.get(sessionId)?.timer !== undefined;
}

/**
 * Forget a session, and close whatever it had open.
 *
 * Dropping the record is what invalidates the queued events and the settle
 * timer belonging to it: each tests the generation it was created under, and
 * generations are never reused. The closing write waits behind whatever the
 * session already had in flight, and only then asks what that left behind: a
 * Session destroyed while its baseline was still being taken has no span here
 * until that capture returns, and closing early would leave it running for
 * ever.
 */
export function forgetTurnLifecycle(sessionId: string, agentDir?: string): void {
  const record = sessions.get(sessionId);
  if (!record) return;
  clearSettleTimer(record);
  sessions.delete(sessionId);
  void record.queue
    .then(async () => {
      const span = record.span;
      if (!span) return;
      const current = await readRun(span.runId, agentDir);
      if (current?.status !== "running") return;
      await writeSpan(
        { ...current, status: "interrupted", endedAt: new Date().toISOString(), unavailable: "unsettled" },
        agentDir,
      );
    })
    .catch(() => undefined);
}
