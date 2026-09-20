import type { ReviewOperation, ReviewTargetKind } from "./review-operations";

export type ReviewOutcomeStatus = "success" | "partial" | "error" | "stale";
export type ReviewOutcomeTone = "success" | "warning" | "danger";

export interface ReviewOutcome {
  tone: ReviewOutcomeTone;
  message: string;
}

const DONE: Record<ReviewOperation, string> = { stage: "Staged", unstage: "Unstaged", revert: "Reverted" };
const DOING: Record<ReviewOperation, string> = { stage: "stage", unstage: "unstage", revert: "revert" };
const PAST: Record<ReviewOperation, string> = { stage: "staged", unstage: "unstaged", revert: "reverted" };

function subject(targetKind: ReviewTargetKind, filePath?: string, hunkNumber?: number): string {
  if (targetKind === "hunk") return `hunk ${hunkNumber ?? 1} in ${filePath ?? "this file"}`;
  return filePath ?? "this file";
}

/**
 * What the panel says after an operation ran.
 *
 * A partial result reads as partial. Nothing here can report a success the
 * server did not give, which is the point: the human has to be able to tell
 * "all of it moved" from "some of it moved" without opening a terminal.
 */
export function reviewOutcomeMessage({ operation, targetKind, status, path: filePath, hunkNumber }: {
  operation: ReviewOperation;
  targetKind: ReviewTargetKind;
  status: ReviewOutcomeStatus;
  path?: string;
  hunkNumber?: number;
}): ReviewOutcome {
  if (status === "stale") {
    return { tone: "warning", message: "These changes moved on before the operation ran, so nothing was applied. Review has reloaded them." };
  }
  if (targetKind === "section") {
    if (status === "success") return { tone: "success", message: `Section ${PAST[operation]}` };
    if (status === "partial") return { tone: "warning", message: `Section partially ${PAST[operation]}` };
    return { tone: "danger", message: `Failed to ${DOING[operation]} section` };
  }
  const target = subject(targetKind, filePath, hunkNumber);
  if (status === "success") return { tone: "success", message: `${DONE[operation]} ${target}` };
  if (status === "partial") return { tone: "warning", message: `Partially ${PAST[operation]} ${target}` };
  return { tone: "danger", message: `Failed to ${DOING[operation]} ${target}` };
}
