"use client";

import { Button } from "@/components/ui/Button";
import {
  REVIEW_FINDING_UNPLACED_NOTES,
  reviewFindingRangeLabel,
  type PlacedReviewFinding,
} from "@/lib/review-findings";
import styles from "./review-findings.module.css";

/**
 * One finding the review model wrote, drawn where it belongs.
 *
 * Read-only, like the published pull-request thread beside it and unlike the
 * human's own comments. These words are the model's, written in the Session
 * transcript, and nothing here edits or deletes them: the only act offered is
 * putting the finding away, which hides it from this diff and leaves the turn
 * in the conversation untouched. That is why the card says "Dismiss" rather
 * than "Remove", and why it offers no editor.
 *
 * It says which model wrote it, so a finding is never read as Reeve's own
 * judgement or as somebody's note.
 */
export function ReviewFindingCard({ placed, dismissed, canAddToChat, onDismiss, onRestore, onAddToChat }: {
  placed: PlacedReviewFinding;
  dismissed: boolean;
  canAddToChat: boolean;
  onDismiss: () => void;
  onRestore: () => void;
  onAddToChat?: () => void;
}) {
  const { finding, placement } = placed;
  const range = reviewFindingRangeLabel(placed);
  const unplaced = placement.state === "unplaced" ? REVIEW_FINDING_UNPLACED_NOTES[placement.reason] : null;
  const detached = placement.state === "detached";
  return <div className={styles.findingCard} data-dismissed={dismissed ? "true" : undefined} data-state={placement.state}>
    <div className={styles.findingHeading}>
      <span className={styles.findingRange}>{range ?? "This file"}</span>
      <span className={styles.findingTags}>
        <span className={styles.findingTag}>{finding.model ? `Written by ${finding.model}` : "Written by the review model"}</span>
        {finding.priority && <span className={styles.findingTag}>{`Priority ${finding.priority}`}</span>}
        {placement.state === "moved" && <span className={styles.findingTag}>Moved</span>}
        {detached && <span className={styles.findingTag}>Detached</span>}
        {dismissed && <span className={styles.findingTag}>Dismissed</span>}
      </span>
    </div>
    <p className={styles.findingTitle}>{finding.title}</p>
    <p className={styles.findingBody}>{finding.body}</p>
    {unplaced && <p className={styles.findingNote}>{unplaced}</p>}
    {detached && <p className={styles.findingNote}>
      The lines this finding was written against are not in this revision. It is kept here rather than drawn on a line it might not be about.
    </p>}
    <div className={styles.findingActions}>
      {canAddToChat && onAddToChat && <Button size="sm" tone="ghost" onClick={onAddToChat}>Add to chat</Button>}
      {dismissed
        ? <Button size="sm" tone="ghost" onClick={onRestore}>Show again</Button>
        : <Button size="sm" tone="ghost" onClick={onDismiss}
            title="Hide this finding from the diff. The review stays in the conversation.">Dismiss</Button>}
    </div>
  </div>;
}
