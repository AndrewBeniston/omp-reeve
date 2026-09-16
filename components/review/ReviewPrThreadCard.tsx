"use client";

import { reviewPrThreadRangeLabel, type ReviewPrThread } from "@/lib/review-pr-ui";
import styles from "./review-pr.module.css";

/**
 * One published GitHub thread, drawn where it was left.
 *
 * Read-only on purpose. These belong to the host and to the people who wrote
 * them, and nothing here can change one: replying, resolving and editing are a
 * separate act that a human takes deliberately. They are drawn apart from the
 * local drafts beside them so it stays obvious which words are already public
 * and which are still only on this computer.
 */
export function ReviewPrThreadCard({ thread }: { thread: ReviewPrThread }) {
  return <div className={styles.threadCard} data-resolved={thread.resolved ? "true" : undefined}>
    <div className={styles.threadHeading}>
      <span className={styles.threadRange}>{reviewPrThreadRangeLabel(thread)}</span>
      <span className={styles.threadTags}>
        <span className={styles.threadTag}>Published on GitHub</span>
        {thread.resolved && <span className={styles.threadTag}>Resolved</span>}
        {thread.outdated && <span className={styles.threadTag}>Outdated</span>}
      </span>
    </div>
    {thread.comments.map((comment) => <div key={comment.id} className={styles.threadComment}>
      <span className={styles.threadAuthor}>{comment.author}</span>
      <p className={styles.threadBody}>{comment.body}</p>
    </div>)}
  </div>;
}
