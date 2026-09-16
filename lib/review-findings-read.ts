import { parseReviewFindingDirectives } from "./review-finding-directive";
import { reviewFindingPath, type ReviewModelFinding, type ReviewedFileSnapshot } from "./review-findings";
import { readReviewRequestSnapshots, type ReviewRequestSnapshot } from "./review-request-snapshot";
import { canonicalReviewCwd } from "./review-comments";
import { sessionOwnsDirectory } from "./review-turn-read";
import { getSessionEntries, resolveSessionPath, sessionBranchEntries } from "./session-reader";
import type { SessionEntry } from "./types";

/**
 * The findings one Session's review turns left on the diff.
 *
 * Read from the owning Session and from nowhere else. A review delivered into
 * another conversation writes its findings into that conversation's transcript,
 * and this panel does not read it: reaching into another Session's words to
 * draw them here would be exactly the isolation the comments already refuse.
 *
 * Every finding is bound to the review request it answered. The binding is the
 * composed prompt in the user message before it, which is the only evidence
 * Reeve has that a turn is reading the tree Reeve recorded.
 */
export type ReviewFindingsUnavailableReason =
  /** No Session, or none this computer lists, so nothing can vouch for it. */
  | "no-record"
  /** The Session does not belong to the directory that was asked for. */
  | "session-mismatch";

export type ReviewFindingsResult =
  | {
    kind: "findings";
    requestId: string;
    composedAt: string;
    findings: ReviewModelFinding[];
    /** What that request was composed against, which is where a line comes from. */
    reviewed: Record<string, ReviewedFileSnapshot>;
    /** Directives dropped because they named no usable file. */
    refusedDirectives: number;
  }
  /** The latest review raised nothing on a line, or no review has run here. */
  | { kind: "none" }
  | { kind: "unavailable"; reason: ReviewFindingsUnavailableReason };

/** The text of a message, whichever shape the entry stores it in. */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } =>
      typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text"
      && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("\n");
}

/**
 * The request this user message started, if it started one.
 *
 * The composed prompt has to be present whole. A human may add to it, because
 * the composer hands the prompt over for them to send, so the message is
 * allowed to carry more than the prompt and never less.
 */
function requestStartedBy(text: string, snapshots: readonly ReviewRequestSnapshot[]): ReviewRequestSnapshot | null {
  const message = text.trim();
  if (!message) return null;
  for (let index = snapshots.length - 1; index >= 0; index--) {
    if (message.includes(snapshots[index].prompt.trim())) return snapshots[index];
  }
  return null;
}

/** Every finding one assistant entry carries, for the request it is answering. */
function findingsInEntry(entry: SessionEntry, text: string, request: ReviewRequestSnapshot, model?: string): {
  findings: ReviewModelFinding[];
  refused: number;
} {
  const findings: ReviewModelFinding[] = [];
  let refused = 0;
  for (const directive of parseReviewFindingDirectives(text)) {
    const path = reviewFindingPath(directive.file);
    // A directive naming an absolute path, or one that climbs out of the
    // repository, describes the machine rather than the review. It is dropped
    // and counted. Its words stay in the transcript, which is the record.
    if (!path) {
      refused++;
      continue;
    }
    findings.push({
      id: `${entry.id}#${directive.index}`,
      entryId: entry.id,
      directiveIndex: directive.index,
      path,
      side: "additions",
      ...(directive.start === undefined ? {} : { startLine: directive.start, endLine: directive.end ?? directive.start }),
      title: directive.title,
      body: directive.body,
      ...(directive.priority ? { priority: directive.priority } : {}),
      ...(model ? { model } : {}),
      requestId: request.requestId,
      createdAt: entry.timestamp,
    });
  }
  return { findings, refused };
}

export async function readReviewFindings(options: {
  cwd: string;
  sessionId: string;
  agentDir?: string;
  /** Overridden by tests, which must not read the Sessions on this computer. */
  sessionCwd?: (sessionId: string) => Promise<string | null>;
  /** Overridden by tests, which supply a transcript rather than a file. */
  entries?: (sessionId: string) => Promise<SessionEntry[] | null>;
}): Promise<ReviewFindingsResult> {
  const { cwd, sessionId } = options;
  if (!sessionId) return { kind: "unavailable", reason: "no-record" };
  if (!await sessionOwnsDirectory(sessionId, cwd, options.sessionCwd)) {
    return { kind: "unavailable", reason: "session-mismatch" };
  }

  // Only the requests composed for this same Worktree. One Session can move
  // between the Worktrees of its Project, and a diff read in one of them is no
  // evidence about the lines of another.
  const directory = canonicalReviewCwd(cwd);
  const snapshots = (await readReviewRequestSnapshots(sessionId, options.agentDir))
    .filter((snapshot) => canonicalReviewCwd(snapshot.cwd) === directory);
  if (snapshots.length === 0) return { kind: "none" };

  const all = await readEntries(sessionId, options.entries);
  if (!all) return { kind: "unavailable", reason: "no-record" };
  /*
   * The branch the Session is on, not the file. A fork the human navigated away
   * from is still in the file, and its review would otherwise draw findings on
   * a diff that belongs to the conversation they kept.
   */
  const entries = sessionBranchEntries(all);

  const byRequest = new Map<string, { findings: ReviewModelFinding[]; refused: number }>();
  let active: ReviewRequestSnapshot | null = null;
  /**
   * The last review that really started on this branch.
   *
   * A request that was composed and never sent is not one: the prompt never
   * reached the transcript, so nothing was reviewed. The findings on screen
   * belong to the last review that ran, and a review that ran and raised
   * nothing clears the ones before it rather than leaving them standing.
   */
  let started: ReviewRequestSnapshot | null = null;
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (!message) continue;
    if (message.role === "user") {
      /*
       * A review turn runs from the prompt that started it to the next thing
       * the human says. A message that is not a review request ends it, so a
       * directive written in some later answer is not read as this review's
       * finding and does not inherit its revisions.
       */
      active = requestStartedBy(messageText(message.content), snapshots);
      if (active) started = active;
      continue;
    }
    if (message.role !== "assistant" || !active) continue;
    const text = messageText(message.content);
    if (!text) continue;
    // Named from the entry itself, so the card says which model wrote this
    // rather than which model the Session happens to hold now.
    const model = typeof message.provider === "string" && typeof message.model === "string"
      ? `${message.provider}/${message.model}`
      : undefined;
    const found = findingsInEntry(entry, text, active, model);
    if (found.findings.length === 0 && found.refused === 0) continue;
    const collected = byRequest.get(active.requestId) ?? { findings: [], refused: 0 };
    collected.findings.push(...found.findings);
    collected.refused += found.refused;
    byRequest.set(active.requestId, collected);
  }

  if (!started) return { kind: "none" };
  const collected = byRequest.get(started.requestId);
  if (!collected || collected.findings.length === 0) return { kind: "none" };
  return {
    kind: "findings",
    requestId: started.requestId,
    composedAt: started.composedAt,
    findings: collected.findings,
    reviewed: started.files,
    refusedDirectives: collected.refused,
  };
}

async function readEntries(
  sessionId: string,
  override?: (sessionId: string) => Promise<SessionEntry[] | null>,
): Promise<SessionEntry[] | null> {
  if (override) return override(sessionId);
  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return null;
  try {
    return await getSessionEntries(filePath);
  } catch {
    return null;
  }
}
