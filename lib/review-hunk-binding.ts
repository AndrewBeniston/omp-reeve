import { hunkSides, hunkSpan, patchHunks, restrictHunk, type PatchSpan } from "./review-patch";
import { REVIEW_PER_FILE_LIMITS } from "./review-limits";

/**
 * Binding an operation to the hunk the human was actually looking at.
 *
 * A hunk is named by its position in a file's patch, which only identifies it
 * while the panel and the server are reading the same patch. They are not,
 * once the panel hides whitespace: that reading drops and merges hunks, so
 * position two on screen can be position three on the server, and an
 * operation would land on a neighbouring hunk while every other check passed.
 *
 * So the request carries the whole hunk as well as its position. A header
 * alone is not enough: hiding whitespace can leave a hunk spanning the same
 * lines with different content inside it, and the two `@@` lines are then
 * identical while the hunks are not.
 *
 * The text is compared and never applied. The server still rebuilds the patch
 * it gives Git from its own reading, exactly as before; this is the name of
 * the thing that was clicked, and the two readings disagree about it precisely
 * when the position has stopped meaning what it meant. A hunk that cannot be
 * confirmed is refused rather than approximated.
 *
 * Carrying the hunk is also what makes it findable. A hunk drawn while
 * whitespace was hidden is resolved to the exact hunk it came from by the file
 * lines it covers, which is `resolveDisplayedHunk` below, so hiding whitespace
 * costs the panel no operation it would otherwise offer.
 */
export interface BoundHunkTarget {
  path: string;
  hunkIndex?: number;
  /** The whole hunk, as the panel was showing it. Compared, never applied. */
  hunkText?: string;
}

/**
 * The most hunk text a request may carry.
 *
 * A file whose changed text passes this is not drawn at all, so it offers no
 * hunk to act on and this bound is never what stops an ordinary operation.
 */
export const REVIEW_HUNK_TEXT_LIMIT = REVIEW_PER_FILE_LIMITS.changedBytes;

/**
 * The paths whose named hunk is not the hunk the request describes.
 *
 * Fails closed: an unnamed hunk, a file that is no longer in the diff, and a
 * position past its end are all refusals, because none of them can be shown
 * to be what the human chose.
 */
export function mismatchedHunkTargets(files: readonly { path: string; patch: string }[], targets: readonly BoundHunkTarget[]): string[] {
  const patches = new Map(files.map((file) => [file.path, file.patch]));
  const hunks = new Map<string, string[]>();
  const mismatched = new Set<string>();
  for (const target of targets) {
    if (target.hunkIndex === undefined) continue;
    const patch = patches.get(target.path);
    if (patch === undefined || !target.hunkText) {
      mismatched.add(target.path);
      continue;
    }
    let fileHunks = hunks.get(target.path);
    if (!fileHunks) {
      fileHunks = patchHunks(patch);
      hunks.set(target.path, fileHunks);
    }
    if (fileHunks[target.hunkIndex] !== target.hunkText) mismatched.add(target.path);
  }
  return [...mismatched];
}

/** The canonical hunk a displayed hunk came from, and the part of it it drew. */
export interface ResolvedHunk {
  hunkIndex: number;
  span: PatchSpan;
}

/** A line as the reading that hides whitespace compares it. */
function withoutWhitespace(line: string): string {
  return line.replace(/\s/g, "");
}

function sameIgnoringWhitespace(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => withoutWhitespace(line) === withoutWhitespace(right[index]));
}

/**
 * Whether one span lies inside another.
 *
 * A count of zero is a position between two lines rather than a line, so it
 * sits half a line after the one it names and is compared as such.
 */
function spanContains(outer: PatchSpan, inner: PatchSpan): boolean {
  const bounds = (start: number, count: number) => (count === 0 ? [start + 0.5, start + 0.5] : [start, start + count - 1]);
  const within = (outerStart: number, outerCount: number, innerStart: number, innerCount: number) => {
    const [low, high] = bounds(outerStart, outerCount);
    const [innerLow, innerHigh] = bounds(innerStart, innerCount);
    return innerLow >= low && innerHigh <= high;
  };
  return within(outer.oldStart, outer.oldCount, inner.oldStart, inner.oldCount)
    && within(outer.newStart, outer.newCount, inner.newStart, inner.newCount);
}

/**
 * The exact hunk a hunk drawn with whitespace hidden was taken from.
 *
 * Both readings number the file's lines the same way, because both diff the
 * same two versions of it; only which differences they show apart. So a
 * displayed hunk is found by the lines it covers rather than by its position,
 * and the exact hunk is then cut down to those lines, which is what keeps a
 * whitespace change outside them from moving with it.
 *
 * The answer is confirmed before it is returned: the cut-down hunk has to read
 * as the panel drew it, on both sides, once whitespace is taken out of the
 * comparison. Anything else — no exact hunk covering those lines, more than
 * one, or content that does not correspond — is refused. A refusal costs a
 * click; a wrong answer moves work the human did not choose.
 */
export function resolveDisplayedHunk(canonicalPatch: string, displayedHunkText: string): ResolvedHunk | null {
  const span = hunkSpan(displayedHunkText);
  const displayed = hunkSides(displayedHunkText);
  if (!span || !displayed) return null;
  const covering = patchHunks(canonicalPatch).flatMap((text, hunkIndex) => {
    const canonical = hunkSpan(text);
    return canonical && spanContains(canonical, span) ? [{ hunkIndex, text }] : [];
  });
  if (covering.length !== 1) return null;
  const [{ hunkIndex, text }] = covering;
  const restricted = restrictHunk(text, span);
  const exact = restricted ? hunkSides(restricted) : null;
  if (!exact) return null;
  if (!sameIgnoringWhitespace(exact.before, displayed.before)) return null;
  if (!sameIgnoringWhitespace(exact.after, displayed.after)) return null;
  return { hunkIndex, span };
}
