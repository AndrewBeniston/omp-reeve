import type { PlacedReviewComment, ReviewCommentAnchor } from "./review-comment-anchor";
import { buildAtMentionText, buildFileLineMentionText } from "./file-fuzzy";
import { normalizeFilePathSlashes } from "./file-paths";

/**
 * A review comment written against lines of a diff.
 *
 * A comment belongs to one Session, one file, and the revision of that file's
 * patch it was written against. The reference keys its own diff comments by
 * conversation, path and review, which is the same rule: a comment never
 * belongs to the panel, it belongs to the conversation the panel sits beside.
 */
export interface ReviewComment {
  id: string;
  /** Repository-relative, exactly as the patch names the file. */
  path: string;
  /** Which column of the diff the lines were selected in. */
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
  /** The file's `fileRevisions` digest when the comment was written. */
  revision: string;
  /**
   * The text of the lines the comment is about, kept so they can be found
   * again once the file changes. Absent on a comment written before anchoring,
   * and on one whose lines the patch did not carry whole.
   */
  anchor?: ReviewCommentAnchor;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Who owns a set of comments: one Session, working in one directory.
 *
 * Both halves are needed. A Session alone is not enough, because one Session
 * stays selected while the human moves between the worktrees of its Project,
 * and notes written against one worktree's diff do not describe another's. A
 * directory alone is not enough either, because two Sessions can work in the
 * same one. Before a Session exists the directory holds the comments on its
 * own, and they stay there: promoting them into the first Session that
 * happens to start would route someone's notes into a conversation they were
 * not written for.
 */
export interface ReviewCommentOwner {
  sessionId: string | null;
  cwd: string;
}

/** One spelling for a directory, so the same place is never two owners. */
export function canonicalReviewCwd(cwd: string): string {
  return normalizeFilePathSlashes(cwd).replace(/\/+$/, "");
}

export function reviewCommentOwnerKey({ sessionId, cwd }: ReviewCommentOwner): string {
  const directory = canonicalReviewCwd(cwd);
  return sessionId ? `session:${sessionId}@${directory}` : `project:${directory}`;
}

/**
 * Whether a Review Tab and the selected Session are working in one directory.
 *
 * One answer drives three things: which Session owns the comments written in
 * that Tab, whether they may be handed to its composer, and whether a file
 * mention may be. They have to agree, so they read this.
 */
export function reviewTabMatchesSession(tabCwd: string, activeCwd: string | null): boolean {
  return activeCwd !== null && canonicalReviewCwd(tabCwd) === canonicalReviewCwd(activeCwd);
}

export function upsertReviewComment(comments: readonly ReviewComment[], comment: ReviewComment): ReviewComment[] {
  const index = comments.findIndex((entry) => entry.id === comment.id);
  if (index === -1) return [...comments, comment];
  const next = [...comments];
  next[index] = comment;
  return next;
}

export function removeReviewComment(comments: readonly ReviewComment[], id: string): ReviewComment[] {
  return comments.filter((comment) => comment.id !== id);
}

/**
 * Whether a file's row will draw the comments written against it.
 *
 * A file section draws a diff only when there is one to draw and the human has
 * not already put the file away. A viewed file collapses to its heading; a
 * conflict, an image and a binary file each draw something else; and a change
 * with no added or deleted lines, such as a rename, has nothing to show. In
 * every one of those the comments on that file have no line to sit on, and
 * unless something else shows them they are gone from the screen while still
 * sitting in storage.
 *
 * This mirrors what the file section renders, and has to go on mirroring it.
 */
export function reviewFileClaimsComments(file: {
  /** Marked viewed at the revision on screen, so its section is collapsed. */
  viewed: boolean;
  conflicted?: boolean;
  /** Drawn as a preview, an image for instance, rather than as a diff. */
  previewable: boolean;
  binary: boolean;
  additions: number | null;
  deletions: number | null;
}): boolean {
  if (file.viewed || file.conflicted || file.previewable || file.binary) return false;
  return Boolean(file.additions || file.deletions);
}

/** The comments belonging to one file, placed against the diff on screen. */
export function placedCommentsForFile(placed: readonly PlacedReviewComment[], path: string): PlacedReviewComment[] {
  return placed.filter((entry) => entry.comment.path === path);
}

export function reviewCommentRangeLabel(comment: ReviewComment): string {
  return reviewLineRangeLabel(comment.startLine, comment.endLine);
}

/** How a span of lines is named wherever the panel has to name one. */
export function reviewLineRangeLabel(startLine: number, endLine: number): string {
  return startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}–${endLine}`;
}

/** How the comments read when they are handed to the Session. */
export type ReviewCommentHandoff = "notes" | "changes";

/**
 * The text inserted into the owning Session's composer.
 *
 * Each comment carries the same closed line mention the rest of Reeve uses, so
 * the agent resolves it exactly as it resolves one from the file viewer. The
 * text is inserted and never sent: what to do with it stays the human's.
 *
 * It takes placed comments rather than stored ones on purpose. The panel works
 * out where every comment sits once, and the diff and this text are then two
 * readings of one answer instead of two answers.
 */
export function reviewCommentsComposerText(
  placed: readonly PlacedReviewComment[],
  handoff: ReviewCommentHandoff,
  toSessionPath: (path: string) => string,
): string {
  if (placed.length === 0) return "";
  const lines = placed.map(({ comment, placement }) => {
    const path = toSessionPath(comment.path);
    const body = comment.body.trim();
    /*
     * A comment is handed over by the lines it is on now, which is why it is
     * placed before it is written out rather than after. A detached one has no
     * such lines, so it names its file and says what it was written against:
     * sending the old numbers would point the agent at whatever holds them now,
     * which is the mistake the whole anchoring arrangement exists to prevent.
     */
    if (placement.state === "detached") {
      const wrote = reviewLineRangeLabel(comment.startLine, comment.endLine).toLocaleLowerCase();
      return `- ${buildAtMentionText(path, false).trimEnd()} — ${body} (written against ${wrote}, which this review cannot show now)`;
    }
    return `- ${buildFileLineMentionText(path, placement.startLine, placement.endLine).trimEnd()} — ${body}`;
  });
  const heading = handoff === "changes"
    ? "Please make these changes from my review:"
    : "Review comments:";
  return `${heading}\n${lines.join("\n")}\n`;
}

/**
 * A comment on its way to being saved.
 *
 * The anchor is taken where the diff is, because that is the only place that
 * knows what the lines say, and it travels with the rest of the comment to
 * whoever stores it.
 */
export interface ReviewCommentDraft {
  /** Set when an existing comment is being edited rather than written. */
  id?: string;
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
  body: string;
  anchor?: ReviewCommentAnchor;
}

export function newReviewCommentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * What a card drawn against a diff line holds: the comments already saved
 * there, or the one being written. The diff renderer carries this through as
 * an annotation's metadata, so it is a concrete type rather than a generic —
 * the view is loaded dynamically, and a generic would not survive that.
 */
export interface ReviewDiffAnnotation {
  /** The comment being written here, if one is open. */
  draft?: { startLine: number; endLine: number };
  /** The comments already saved against this line, with their placement. */
  comments?: PlacedReviewComment[];
}
