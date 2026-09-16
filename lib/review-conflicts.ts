/*
 * A conflicted file, said in words rather than shown as content.
 *
 * Git holds a conflicted path at up to three index stages at once, and the
 * file on disk is the merge tool's markers rather than either side. Review
 * draws no diff for it, so what it says instead has to be enough to tell a
 * human why and what is in conflict.
 */

/** The three index stages Git holds a conflicted path at, named. */
export type ReviewConflictStage = "base" | "ours" | "theirs";

const STAGE_NAMES: Record<string, ReviewConflictStage> = { "1": "base", "2": "ours", "3": "theirs" };

/**
 * Which stages each unmerged path is held at, from `git ls-files --unmerged -z`.
 *
 * Each record is `<mode> <object> <stage>\t<path>`, one per stage, so a path
 * appears up to three times. A stage missing is itself information: no base
 * means the two sides each added the file, and no `ours` or `theirs` means
 * one side deleted it.
 */
export function conflictStagesFromIndex(output: string): Record<string, ReviewConflictStage[]> {
  const stages: Record<string, ReviewConflictStage[]> = {};
  for (const record of output.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab === -1) continue;
    const stage = STAGE_NAMES[record.slice(0, tab).split(" ").pop() ?? ""];
    const path = record.slice(tab + 1);
    if (!stage) continue;
    const held = stages[path] ??= [];
    if (!held.includes(stage)) held.push(stage);
  }
  return stages;
}

/**
 * What this conflict is, in one sentence, or null when the stages say nothing
 * beyond the fact of the conflict.
 *
 * A missing stage is what makes a conflict describable: the pairs below are
 * the ones Git can produce, and anything else falls back to the plain
 * statement the caller already makes.
 */
export function describeReviewConflict(stages: readonly ReviewConflictStage[]): string | null {
  const has = (stage: ReviewConflictStage) => stages.includes(stage);
  if (!stages.length) return null;
  if (has("base") && has("ours") && has("theirs")) return "Both sides changed this file.";
  if (!has("base") && has("ours") && has("theirs")) return "Both sides added this file.";
  if (has("base") && has("ours") && !has("theirs")) return "You changed this file and the other side deleted it.";
  if (has("base") && !has("ours") && has("theirs")) return "You deleted this file and the other side changed it.";
  return null;
}
