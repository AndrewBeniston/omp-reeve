import type { VirtualFileMetrics } from "@pierre/diffs";

/*
 * The renderer's virtualisation is switched on by wrapping the diff list in
 * Pierre's `Virtualizer`: `useFileDiffInstance` reads that context and builds a
 * `VirtualizedFileDiff` instead of a plain `FileDiff`, so every file in the
 * list renders only the rows near the viewport. Nothing else about the diff
 * changes, which is why annotations, hunk actions, line selection and context
 * expansion keep working untouched.
 *
 * The numbers below are the reference's, not Pierre's defaults, which are a
 * hunk line count of 50, a line height of 20, a header of 44 and spacing of 8.
 * Shipped source: the virtualiser metrics module of reference build
 * 26.908.40834, recorded under R3 in docs/research/review-reference.md.
 */
export const REVIEW_VIRTUAL_FILE_METRICS: VirtualFileMetrics = {
  /** Rows rendered per hunk chunk as virtualisation batches them. */
  hunkLineCount: 32,
  /**
   * Estimated height of one unmeasured row: the diff font size times 1.8, at
   * the shipped font size of 12px. Only an estimate — the renderer reconciles
   * each row against its measured height once it has been drawn.
   */
  lineHeight: 12 * 1.8,
  /** Zero in the reference, and Review draws its own file headings anyway. */
  diffHeaderHeight: 0,
  /** Height held for each collapsed-context separator row. */
  hunkSeparatorHeight: 32,
  /** The reference's diff gap-block custom property defaults to none. */
  spacing: 0,
};

/**
 * How far outside the viewport a file's rows are drawn before they are needed.
 *
 * Shipped source: the same reference build fetches a file's diff through an
 * intersection observer with a 300px lower root margin. The renderer applies
 * it to the same decision here.
 */
export const REVIEW_VIRTUALIZER_CONFIG = { intersectionObserverMargin: 300 };
