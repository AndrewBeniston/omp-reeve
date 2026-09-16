import type { ReviewScope } from "./review-git";

export type ReviewOperation = "stage" | "unstage" | "revert";
export type ReviewTargetKind = "file" | "hunk" | "section";

/**
 * The operations a scope offers, by what they act on.
 *
 * Two rules shape this table. An operation on a hunk applies the hunk on
 * screen, so a hunk offers staging only where the displayed patch is the one
 * staging consumes; the combined uncommitted view mixes staged and unstaged
 * content, so it offers no hunk staging. A whole file has no such ambiguity,
 * because staging a file is a path moving into the index rather than a patch.
 * The section pill follows the reference, which hides Revert all in the staged
 * scope and keeps it everywhere else. Branch and commit review read history,
 * which no working-tree operation belongs to.
 */
export function reviewOperationsForScope(kind: ReviewScope["kind"], targetKind: ReviewTargetKind): ReviewOperation[] {
  switch (kind) {
    case "unstaged":
      return ["stage", "revert"];
    case "staged":
      return targetKind === "section" ? ["unstage"] : ["unstage", "revert"];
    case "uncommitted":
      return targetKind === "hunk" ? ["revert"] : ["stage", "revert"];
    default:
      return [];
  }
}

/**
 * Whether staging moves a path into the index rather than applying a patch.
 *
 * The combined view's patch runs from the last commit to the working tree, so
 * it is not the patch the index would consume. Staging from there means the
 * same thing `git add` means, and the file's digest still has to match what
 * the human was looking at.
 */
export function stagesByPath(operation: ReviewOperation, kind: ReviewScope["kind"]): boolean {
  return operation === "stage" && kind === "uncommitted";
}

/** The reference's own words for each operation, by what it acts on. */
export const REVIEW_OPERATION_LABELS: Record<ReviewOperation, Record<ReviewTargetKind, string>> = {
  stage: { file: "Stage file", hunk: "Stage", section: "Stage all" },
  unstage: { file: "Unstage file", hunk: "Unstage", section: "Unstage all" },
  revert: { file: "Revert file", hunk: "Revert", section: "Revert all" },
};

/** Revert destroys work that is not committed anywhere, so it is the operation that asks first. */
export function isDestructiveReviewOperation(operation: ReviewOperation): boolean {
  return operation === "revert";
}

/**
 * One operation the human asked for, as the panel passes it around.
 *
 * `targets` is what the server acts on; `path` and `hunkNumber` only name the
 * thing that was clicked, so the panel can say what happened to it afterwards.
 */
export interface ReviewOperationRequest {
  operation: ReviewOperation;
  targetKind: ReviewTargetKind;
  /**
   * A hunk target carries the whole hunk as well as its position, so the
   * server can refuse a position that no longer names the hunk that was
   * clicked. The text is compared against the server's own reading and never
   * applied. See `lib/review-hunk-binding.ts`.
   */
  targets: { path: string; revision: string; hunkIndex?: number; hunkText?: string }[];
  path?: string;
  hunkNumber?: number;
}
