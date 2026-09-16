/**
 * Splitting one file's patch into the pieces a Git operation can act on.
 *
 * A Review operation never sends patch text from the browser. It names a file
 * and, for a hunk, that hunk's position, and the server rebuilds the patch
 * from the diff it has just read. These helpers are what it rebuilds with, so
 * they stay pure and are tested against real Git output.
 */

function isHunkStart(line: string): boolean {
  return line.startsWith("@@ ");
}

/** The file's patch header: everything Git needs to know which file a hunk belongs to. */
export function patchHeader(filePatch: string): string {
  const lines = filePatch.split("\n");
  const firstHunk = lines.findIndex(isHunkStart);
  return (firstHunk === -1 ? lines : lines.slice(0, firstHunk)).join("\n");
}

/**
 * Every hunk in one file's patch, in the order the diff presents them, each
 * with its own @@ line. The line numbers in that header are left alone: Git
 * finds a hunk by its context, and rewriting them would only invent a position.
 */
export function patchHunks(filePatch: string): string[] {
  const lines = filePatch.split("\n");
  const hunks: string[] = [];
  let current: string[] | null = null;
  const close = () => {
    if (!current) return;
    const text = current.join("\n");
    hunks.push(text.endsWith("\n") ? text : `${text}\n`);
    current = null;
  };
  for (const line of lines) {
    if (isHunkStart(line)) {
      close();
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  close();
  return hunks;
}

/**
 * A patch containing one hunk of one file, ready for `git apply`.
 *
 * Null when the hunk is not there, which is how a stale hunk position fails
 * closed rather than applying a neighbouring hunk.
 */
export function singleHunkPatch(filePatch: string, hunkIndex: number, span?: PatchSpan): string | null {
  const whole = patchHunks(filePatch)[hunkIndex];
  if (!whole) return null;
  const hunk = span ? restrictHunk(whole, span) : whole;
  if (!hunk) return null;
  const header = patchHeader(filePatch).replace(/\n+$/, "");
  return `${header}\n${hunk}`;
}

/** One file's patch, normalised to end with a newline so Git accepts it on stdin. */
export function wholeFilePatch(filePatch: string): string {
  return filePatch.endsWith("\n") ? filePatch : `${filePatch}\n`;
}

export interface PatchBlobIds {
  /** The blob this file came from, or null when it is being added. */
  old: string | null;
  /** The blob it becomes, or null when it is deleted or only on disk. */
  new: string | null;
}

/**
 * The object ids Git wrote into the patch's `index` line.
 *
 * These name the exact content each side of this diff was built from, which is
 * what makes expanding a file safe: the surrounding lines come from the same
 * blobs the patch came from, not from a revision guessed afterwards. All-zero
 * ids mean there is no object on that side — an addition, a deletion, or a
 * working-tree side that was never written to the object store.
 */
export function patchBlobIds(filePatch: string): PatchBlobIds | null {
  const line = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/m.exec(filePatch);
  if (!line) return null;
  const real = (id: string) => (/^0+$/.test(id) ? null : id);
  return { old: real(line[1]), new: real(line[2]) };
}

export interface HunkLineRange {
  deletions: { start: number; end: number };
  additions: { start: number; end: number };
}

/**
 * The file lines one hunk covers, on each side of the diff.
 *
 * A comment is anchored to a file line, and a hunk is rendered on its own, so
 * this is what decides which hunk a comment belongs under. A count of zero
 * leaves an empty range, where `end` sits below `start` and nothing matches.
 */
export function hunkLineRange(hunkText: string): HunkLineRange | null {
  const span = hunkSpan(hunkText);
  if (!span) return null;
  const side = (start: number, count: number) => ({ start, end: start + count - 1 });
  return { deletions: side(span.oldStart, span.oldCount), additions: side(span.newStart, span.newCount) };
}

/** The lines one hunk covers, as its @@ line states them. */
export interface PatchSpan {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export function hunkSpan(hunkText: string): PatchSpan | null {
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(hunkText);
  if (!header) return null;
  const count = (value: string | undefined) => (value === undefined ? 1 : Number(value));
  return { oldStart: Number(header[1]), oldCount: count(header[2]), newStart: Number(header[3]), newCount: count(header[4]) };
}

/** One hunk's content, as it stands before the change and after it. */
export interface HunkSides {
  before: string[];
  after: string[];
}

export function hunkSides(hunkText: string): HunkSides | null {
  const lines = hunkText.split("\n");
  if (!isHunkStart(lines[0] ?? "")) return null;
  const sides: HunkSides = { before: [], after: [] };
  for (const line of lines.slice(1)) {
    if (line === "" || line.startsWith("\\")) continue;
    const body = line.slice(1);
    if (line.startsWith(" ")) { sides.before.push(body); sides.after.push(body); continue; }
    if (line.startsWith("-")) { sides.before.push(body); continue; }
    if (line.startsWith("+")) { sides.after.push(body); continue; }
    return null;
  }
  return sides;
}

/**
 * One hunk, cut down to the lines a span names.
 *
 * The reading that hides whitespace draws a hunk covering part of an exact
 * one, because the changes it leaves out can hold two exact hunks together or
 * split one apart. Applying the whole exact hunk would then move content from
 * outside the part that was drawn, so the patch is cut to the lines the panel
 * covered, counted in the file line numbers both readings share.
 *
 * What remains is a sub-range of Git's own hunk, so it applies forwards and in
 * reverse as Git wrote it. Null when the span names nothing of this hunk,
 * which is a refusal rather than an empty patch Git would accept and do
 * nothing with.
 */
export function restrictHunk(hunkText: string, span: PatchSpan): string | null {
  const whole = hunkSpan(hunkText);
  if (!whole) return null;
  const kept: string[] = [];
  let oldLine = whole.oldStart;
  let newLine = whole.newStart;
  let firstOld = 0;
  let firstNew = 0;
  let oldCount = 0;
  let newCount = 0;
  // Where one side keeps no line at all, Git names the line the change follows
  // and counts zero. That is the last line dropped before the span began.
  let oldAnchor = whole.oldStart - 1;
  let newAnchor = whole.newStart - 1;
  // The no-newline marker describes the line above it, so it travels only
  // with a line this span kept.
  let markLastLine = false;
  const inOld = (line: number) => line >= span.oldStart && line < span.oldStart + span.oldCount;
  const inNew = (line: number) => line >= span.newStart && line < span.newStart + span.newCount;
  for (const line of hunkText.split("\n").slice(1)) {
    if (line === "") continue;
    if (line.startsWith("\\")) {
      if (markLastLine) kept.push(line);
      continue;
    }
    const context = line.startsWith(" ");
    const deletion = line.startsWith("-");
    const addition = line.startsWith("+");
    if (!context && !deletion && !addition) return null;
    const keep = context ? inOld(oldLine) && inNew(newLine) : deletion ? inOld(oldLine) : inNew(newLine);
    markLastLine = keep;
    if (keep) {
      kept.push(line);
      if (!addition) { if (oldCount === 0) firstOld = oldLine; oldCount++; }
      if (!deletion) { if (newCount === 0) firstNew = newLine; newCount++; }
    } else if (!kept.length) {
      if (!addition) oldAnchor = oldLine;
      if (!deletion) newAnchor = newLine;
    }
    if (!addition) oldLine++;
    if (!deletion) newLine++;
  }
  if (!kept.length) return null;
  const oldStart = oldCount === 0 ? oldAnchor : firstOld;
  const newStart = newCount === 0 ? newAnchor : firstNew;
  const body = kept.join("\n");
  return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body.endsWith("\n") ? body : `${body}\n`}`;
}
