"use client";

import { ReviewFindingCard } from "./ReviewFindingCard";
import type { PlacedReviewFinding, ReviewFindingsHandling } from "@/lib/review-findings";
import styles from "./review-findings.module.css";

/**
 * The findings no diff on screen is drawing.
 *
 * A finding arrives here for two reasons. It sits on no line at all, because
 * the model named a file rather than a line or because Reeve cannot prove
 * which revision it was written against. Or its file is in the review while
 * this view draws something else for it: a preview, a conflict, a file marked
 * as read, or another file entirely in a large change.
 *
 * Every one of them is kept and named by its file. A finding is never hidden
 * because there was nowhere tidy to put it.
 */
export function ReviewOrphanFindings({ entries, handling }: {
  entries: readonly PlacedReviewFinding[];
  handling: ReviewFindingsHandling;
}) {
  const addToChat = handling.onAddFindingToChat;
  return <section className={styles.findingGroup} aria-label="Findings not shown on a diff">
    <p className={styles.findingPath}>
      {entries.length === 1
        ? "One finding from the review is not on any diff here. It is kept so it can still be read."
        : `${entries.length} findings from the review are not on any diff here. They are kept so they can still be read.`}
    </p>
    {entries.map((placed) => <div key={placed.finding.id}>
      <p className={styles.findingPath} title={placed.finding.path}>{placed.finding.path}</p>
      <ReviewFindingCard placed={placed}
        dismissed={handling.isFindingDismissed(placed.finding.id)}
        canAddToChat={Boolean(addToChat)}
        onDismiss={() => handling.onDismissFinding(placed.finding.id)}
        onRestore={() => handling.onRestoreFinding(placed.finding.id)}
        onAddToChat={addToChat ? () => addToChat(placed) : undefined} />
    </div>)}
  </section>;
}
