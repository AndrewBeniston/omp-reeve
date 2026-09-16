"use client";

import { Button } from "@/components/ui/Button";
import { describeReviewConflict, type ReviewConflictStage } from "@/lib/review-conflicts";
import styles from "./review-noise.module.css";

/**
 * A conflicted file, stated rather than drawn.
 *
 * The file on disk holds the merge tool's markers, which are neither side of
 * the conflict. Showing them as a diff would present them as content someone
 * wrote, so the panel says what is in conflict and offers the file instead.
 */
export function ReviewConflictNotice({ stages = [], onOpenFile }: {
  /** The index stages Git is holding this path at, when they are known. */
  stages?: readonly ReviewConflictStage[];
  onOpenFile?: () => void;
}) {
  const description = describeReviewConflict(stages);
  return <div className={`${styles.notice} ${styles.conflict}`} role="status">
    <strong>File has merge conflicts</strong>
    {description && <span>{description}</span>}
    <span>Review shows no diff for it: the file holds conflict markers rather than either side.</span>
    {onOpenFile && <span><Button size="sm" tone="ghost" onClick={onOpenFile}>Open file to resolve</Button></span>}
  </div>;
}
