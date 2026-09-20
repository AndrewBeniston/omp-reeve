"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { parsePatchFiles, registerCustomCSSVariableTheme, type DiffLineAnnotation, type FileDiffContentsLoader, type SelectedLineRange } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { Button } from "@/components/ui/Button";
import { describeOversizedReviewFile, formatMebibytes, REVIEW_PER_FILE_LIMITS, type OversizedReviewFile } from "@/lib/review-limits";
import { REVIEW_VIRTUAL_FILE_METRICS } from "@/lib/review-virtualiser";
import type { ReviewDiffAnnotation } from "@/lib/review-comments";
import type { ReviewPrThread } from "@/lib/review-pr-ui";
import type { PlacedReviewFinding } from "@/lib/review-findings";
import { createReviewContentsLoader, type ReviewExpansionRequest } from "@/lib/review-expansion";
import { reviewDisplayPreferences, type ReviewDisplayPreferences } from "@/lib/review-display-preferences";
import styles from "./review.module.css";

registerCustomCSSVariableTheme("reeve-review", {
  foreground: "var(--ui-text)",
  background: "var(--ui-canvas)",
  "token-constant": "var(--syntax-warning)",
  "token-comment": "var(--syntax-text-muted)",
  "token-keyword": "var(--syntax-accent)",
  "token-parameter": "var(--syntax-text)",
  "token-function": "var(--syntax-accent)",
  "token-string": "var(--syntax-success)",
  "token-string-expression": "var(--syntax-success)",
  "token-punctuation": "var(--syntax-text-muted)",
  "token-link": "var(--syntax-accent)",
  "token-inserted": "var(--syntax-success)",
  "token-deleted": "var(--syntax-danger)",
  "token-changed": "var(--syntax-warning)",
});

export type ReviewViewAnnotation = ReviewDiffAnnotation & {
  hunkIndex?: number;
  /** Threads already published on a pull request, drawn read-only. */
  threads?: ReviewPrThread[];
  /** Findings the review model wrote against this line, drawn read-only. */
  findings?: PlacedReviewFinding[];
};

/**
 * What this file is holding back, in one sentence.
 *
 * Each one names the measurement and the limit it passed, so the reader can
 * tell an enormous file from one long line and knows the diff was withheld
 * deliberately rather than failing to load.
 *
 * A measurement is stated exactly where it is known exactly, and as a bound
 * where the walk stopped as soon as it had its answer.
 */
function oversizedReason(oversized: OversizedReviewFile): string {
  if (oversized.limit === "changedLines") {
    return `This file changes ${oversized.changedLines.toLocaleString("en-GB")} lines. Review renders up to ${REVIEW_PER_FILE_LIMITS.changedLines.toLocaleString("en-GB")} lines per file.`;
  }
  if (oversized.limit === "changedBytes") {
    return `This file changes more than the ${formatMebibytes(REVIEW_PER_FILE_LIMITS.changedBytes)} of text Review renders in one file.`;
  }
  return `One changed line in this file is ${formatMebibytes(oversized.lineBytes)}. Review renders up to ${formatMebibytes(REVIEW_PER_FILE_LIMITS.lineBytes)} in one line.`;
}

export interface ReviewDiffViewProps {
  expansion?: ReviewExpansionRequest;
  patch: string;
  wrapLines: boolean;
  diffMode: "unified" | "split";
  displayPreferences?: Readonly<ReviewDisplayPreferences>;
  /** Opens this file in its own tab, the way through when the diff is withheld. */
  onOpenFile?: () => void;
  /** Comment cards, drawn by the renderer under the lines they belong to. */
  lineAnnotations?: DiffLineAnnotation<ReviewViewAnnotation>[];
  renderAnnotation?: (annotation: DiffLineAnnotation<ReviewViewAnnotation>) => ReactNode;
  /** Called with the lines the human dragged over, or null when they clear it. */
  onLineSelected?: (range: SelectedLineRange | null) => void;
  selectedLines?: SelectedLineRange | null;
}

export function ReviewDiffView(props: ReviewDiffViewProps) {
  const preferences = reviewDisplayPreferences(props.displayPreferences);
  // Pierre hydrates metadata in place. A fresh renderer restores patch-only
  // context when loading is disabled, and again when the amount of context
  // asked for changes, because both decide what the hydrated file must hold.
  return <ReviewDiffContent key={String(preferences.loadFullFiles)} {...props} displayPreferences={preferences} />;
}

function ReviewDiffContent({ expansion, patch, wrapLines, diffMode, displayPreferences, onOpenFile, lineAnnotations, renderAnnotation, onLineSelected, selectedLines }: ReviewDiffViewProps & { displayPreferences: Readonly<ReviewDisplayPreferences> }) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loader, setLoader] = useState<FileDiffContentsLoader>();
  const { expanded, wordDiffs, loadFullFiles } = displayPreferences;
  useEffect(() => {
    setLoadError(null);
    setLoader(undefined);
    if (!loadFullFiles || !expansion || expansion.scope.kind === "lastTurn") return;
    const controller = new AbortController();
    setLoader(() => createReviewContentsLoader(expansion, controller.signal, setLoadError));
    return () => controller.abort();
  }, [expansion, loadFullFiles]);
  const parsed = useMemo(() => {
    try { return { files: parsePatchFiles(patch, undefined, true).flatMap((entry) => entry.files) }; }
    catch { return { files: null }; }
  }, [patch]);
  if (!parsed.files?.length) return <p role="alert" className={styles.message}>Unable to build patch for this file.</p>;
  return <div className={styles.diffSurface}>
    {loadError && <p role="status" className={styles.message}>{loadError}</p>}
    {parsed.files.map((file, index) => {
      const oversized = describeOversizedReviewFile(file);
      return oversized
      ? <div key={index} className={styles.oversizedFile} role="status">
          <p className={styles.oversizedReason}>{oversizedReason(oversized)}</p>
          {onOpenFile
            ? <Button size="sm" onClick={onOpenFile}>Open file</Button>
            : <p className={styles.message}>Open the file to read the change directly.</p>}
        </div>
      : <FileDiff key={index} fileDiff={file}
      metrics={REVIEW_VIRTUAL_FILE_METRICS}
      lineAnnotations={lineAnnotations}
      renderAnnotation={renderAnnotation}
      selectedLines={selectedLines ?? undefined}
      options={{
      theme: "reeve-review",
      diffStyle: diffMode,
      diffIndicators: "bars",
      hunkSeparators: "line-info",
      collapsed: !expanded,
      lineDiffType: wordDiffs ? "word-alt" : "none",
      loadDiffFiles: loadFullFiles ? loader : undefined,
      /*
       * Loading a file means showing it. The reference has no incremental
       * context expansion at all — its diffs carry Git's own default of three
       * context lines, and its full-file setting is on — so a loaded file is
       * drawn whole rather than behind a control that opens it a hundred lines
       * at a time. That control is the renderer's, not the reference's, and it
       * only appears where context is collapsed: showing the file whole leaves
       * no gap for it to sit in, and turning the setting off leaves the patch
       * alone with nothing to expand into.
       */
      expandUnchanged: loadFullFiles && Boolean(loader),
      disableFileHeader: true,
      overflow: wrapLines ? "wrap" : "scroll",
      ...(onLineSelected ? { enableLineSelection: true, onLineSelected } : {}),
    }} />;
    })}
  </div>;
}
