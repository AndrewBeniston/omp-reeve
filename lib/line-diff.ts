/**
 * Comparing two texts by line.
 *
 * Used for two jobs that must agree with each other: which lines of a file a
 * review changed, and the patch text that is copied from the source view. Both
 * are derived from the two sides the review itself hands back, so neither can
 * drift from what is actually being compared.
 *
 * Browser-safe, and deliberately bounded. The comparison is quadratic in the
 * differing lines, so past a ceiling it refuses rather than locking a tab.
 */

/** The most differing lines that will be compared before this gives up. */
const LINE_DIFF_CEILING = 5000;

export interface LineDiffRegion {
  /** Zero-based line in the old text where this region starts. */
  oldStart: number;
  oldLines: string[];
  /** Zero-based line in the new text where this region starts. */
  newStart: number;
  newLines: string[];
}

/** The longest common subsequence of two line arrays, as index pairs. */
export function commonLines(left: readonly string[], right: readonly string[]): Array<[number, number]> {
  const lengths: number[][] = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i] === right[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { pairs.push([i, j]); i += 1; j += 1; }
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

/**
 * Every run of lines that differs between the two texts, or nothing when the
 * two are too far apart to compare within the ceiling.
 *
 * Lines the two already share at the start and the end are skipped before
 * anything is compared, which is what keeps an ordinary edit to a large file
 * cheap.
 */
export function diffRegions(oldLines: readonly string[], newLines: readonly string[]): LineDiffRegion[] | null {
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1;
  const oldCore = oldLines.slice(prefix, oldLines.length - suffix);
  const newCore = newLines.slice(prefix, newLines.length - suffix);
  if (oldCore.length > LINE_DIFF_CEILING || newCore.length > LINE_DIFF_CEILING) return null;

  const regions: LineDiffRegion[] = [];
  let oldCursor = 0;
  let newCursor = 0;
  const flush = (oldEnd: number, newEnd: number) => {
    if (oldEnd > oldCursor || newEnd > newCursor) {
      regions.push({
        oldStart: oldCursor + prefix,
        oldLines: oldCore.slice(oldCursor, oldEnd),
        newStart: newCursor + prefix,
        newLines: newCore.slice(newCursor, newEnd),
      });
    }
  };
  for (const [oldIndex, newIndex] of commonLines(oldCore, newCore)) {
    flush(oldIndex, newIndex);
    oldCursor = oldIndex + 1;
    newCursor = newIndex + 1;
  }
  flush(oldCore.length, newCore.length);
  return regions;
}

/** The one-based lines of the new text that this change introduced. */
export function changedLines(regions: readonly LineDiffRegion[]): number[] {
  const lines: number[] = [];
  for (const region of regions) {
    for (let offset = 0; offset < region.newLines.length; offset += 1) lines.push(region.newStart + offset + 1);
  }
  return lines;
}

/**
 * Where each line of one text sits in another, for the lines they share.
 *
 * A review compares two versions of a file that may both differ from the one
 * on screen: a staged change is measured against the index, and the working
 * copy may have moved since. Line 40 of the comparison is then not line 40 of
 * what is being read, and marking it as though it were would point at the
 * wrong text.
 *
 * Returns zero-based `from` line to zero-based `to` line for every line the
 * two still share, or null when the two are too far apart to align. A line
 * that has no counterpart is absent rather than guessed at.
 */
export function alignLines(fromLines: readonly string[], toLines: readonly string[]): Map<number, number> | null {
  const regions = diffRegions(fromLines, toLines);
  if (!regions) return null;
  const alignment = new Map<number, number>();
  let from = 0;
  let to = 0;
  const run = (until: number, target: number) => {
    for (let offset = 0; from + offset < until; offset += 1) alignment.set(from + offset, target + offset);
  };
  for (const region of regions) {
    run(region.oldStart, to);
    from = region.oldStart + region.oldLines.length;
    to = region.newStart + region.newLines.length;
  }
  run(fromLines.length, to);
  return alignment;
}

/**
 * A unified diff of the two texts, in the form `git apply` accepts.
 *
 * Built here rather than carried from the panel so that what is copied is the
 * comparison this view actually read, at the revision it read it at.
 */
export function unifiedDiff(
  oldText: string,
  newText: string,
  names: { oldName: string; newName: string },
  context = 3,
): string | null {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const regions = diffRegions(oldLines, newLines);
  if (!regions) return null;
  if (!regions.length) return "";

  // Regions closer together than twice the context belong in one hunk, or
  // their context would overlap and repeat lines.
  const groups: LineDiffRegion[][] = [];
  for (const region of regions) {
    const current = groups.at(-1);
    const last = current?.at(-1);
    if (current && last && region.oldStart - (last.oldStart + last.oldLines.length) <= context * 2) current.push(region);
    else groups.push([region]);
  }

  const body: string[] = [`--- a/${names.oldName}`, `+++ b/${names.newName}`];
  for (const group of groups) {
    const first = group[0];
    const last = group[group.length - 1];
    const oldStart = Math.max(0, first.oldStart - context);
    const newStart = Math.max(0, first.newStart - context);
    const oldEnd = Math.min(oldLines.length, last.oldStart + last.oldLines.length + context);
    const newEnd = Math.min(newLines.length, last.newStart + last.newLines.length + context);
    const hunk: string[] = [];
    let oldCursor = oldStart;
    for (const region of group) {
      for (; oldCursor < region.oldStart; oldCursor += 1) hunk.push(` ${oldLines[oldCursor]}`);
      for (const line of region.oldLines) hunk.push(`-${line}`);
      for (const line of region.newLines) hunk.push(`+${line}`);
      oldCursor = region.oldStart + region.oldLines.length;
    }
    for (; oldCursor < oldEnd; oldCursor += 1) hunk.push(` ${oldLines[oldCursor]}`);
    body.push(`@@ -${oldStart + 1},${oldEnd - oldStart} +${newStart + 1},${newEnd - newStart} @@`, ...hunk);
  }
  return `${body.join("\n")}\n`;
}
