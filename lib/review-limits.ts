import type { FileDiffMetadata } from "@pierre/diffs";

/*
 * Every threshold in this file is a shipped value read out of the reference
 * application, not a number chosen here. The source for all of them is
 * reference build 26.908.40834, recorded in `docs/research/review-reference.md`
 * under R3, and each constant names the module the literal was read from.
 *
 * The reference ships four large-diff mechanisms together. Three of them are
 * decided by the constants below: one file at a time past the review-wide
 * limits, an open-in-editor prompt past the per-file limits, and a refusal
 * past the byte caps its diff worker enforces. The fourth, virtualising the
 * lines within one file, belongs to the renderer rather than to a threshold.
 */

/**
 * Past any one of these, the whole review shows one file at a time.
 *
 * Shipped source: the reference's single-file predicate, which tests these
 * three thresholds. The expression and its location are recorded in the
 * private evidence index, not here.
 */
export const REVIEW_SINGLE_FILE_LIMITS = {
  fileCount: 128,
  changedLines: 9000,
  changedBytes: 12 * 1024 * 1024,
} as const;

/**
 * Past any one of these, a single file is not rendered and is offered for
 * opening instead.
 *
 * Shipped source: the reference's per-file predicate. The reference
 * applies the same three again at hunk scope, which is why walking the hunks
 * here reaches the same answer.
 */
export const REVIEW_PER_FILE_LIMITS = {
  changedLines: 15000,
  changedBytes: 3 * 1024 * 1024,
  lineBytes: 1024 * 1024,
} as const;

// The reference measures changed text in UTF-16 code units through string
// length, not in bytes as these limit names suggest. Matched deliberately, and
// decided here alone.
export function reviewFileMeasuredLength(line: string | undefined): number {
  return line?.length ?? 0;
}

/**
 * The most one Git invocation may return.
 *
 * Shipped source: the per-diff output cap in the reference's diff worker,
 * `32 * 1024 * 1024`. A caller there may ask for less but never for more.
 */
export const REVIEW_PER_DIFF_BYTE_CAP = 32 * 1024 * 1024;

/**
 * The most one assembled review may carry across all of its files.
 *
 * Shipped source: the aggregate cap in the same worker, which refuses a
 * running total over `67108864` with a typed too-large error naming the limit
 * it hit. It is deliberately twice the per-diff cap: one enormous file and a
 * collection of large ones are different failures.
 */
export const REVIEW_AGGREGATE_BYTE_CAP = 64 * 1024 * 1024;

/**
 * The most one Git object read may return.
 *
 * Shipped source: the per-blob object read cap in the same worker, which is
 * also the default when a read names no size. It bounds a rich preview's two
 * sides; past it the panel says the file is larger than Review reads and
 * offers the file itself rather than drawing part of an image.
 */
export const REVIEW_OBJECT_READ_CAP = 5 * 1024 * 1024;

/**
 * How many untracked files one review will read before it stops adding them.
 *
 * Shipped source: the untracked ceiling in the same worker, which returns 256
 * for a review operation source and no ceiling otherwise.
 */
export const REVIEW_UNTRACKED_FILE_CEILING = 256;

/**
 * A byte count in mebibytes, the unit every limit above is written in.
 *
 * The fraction is dropped when there is none, so a limit reads "32 MiB" and a
 * measurement of one reads "4.2 MiB".
 */
export function formatMebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MiB`;
}

/** Which limit sent a file to the open-in-editor prompt, and the measurement that tripped it. */
export type OversizedReviewFile =
  | { limit: "changedLines"; changedLines: number }
  | { limit: "changedBytes"; changedBytes: number }
  | { limit: "lineBytes"; lineBytes: number };

/**
 * Why this file cannot be rendered, or null when it can be.
 *
 * The measurement is carried out so the panel can say what it is holding back
 * rather than only that something is too large. Context lines are not counted:
 * the reference measures the change, and a small edit inside a long file is
 * not a large diff.
 */
export function describeOversizedReviewFile(file: FileDiffMetadata): OversizedReviewFile | null {
  // Every hunk is counted before the limit is tested, as the reference counts
  // them, so the notice can state the file's own total.
  let changedLines = 0;
  for (const hunk of file.hunks) changedLines += hunk.additionLines + hunk.deletionLines;
  if (changedLines > REVIEW_PER_FILE_LIMITS.changedLines) return { limit: "changedLines", changedLines };
  // This walk reads every changed line, so it stops at the first line that
  // settles the answer and its total is a lower bound.
  let changedBytes = 0;
  for (const hunk of file.hunks) {
    for (const group of hunk.hunkContent) {
      if (group.type === "context") continue;
      const ranges = [
        { content: file.additionLines, start: group.additionLineIndex, count: group.additions },
        { content: file.deletionLines, start: group.deletionLineIndex, count: group.deletions },
      ];
      for (const { content, start, count } of ranges) {
        for (let index = start; index < start + count; index++) {
          const length = reviewFileMeasuredLength(content[index]);
          changedBytes += length;
          if (length > REVIEW_PER_FILE_LIMITS.lineBytes) return { limit: "lineBytes", lineBytes: length };
          if (changedBytes > REVIEW_PER_FILE_LIMITS.changedBytes) return { limit: "changedBytes", changedBytes };
        }
      }
    }
  }
  return null;
}

export function isOversizedReviewFile(file: FileDiffMetadata): boolean {
  return describeOversizedReviewFile(file) !== null;
}

export function requiresSingleFileReview({ fileCount, changedLines, diffBytes }: {
  fileCount: number;
  changedLines: number;
  diffBytes: number;
}): boolean {
  return fileCount > REVIEW_SINGLE_FILE_LIMITS.fileCount
    || changedLines > REVIEW_SINGLE_FILE_LIMITS.changedLines
    || diffBytes > REVIEW_SINGLE_FILE_LIMITS.changedBytes;
}
