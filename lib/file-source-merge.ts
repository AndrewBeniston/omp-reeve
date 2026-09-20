import { commonLines } from "./line-diff";

/**
 * Reconciling an edit with somebody else's edit to the same file.
 *
 * The reference does not overwrite a file that moved under it. It re-reads the
 * file, and if the disk already holds what was about to be written it simply
 * adopts the new modification time; otherwise it merges three texts — the one
 * the editor opened, the one on disk now, and the one being typed — and raises
 * a conflict rather than choosing for the human.
 *
 * This is that merge. It is line-based, which is what a text editor's conflict
 * actually is, and it is deliberately conservative: two changes that touch the
 * same lines are a conflict even when a cleverer merge could guess.
 */

export type FileSourceMerge =
  | { kind: "clean" }
  | { kind: "merged"; content: string }
  | { kind: "conflict" };

/**
 * The most differing lines either side may carry before the merge gives up.
 *
 * The comparison below is quadratic in both length, and the ceiling above it
 * is a 10 MiB file, so an unbounded run could allocate a matrix far larger
 * than the file. Giving up is safe: the caller holds the change and asks a
 * human, which is what it does for a conflict anyway.
 */
const MERGE_LINE_CEILING = 5000;

function splitLines(text: string): string[] {
  return text.split("\n");
}

/** Each run of lines one side changed, against the text both started from. */
interface Change { baseStart: number; baseEnd: number; lines: string[] }

function changesAgainstBase(base: string[], side: string[]): Change[] | null {
  /*
   * Lines the two already agree on at the start and the end are not compared:
   * an edit in a large file usually touches a handful of lines, and trimming
   * those makes the comparison small enough to be worth doing at all.
   */
  let prefix = 0;
  while (prefix < base.length && prefix < side.length && base[prefix] === side[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < base.length - prefix && suffix < side.length - prefix
    && base[base.length - 1 - suffix] === side[side.length - 1 - suffix]) suffix += 1;
  const baseCore = base.slice(prefix, base.length - suffix);
  const sideCore = side.slice(prefix, side.length - suffix);
  if (baseCore.length > MERGE_LINE_CEILING || sideCore.length > MERGE_LINE_CEILING) return null;
  return alignedChanges(baseCore, sideCore, prefix);
}

function alignedChanges(base: string[], side: string[], offset: number): Change[] {
  const pairs = commonLines(base, side);
  const changes: Change[] = [];
  let baseCursor = 0;
  let sideCursor = 0;
  const flush = (baseEnd: number, sideEnd: number) => {
    if (baseEnd > baseCursor || sideEnd > sideCursor) {
      changes.push({ baseStart: baseCursor + offset, baseEnd: baseEnd + offset, lines: side.slice(sideCursor, sideEnd) });
    }
  };
  for (const [baseIndex, sideIndex] of pairs) {
    flush(baseIndex, sideIndex);
    baseCursor = baseIndex + 1;
    sideCursor = sideIndex + 1;
  }
  flush(base.length, side.length);
  return changes;
}

/**
 * Merge what is on disk and what is being typed, against the text the editor
 * opened.
 *
 * `clean` means there is nothing to apply: the two texts already agree.
 * `merged` carries a text that keeps both sets of changes. `conflict` means
 * the two touched overlapping lines, and the caller must stop rather than pick.
 */
export function mergeFileSource({ base, disk, local }: { base: string; disk: string; local: string }): FileSourceMerge {
  if (disk === local) return { kind: "clean" };
  if (base === disk) return { kind: "merged", content: local };
  if (base === local) return { kind: "merged", content: disk };
  const baseLines = splitLines(base);
  const diskChanges = changesAgainstBase(baseLines, splitLines(disk));
  const localChanges = changesAgainstBase(baseLines, splitLines(local));
  // Too much moved to compare honestly. Held, rather than guessed at.
  if (!diskChanges || !localChanges) return { kind: "conflict" };
  const sameEdit = (a: Change, b: Change) =>
    a.baseStart === b.baseStart && a.baseEnd === b.baseEnd && a.lines.length === b.lines.length
    && a.lines.every((line, index) => line === b.lines[index]);
  /*
   * Only a disk change against a local change can conflict; two runs from the
   * same side are by construction disjoint. They conflict when their base
   * ranges overlap, and when both are insertions at the same point — there,
   * nothing in the text says which of the two goes first.
   */
  for (const ours of localChanges) {
    for (const theirs of diskChanges) {
      if (sameEdit(ours, theirs)) continue;
      const overlaps = ours.baseStart < theirs.baseEnd && theirs.baseStart < ours.baseEnd;
      const bothInsertAt = ours.baseStart === ours.baseEnd && theirs.baseStart === theirs.baseEnd && ours.baseStart === theirs.baseStart;
      if (overlaps || bothInsertAt) return { kind: "conflict" };
    }
  }
  // Both sides survive. An edit both writers made is applied once.
  const applied = [...diskChanges, ...localChanges.filter((ours) => !diskChanges.some((theirs) => sameEdit(ours, theirs)))]
    .sort((a, b) => a.baseStart - b.baseStart || a.baseEnd - b.baseEnd);
  const merged: string[] = [];
  let cursor = 0;
  for (const change of applied) {
    merged.push(...baseLines.slice(cursor, change.baseStart), ...change.lines);
    cursor = Math.max(cursor, change.baseEnd);
  }
  merged.push(...baseLines.slice(cursor));
  return { kind: "merged", content: merged.join("\n") };
}
