import { readReviewDiff, type ReviewScope, type ReviewTarget } from "./review-git";
import { reviewFilesFromPatch } from "./review-files";
import { mismatchedHunkTargets, resolveDisplayedHunk } from "./review-hunk-binding";

/**
 * Turning what the panel asked for into what Git is asked to do.
 *
 * A request names a hunk by its position in the patch the panel drew, which
 * identifies it only while the panel and the server are reading the same
 * patch. They are not while whitespace is hidden: that reading leaves
 * whitespace-only changes out, so its hunks sit in different places and hold
 * different lines. Resolving the request is therefore a step of its own, taken
 * before anything is applied, and it fails closed.
 */

/** A target as the browser sends it: the hunk's position, and the hunk itself. */
export type ReviewApplyTarget = ReviewTarget & { hunkText?: string };

export interface ReviewApplyRequest {
  targets: ReviewApplyTarget[];
  /** Every path whose hunk could not be confirmed. Nothing is applied for any of them. */
  stale: string[];
}

/**
 * Confirm each named hunk against a reading taken now.
 *
 * The hunk the panel drew is compared with the one its position names here, so
 * an operation lands on the hunk that was clicked or on nothing at all.
 */
async function confirmHunks(cwd: string, scope: ReviewScope, targets: ReviewApplyTarget[]): Promise<ReviewApplyRequest> {
  const diff = await readReviewDiff(cwd, scope);
  return { targets, stale: mismatchedHunkTargets(reviewFilesFromPatch(diff.patch, diff.conflictedFiles), targets) };
}

/**
 * Resolve each named hunk when the panel was hiding whitespace.
 *
 * Both readings are taken here. The drawn hunk is confirmed against the
 * reading it came from, then found in the exact reading by the file lines it
 * covers, which both readings number alike because both compare the same two
 * versions of the file. What Git is given is still built from the exact
 * reading and cut to those lines, so a whitespace change outside them stays
 * where it is.
 *
 * The two readings are taken a moment apart, so both have to report the
 * revision the browser was showing. A file that moved in between is stale,
 * which is the answer it would get for moving at any other point.
 */
async function resolveDisplayedHunks(cwd: string, scope: ReviewScope, targets: ReviewApplyTarget[]): Promise<ReviewApplyRequest> {
  const display = await readReviewDiff(cwd, scope, { ignoreWhitespace: true });
  const exact = await readReviewDiff(cwd, scope);
  const exactFiles = new Map(reviewFilesFromPatch(exact.patch, exact.conflictedFiles).map((file) => [file.path, file]));
  const stale = new Set(mismatchedHunkTargets(reviewFilesFromPatch(display.patch, display.conflictedFiles), targets));
  const resolved: ReviewApplyTarget[] = [];
  for (const target of targets) {
    // A whole-file target names a path rather than a patch, so it passes
    // through; anything already refused stops here, because a refusal ends
    // the whole operation and its target is never applied.
    if (target.hunkIndex === undefined) {
      resolved.push(target);
      continue;
    }
    if (stale.has(target.path)) continue;
    const file = exactFiles.get(target.path);
    const moved = exact.fileRevisions[target.path] !== target.revision || display.fileRevisions[target.path] !== target.revision;
    const hunk = file && !moved && target.hunkText ? resolveDisplayedHunk(file.patch, target.hunkText) : null;
    if (!hunk) {
      stale.add(target.path);
      continue;
    }
    resolved.push({ path: target.path, revision: target.revision, hunkIndex: hunk.hunkIndex, hunkSpan: hunk.span });
  }
  return { targets: resolved, stale: [...stale] };
}

/**
 * The targets to apply, or the paths that stopped the operation.
 *
 * A whole-file target names a path rather than a patch, so it needs no
 * resolving and is returned as it arrived; the digest it carries is checked
 * where it is applied.
 */
export async function resolveReviewApplyRequest(cwd: string, scope: ReviewScope, targets: ReviewApplyTarget[], { hideWhitespace = false } = {}): Promise<ReviewApplyRequest> {
  if (!targets.some((target) => target.hunkIndex !== undefined)) return { targets, stale: [] };
  return hideWhitespace ? await resolveDisplayedHunks(cwd, scope, targets) : await confirmHunks(cwd, scope, targets);
}
