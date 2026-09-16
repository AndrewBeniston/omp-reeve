"use client";

import { useMemo } from "react";
import { describeReviewFileChange, type ReviewPresentedFile } from "@/lib/review-file-presentation";
import styles from "./review.module.css";

/**
 * What happened to this file, above its lines.
 *
 * A pure rename and a mode-only change draw no lines, so the panel renders no
 * diff for them at all. The silent flag says that is the case here, which is
 * when a file with nothing else to report still needs to say something rather
 * than leave an empty space under its name.
 */
export function ReviewFileChangeNote({ file, silent = false }: { file: ReviewPresentedFile; silent?: boolean }) {
  const notes = useMemo(() => describeReviewFileChange(file), [file]);
  if (!notes.length) return silent ? <p className={styles.fileChangeNote}>File metadata changed.</p> : null;
  return <>{notes.map((note) => <p key={note} className={styles.fileChangeNote}>{note}</p>)}</>;
}
