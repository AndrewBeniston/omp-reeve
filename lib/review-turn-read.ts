import { realpath } from "node:fs/promises";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "./file-access";
import { canonicalReviewCwd } from "./review-comments";
import { fileRevisionsForPatch } from "./review-git";
import { diffSpan, intervalEntries } from "./review-turn-capture";
import { attributeInterval } from "./review-turn-attribution";
import { readSpan, spanDiffState, type TurnUnavailableReason } from "./review-turn-store";
import { listAllSessions } from "./session-reader";

/**
 * The interval a Session's last prompt left behind, read for the browser.
 *
 * Nothing a caller sends names an object. The request carries a Session and a
 * directory; the Session's own file says which directory it belongs to, and
 * the record on disk says which repository and which trees. A request that
 * disagrees with either is refused rather than answered from the record it
 * asked for, so one Session cannot be used to read another's work.
 */
export type LastTurnUnavailableReason =
  | TurnUnavailableReason
  /** No snapshot exists for this Session: none was taken, or it has been collected. */
  | "no-record"
  /** The Session does not belong to the directory or repository that was asked for. */
  | "session-mismatch"
  /**
   * Nothing was recorded about what this run did, so there is nothing to
   * separate its work from anyone else's. A run recorded before any of this was
   * kept lands here. An empty patch would read as a prompt that changed
   * nothing, which is a claim rather than an absence.
   */
  | "attribution-unavailable";

export interface LastTurnDiff {
  repositoryRoot: string;
  cwd: string;
  scope: { kind: "lastTurn"; sessionId: string };
  patch: string;
  omittedUntrackedFiles: number;
  untrackedFiles: string[];
  fileRevisions: Record<string, string>;
  conflictedFiles: string[];
  /**
   * Files that changed inside this interval and are not the run's work: an
   * edit somebody saved while the prompt ran, or a file the run wrote that
   * somebody wrote over afterwards. They are left out of the patch and named
   * here, because dropping them silently would read as though they never
   * changed.
   */
  unattributedPaths: string[];
  /**
   * Tools this turn ran that may have changed files without saying which — a
   * shell, a subagent, a plugin nobody has checked. Their work cannot be told
   * from anyone else's, or that proved some of its files and said nothing
   * usable about the rest. The turn is shown in part and these are named. Empty
   * means every change in the interval was accounted for.
   */
  incompleteTools: string[];
  /**
   * Files the capture could not represent faithfully, so the patch says
   * nothing about them. Their absence is not evidence they did not change,
   * which is why they are named rather than dropped.
   */
  skippedPaths: string[];
  startedAt: string;
  endedAt?: string;
}

export type LastTurnResult =
  | { kind: "diff"; diff: LastTurnDiff }
  /** Retryable distinguishes a prompt still running from a snapshot that will never arrive. */
  | { kind: "unavailable"; reason: LastTurnUnavailableReason; retryable: boolean };

/**
 * The directory a Session says it belongs to.
 *
 * Read from the Session's own file, never from the request, because this is
 * what the request is checked against.
 *
 * Taken from the Session list rather than the file's first line: a Session
 * file opens with a padded title record, so the line-one header a reader might
 * reach for is usually not the header at all.
 */
export async function officialSessionCwd(sessionId: string): Promise<string | null> {
  const sessions = await listAllSessions();
  return sessions.find((session) => session.id === sessionId)?.cwd ?? null;
}

/**
 * Whether this Session belongs to the directory the request names.
 *
 * One rule, read by every endpoint that opens a Session's own record, so a
 * Session can never be used to read another's work. The lookup is replaceable
 * for tests, which must not read the Sessions on this computer.
 */
export async function sessionOwnsDirectory(
  sessionId: string,
  cwd: string,
  lookup: (sessionId: string) => Promise<string | null> = officialSessionCwd,
): Promise<boolean> {
  const sessionCwd = await lookup(sessionId);
  if (!sessionCwd) return false;
  return (await canonicalPath(sessionCwd)) === (await canonicalPath(cwd));
}

function unavailable(reason: LastTurnUnavailableReason): LastTurnResult {
  return { kind: "unavailable", reason, retryable: reason === "in-progress" };
}

async function canonicalPath(value: string): Promise<string> {
  try {
    return canonicalReviewCwd(await realpath(value));
  } catch {
    return canonicalReviewCwd(value);
  }
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + "/");
}

export async function readLastTurnDiff(options: {
  cwd: string;
  sessionId: string;
  agentDir?: string;
  /** Overridden by tests, which must not read the Sessions on this computer. */
  sessionCwd?: (sessionId: string) => Promise<string | null>;
}): Promise<LastTurnResult> {
  const { cwd, sessionId, agentDir } = options;
  if (!sessionId) return unavailable("no-record");

  // A Session that does not resolve to a file of its own is not a Session, so
  // an invented identifier stops here rather than reaching a record.
  const sessionCwd = await (options.sessionCwd ?? officialSessionCwd)(sessionId);
  if (!sessionCwd) return unavailable("no-record");

  const requested = await canonicalPath(cwd);
  if ((await canonicalPath(sessionCwd)) !== requested) return unavailable("session-mismatch");

  const span = await readSpan(sessionId, agentDir);
  if (!span) return unavailable("no-record");
  const state = spanDiffState(span);
  if (state.kind === "unavailable") return unavailable(state.reason);

  // The record was written by this computer but not necessarily for this
  // request, and not necessarily by this process, so its repository is checked
  // like any other input: it must be readable here, and it must be the one the
  // request is standing in.
  const repositoryRoot = await canonicalPath(span.repositoryRoot);
  const roots = await getAllowedFileRoots();
  if (!isFilePathAllowed(repositoryRoot, roots) || !isExistingFilePathAllowed(repositoryRoot, roots)) {
    return unavailable("session-mismatch");
  }
  if (!isWithin(repositoryRoot, requested)) return unavailable("session-mismatch");

  // What the interval holds, before anything is claimed from it.
  const entries = await intervalEntries(span, { agentDir });
  if (entries.kind === "unavailable") return unavailable(entries.reason);

  // Only what the run itself did. A turn that cannot be separated is refused
  // whole: see docs/review-last-turn-snapshot.md.
  const attribution = attributeInterval(span.provenance, entries.entries);
  if (attribution.kind === "unavailable") return unavailable(attribution.reason);

  const patched = await diffSpan(span, { agentDir, paths: attribution.paths });
  if (patched.kind === "unavailable") return unavailable(patched.reason);

  return {
    kind: "diff",
    diff: {
      repositoryRoot: span.repositoryRoot,
      cwd,
      scope: { kind: "lastTurn", sessionId },
      patch: patched.patch,
      omittedUntrackedFiles: 0,
      // A captured pair of trees draws no line between tracked and untracked:
      // a file the prompt created is simply a file the later tree has.
      untrackedFiles: [],
      // The same digest every other scope anchors its comments to. Identifying
      // a file by anything else here would make a comment written in one scope
      // read as outdated the moment this one showed the same text.
      fileRevisions: fileRevisionsForPatch(patched.patch),
      conflictedFiles: [],
      unattributedPaths: attribution.unattributedPaths,
      incompleteTools: attribution.incompleteTools,
      skippedPaths: span.skippedPaths ?? [],
      startedAt: span.startedAt,
      ...(span.endedAt ? { endedAt: span.endedAt } : {}),
    },
  };
}
