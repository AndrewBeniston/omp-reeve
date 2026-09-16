import type { ReviewCommentAnchor } from "./review-comment-anchor";
import type { ReviewComment } from "./review-comments";

/**
 * Where review comments live between visits.
 *
 * Drafts are one person's working notes on one machine, so they sit in local
 * storage beside Review's other remembered choices rather than in a Session
 * file, which would publish them into the transcript. Each owner has its own
 * key, so a Session can never read another Session's notes.
 */
const PREFIX = "omp-review-comments:";

export function readReviewComments(ownerKey: string): ReviewComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + ownerKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReviewComment).map(withCheckedAnchor);
  } catch {
    return [];
  }
}

export function writeReviewComments(ownerKey: string, comments: readonly ReviewComment[]): void {
  if (typeof window === "undefined") return;
  try {
    if (comments.length === 0) window.localStorage.removeItem(PREFIX + ownerKey);
    else window.localStorage.setItem(PREFIX + ownerKey, JSON.stringify(comments));
  } catch {
    // Storage denied or full: the comments stay in the panel for this visit.
  }
}

/**
 * Change one owner's comments, or refuse.
 *
 * The change is applied to what storage holds at this moment rather than to a
 * list the panel is still rendering, and only when the owner it was started
 * for is still the owner now. That is what stops a note begun beside one
 * Session from landing in another, and stops an older list from being written
 * back over a newer one. Null means nothing was written.
 */
export function mutateReviewComments(
  ownerKey: string,
  currentOwnerKey: string,
  apply: (current: ReviewComment[]) => ReviewComment[],
): ReviewComment[] | null {
  if (ownerKey !== currentOwnerKey) return null;
  const next = apply(readReviewComments(ownerKey));
  writeReviewComments(ownerKey, next);
  return next;
}

/**
 * A stored comment with an anchor it can rely on, or with none at all.
 *
 * The key is removed rather than set to nothing, so a comment that never had
 * an anchor is the same object on the way out as it was on the way in.
 */
function withCheckedAnchor(comment: ReviewComment): ReviewComment {
  const anchor = readAnchor(comment.anchor);
  if (anchor === undefined && comment.anchor === undefined) return comment;
  const checked = { ...comment };
  if (anchor) checked.anchor = anchor;
  else delete checked.anchor;
  return checked;
}

/**
 * The anchor a stored comment carries, or nothing when it cannot be trusted.
 *
 * A damaged anchor costs the comment its ability to follow its lines and
 * nothing else. The comment is never dropped for it: it stays readable and
 * reports itself detached, which is an honest account of that state.
 */
function readAnchor(value: unknown): ReviewCommentAnchor | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const anchor = value as Record<string, unknown>;
  if (!isStringArray(anchor.lines) || anchor.lines.length === 0) return undefined;
  return {
    lines: anchor.lines,
    before: isStringArray(anchor.before) ? anchor.before : [],
    after: isStringArray(anchor.after) ? anchor.after : [],
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isReviewComment(value: unknown): value is ReviewComment {
  if (typeof value !== "object" || value === null) return false;
  const comment = value as Record<string, unknown>;
  return typeof comment.id === "string"
    && typeof comment.path === "string"
    && typeof comment.body === "string"
    && typeof comment.revision === "string"
    && (comment.side === "additions" || comment.side === "deletions")
    && Number.isInteger(comment.startLine)
    && Number.isInteger(comment.endLine);
}
