"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { ReviewComment } from "@/lib/review-comments";
import styles from "./review.module.css";

/**
 * What the diff on screen can say about the lines a saved comment belongs to.
 *
 * Nothing is said about a comment sitting on the lines it was written against;
 * the two states worth a word are the ones where the file has moved underneath
 * it. A comment that moved is still on its own lines. A detached one is not on
 * any, and says so rather than being drawn against a line it might not be about.
 */
export type ReviewCommentStatus = "moved" | "detached" | "hidden";

const STATUS: Record<ReviewCommentStatus, { label: string; title: string }> = {
  moved: { label: "Moved", title: "The lines this comment is about moved, and it followed them" },
  detached: { label: "Detached", title: "The lines this comment was written against are not in this revision. It has not been moved, because there is no line it can be shown to belong to." },
  hidden: { label: "Not shown here", title: "This comment's file is not drawing a diff in this view, so the comment is kept here instead" },
};

/**
 * One comment on a line or a range, drawn under the lines it is about.
 *
 * A card is either being written or already saved. Saving keeps the comment in
 * this panel and nowhere else: it is not sent anywhere, and no prompt leaves
 * for a model until the human hands the comments to the composer themselves.
 *
 * Whether it is being written, and what has been typed, are held by the owner
 * rather than here. The renderer virtualises the rows these cards are drawn
 * under, so a card whose lines scroll far enough away is unmounted; state kept
 * locally would take half-written comments with it.
 */
export function ReviewCommentCard({ editing, body, onEditingChange, onBodyChange, saveLabel = "Save", comment, rangeLabel, status, canAddToChat, onSave, onCancel, onRemove, onAddToChat }: {
  /** Whether the editor is open, owned by the caller so it survives unmounting. */
  editing: boolean;
  /** What has been typed, owned by the caller for the same reason. */
  body: string;
  onEditingChange: (editing: boolean) => void;
  onBodyChange: (body: string) => void;
  saveLabel?: string;
  comment?: ReviewComment;
  /** The lines this card is about, as the diff on screen numbers them now. */
  rangeLabel: string;
  status?: ReviewCommentStatus;
  canAddToChat: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
  onAddToChat?: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  /*
   * Focus a newly opened editor, and an empty one drawn for the first time,
   * which is the freshly started comment. An editor with writing already in it
   * is left alone: it is being remounted because its lines scrolled back into
   * view, and taking the caret there would fight the scroll.
   */
  const wasEditing = useRef(editing && body.length > 0);
  useEffect(() => {
    if (editing && !wasEditing.current) input.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const save = () => {
    const text = body.trim();
    if (!text) return;
    onSave(text);
    onEditingChange(false);
  };

  return <div className={styles.commentCard} data-status={status}>
    <div className={styles.commentHeading}>
      <span className={styles.commentRange}>{rangeLabel}</span>
      {status && <span className={styles.commentStatus} data-status={status} title={STATUS[status].title}>{STATUS[status].label}</span>}
    </div>
    {editing
      ? <>
        <textarea ref={input} className={styles.commentInput} rows={3} value={body}
          aria-label={`Comment on ${rangeLabel}`}
          placeholder="Describe a change or ask a question"
          onChange={(event) => onBodyChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); return; }
            // The same chord the composer uses to send, here to save the note.
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
          }} />
        <div className={styles.commentActions}>
          <Button size="sm" tone="ghost" onClick={() => { onBodyChange(comment?.body ?? ""); onEditingChange(false); onCancel(); }}>Cancel</Button>
          <Button size="sm" disabled={!body.trim()} onClick={save}>{saveLabel}</Button>
        </div>
      </>
      : <>
        <p className={styles.commentBody}>{comment?.body}</p>
        <div className={styles.commentActions}>
          {canAddToChat && onAddToChat && <Button size="sm" tone="ghost" onClick={onAddToChat}>Add to chat</Button>}
          <Button size="sm" tone="ghost" onClick={() => onEditingChange(true)}>Edit</Button>
          {onRemove && <Button size="sm" tone="ghost" onClick={onRemove}>Delete</Button>}
        </div>
      </>}
  </div>;
}
