"use client";

import { useState } from "react";
import { reviewLineRangeLabel, type ReviewCommentDraft } from "@/lib/review-comments";
import type { PlacedReviewComment } from "@/lib/review-comment-anchor";
import { ReviewCommentCard } from "./ReviewCommentCard";
import styles from "./review.module.css";

/** One comment editor: whether it is open, and what has been typed into it. */
interface CommentEditor {
  editing: boolean;
  body: string;
}

/**
 * The comments no diff on screen is drawing.
 *
 * A comment loses its place in two ways. Its file can leave the review, by
 * being committed, reverted, or falling outside the scope being read. Or the
 * file can still be in the review while this view draws something else for it:
 * a conflict, an image, a binary notice, nothing at all where a rename changed
 * no lines, or another file entirely when a large change is read one file at a
 * time. Either way the remark is somebody's work, and it stays here where it
 * can be read, changed, handed over and removed.
 *
 * Editor state is local, unlike the cards drawn on a diff. Nothing virtualises
 * this list, so a card here is never unmounted while it is being written in.
 */
export function ReviewOrphanComments({ entries, commentSaveLabel, canAddToChat, onSaveComment, onRemoveComment, onAddCommentToChat }: {
  entries: readonly PlacedReviewComment[];
  commentSaveLabel?: string;
  canAddToChat: boolean;
  onSaveComment: (path: string, draft: ReviewCommentDraft) => void;
  onRemoveComment: (id: string) => void;
  onAddCommentToChat: (entry: PlacedReviewComment) => void;
}) {
  const [editors, setEditors] = useState<Record<string, CommentEditor>>({});
  const editorFor = (id: string, body: string): CommentEditor => editors[id] ?? { editing: false, body };
  const updateEditor = (id: string, body: string, next: Partial<CommentEditor>) =>
    setEditors((current) => ({ ...current, [id]: { ...editorFor(id, body), ...next } }));
  const forgetEditor = (id: string) => setEditors((current) => {
    const next = { ...current };
    delete next[id];
    return next;
  });

  return <section className={styles.detachedComments} aria-label="Comments not shown on a diff">
    <p className={styles.detachedNote}>
      {entries.length === 1
        ? "One comment is not on any diff here. It is kept so it can still be read, changed, handed over or removed."
        : `${entries.length} comments are not on any diff here. They are kept so they can still be read, changed, handed over or removed.`}
    </p>
    {entries.map(({ comment, placement }) => {
      const editor = editorFor(comment.id, comment.body);
      return <div key={comment.id} className={styles.detachedEntry}>
        <p className={styles.detachedPath} title={comment.path}>{comment.path}</p>
        <ReviewCommentCard saveLabel={commentSaveLabel} comment={comment}
          editing={editor.editing} body={editor.body}
          onEditingChange={(editing) => updateEditor(comment.id, comment.body, { editing })}
          onBodyChange={(body) => updateEditor(comment.id, comment.body, { body })}
          rangeLabel={placement.state === "detached"
            ? reviewLineRangeLabel(comment.startLine, comment.endLine)
            : reviewLineRangeLabel(placement.startLine, placement.endLine)}
          status={placement.state === "detached" ? "detached" : "hidden"}
          canAddToChat={canAddToChat}
          onCancel={() => forgetEditor(comment.id)}
          onSave={(body) => {
            onSaveComment(comment.path, { id: comment.id, side: comment.side, startLine: comment.startLine, endLine: comment.endLine, body });
            forgetEditor(comment.id);
          }}
          onRemove={() => onRemoveComment(comment.id)}
          onAddToChat={() => onAddCommentToChat({ comment, placement })} />
      </div>;
    })}
  </section>;
}
