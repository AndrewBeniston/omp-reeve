import type { ReviewComment } from "./review-comments";

/**
 * What a comment holds on to so it can find its lines again.
 *
 * A comment is written against a line number in one revision of a patch, and
 * a line number stops meaning anything as soon as somebody inserts a line
 * above it. The text of the lines is what the remark was actually about, so
 * that is what is kept, with a little of what surrounded it. The neighbours
 * are never the anchor themselves; they are only there to tell two identical
 * candidates apart.
 */
export interface ReviewCommentAnchor {
  /** The commented lines, exactly as that revision of the patch showed them. */
  lines: string[];
  /** Up to three lines above, kept to break a tie. */
  before: string[];
  /** Up to three lines below, kept to break a tie. */
  after: string[];
}

/** How much of the surrounding file is worth keeping to tell twins apart. */
const CONTEXT_LINES = 3;

/** One line of one side of a patch, numbered as that side numbers it. */
export interface PatchSideLine {
  lineNumber: number;
  text: string;
}

/**
 * Every line of one side of a file's patch, with the number that side gives it.
 *
 * Only the lines the patch actually carries are here. A diff shows the changed
 * lines and a few either side, so the gaps between hunks are absent rather than
 * empty, and a run of lines is only a real run when their numbers are
 * consecutive. Matching relies on that, which is why the numbers are carried
 * rather than the position in this array.
 */
export function patchSideLines(filePatch: string, side: "additions" | "deletions"): PatchSideLine[] {
  const lines = filePatch.split("\n");
  const sideLines: PatchSideLine[] = [];
  let lineNumber = 0;
  let inHunk = false;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    if (raw.startsWith("@@ ")) {
      const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      inHunk = header !== null;
      if (header) lineNumber = Number(side === "additions" ? header[2] : header[1]);
      continue;
    }
    if (!inHunk) continue;
    // "\ No newline at end of file" describes the line before it and is not one.
    if (raw.startsWith("\\")) continue;
    /*
     * A patch may write an unchanged empty line as a bare empty string rather
     * than a single space. The last element of the split is the text after the
     * final newline and is not a line at all, so only that one is dropped.
     */
    if (raw === "") {
      if (index === lines.length - 1) continue;
      sideLines.push({ lineNumber, text: "" });
      lineNumber++;
      continue;
    }
    const marker = raw[0];
    const text = raw.slice(1);
    if (marker === " " || marker === (side === "additions" ? "+" : "-")) {
      sideLines.push({ lineNumber, text });
      lineNumber++;
      continue;
    }
    if (marker === "+" || marker === "-") continue;
    inHunk = false;
  }
  return sideLines;
}

/**
 * The anchor for lines a comment is being written against.
 *
 * Undefined when the patch on screen does not carry the whole range, which is
 * a comment that cannot be re-found later. It is still saved: a remark without
 * an anchor stays on the revision it was written against and says so when that
 * revision passes, which is the same promise as any other comment.
 */
export function captureReviewCommentAnchor(
  filePatch: string,
  side: "additions" | "deletions",
  startLine: number,
  endLine: number,
): ReviewCommentAnchor | undefined {
  const sideLines = patchSideLines(filePatch, side);
  const start = sideLines.findIndex((line) => line.lineNumber === startLine);
  if (start === -1) return undefined;
  const length = endLine - startLine + 1;
  const lines: string[] = [];
  for (let offset = 0; offset < length; offset++) {
    const line = sideLines[start + offset];
    if (!line || line.lineNumber !== startLine + offset) return undefined;
    lines.push(line.text);
  }
  const end = start + length;
  return {
    lines,
    before: contiguousRun(sideLines, start - 1, -1).slice(0, CONTEXT_LINES).reverse(),
    after: contiguousRun(sideLines, end, 1).slice(0, CONTEXT_LINES),
  };
}

/**
 * Where a comment's lines are now, and whether they were found at all.
 *
 * "absent" is the file itself leaving the review rather than the lines moving
 * inside it: there is no patch to look in, so nothing can be said about where
 * the comment belongs.
 */
export type ReviewCommentPlacement =
  | { state: "anchored"; startLine: number; endLine: number }
  | { state: "moved"; startLine: number; endLine: number }
  | { state: "detached"; reason: "gone" | "uncertain" | "unanchored" | "absent" };

/**
 * Lines somebody wrote against one revision of one file's patch.
 *
 * A review comment is one of these. A model's finding, bound to the revision
 * Reeve composed its review request against, is another. Placement reads only
 * this much, so both are placed by one rule rather than by two that can drift.
 */
export interface AnchoredReviewLines {
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
  /** The file's `fileRevisions` digest these lines were written against. */
  revision: string;
  anchor?: ReviewCommentAnchor;
}

/**
 * Where to draw a comment against the patch now on screen.
 *
 * A comment is left where it says it is only when this patch is provably the
 * revision it was written against. Anything else, including a revision this
 * diff cannot name, is checked: the anchor is looked for in the patch, and the
 * comment moves only when exactly one place can be shown to be it. Not knowing
 * which revision is on screen is not evidence that it is the same one, and a
 * comment must not ride an unanswered question onto a line.
 *
 * Everything else is detached: the comment stays, whole and readable, off the
 * diff rather than against a line that might be the wrong one. Losing a
 * remark, or quietly filing it against code it was never about, are the two
 * outcomes worth this trouble to avoid.
 */
export function placeReviewComment(
  comment: AnchoredReviewLines,
  current: { patch: string; revision?: string },
): ReviewCommentPlacement {
  if (current.revision !== undefined && current.revision === comment.revision) {
    return { state: "anchored", startLine: comment.startLine, endLine: comment.endLine };
  }
  const anchor = comment.anchor;
  if (!anchor || anchor.lines.length === 0) return { state: "detached", reason: "unanchored" };
  const sideLines = patchSideLines(current.patch, comment.side);
  const candidates = matchStarts(sideLines, anchor.lines);
  if (candidates.length === 0) return { state: "detached", reason: "gone" };
  const resolved = resolveCandidate(sideLines, candidates, anchor);
  if (resolved === null) return { state: "detached", reason: "uncertain" };
  const startLine = sideLines[resolved].lineNumber;
  const endLine = startLine + (comment.endLine - comment.startLine);
  return { state: startLine === comment.startLine ? "anchored" : "moved", startLine, endLine };
}

/** The lines running away from an index while their numbers stay consecutive. */
function contiguousRun(sideLines: readonly PatchSideLine[], from: number, step: -1 | 1): string[] {
  const run: string[] = [];
  let previous = sideLines[from - step]?.lineNumber;
  for (let index = from; index >= 0 && index < sideLines.length && run.length < CONTEXT_LINES; index += step) {
    const line = sideLines[index];
    if (previous !== undefined && line.lineNumber !== previous + step) break;
    run.push(line.text);
    previous = line.lineNumber;
  }
  return run;
}

/** Every index where the anchored lines sit as one unbroken run. */
function matchStarts(sideLines: readonly PatchSideLine[], lines: readonly string[]): number[] {
  const starts: number[] = [];
  for (let index = 0; index + lines.length <= sideLines.length; index++) {
    let matched = true;
    for (let offset = 0; offset < lines.length; offset++) {
      const line = sideLines[index + offset];
      if (line.text !== lines[offset] || line.lineNumber !== sideLines[index].lineNumber + offset) {
        matched = false;
        break;
      }
    }
    if (matched) starts.push(index);
  }
  return starts;
}

/**
 * The one candidate that is the comment's lines, or null for no single answer.
 *
 * A tie between two equally good candidates is no answer and is reported as
 * one. Being the only candidate is not an answer either, when the line carries
 * too little to identify anything: `return null;` and `}` recur everywhere, so
 * deleting the one a comment was about leaves a survivor elsewhere in the file
 * that matches it perfectly and is a different piece of code. A line like that
 * is believed only when the text beside it agrees as well.
 */
function resolveCandidate(
  sideLines: readonly PatchSideLine[],
  candidates: readonly number[],
  anchor: ReviewCommentAnchor,
): number | null {
  const context = anchor.before.length + anchor.after.length;
  const scored = candidates.map((start) => ({ start, score: contextScore(sideLines, start, anchor) }));
  const best = Math.max(...scored.map((entry) => entry.score));
  const leaders = scored.filter((entry) => entry.score === best);
  if (leaders.length !== 1) return null;
  /*
   * A score above zero means the line immediately beside the candidate is the
   * one the comment remembers, because agreement is counted outwards from the
   * anchor and stops at the first difference. That is the corroboration a
   * slight line needs. A blank one needs every neighbour it remembers, having
   * nothing of its own to offer.
   */
  const weak = anchorStrength(anchor.lines);
  if (weak === "blank" && (context === 0 || best < context)) return null;
  if (weak === "slight" && best === 0) return null;
  return leaders[0].start;
}

/**
 * How much a line has to say for itself.
 *
 * Twenty characters of real text is the line Reeve draws, and it is a judgement
 * rather than a measurement: shorter than that, a line is usually punctuation,
 * a brace, a short return or a keyword, and the file is likely to hold another
 * exactly like it. A line with no letters or digits at all says nothing however
 * long it is.
 */
function anchorStrength(lines: readonly string[]): "blank" | "slight" | null {
  const text = lines.join("\n").trim();
  if (text === "") return "blank";
  if (text.length < 20 || !/[\p{L}\p{N}]/u.test(text)) return "slight";
  return null;
}

/** How many of the remembered neighbours are still beside this candidate. */
function contextScore(sideLines: readonly PatchSideLine[], start: number, anchor: ReviewCommentAnchor): number {
  const before = contiguousRun(sideLines, start - 1, -1).slice(0, anchor.before.length).reverse();
  const after = contiguousRun(sideLines, start + anchor.lines.length, 1).slice(0, anchor.after.length);
  return agreementRun(anchor.before, before, "end") + agreementRun(anchor.after, after, "start");
}

/**
 * How far the remembered neighbours and the found ones agree, counting out
 * from the anchor and stopping at the first difference.
 *
 * Counting outwards is the point of it: a candidate that shares the line
 * immediately above is better evidence than one matching something three
 * lines away. The two runs are aligned at the end nearest the anchor, which
 * is the end that has to line up when one of them is shorter.
 */
function agreementRun(remembered: readonly string[], found: readonly string[], adjacent: "start" | "end"): number {
  const limit = Math.min(remembered.length, found.length);
  let length = 0;
  while (length < limit) {
    const index = adjacent === "start" ? length : remembered.length - 1 - length;
    const foundIndex = adjacent === "start" ? length : found.length - 1 - length;
    if (remembered[index] !== found[foundIndex]) break;
    length++;
  }
  return length;
}

/** One comment, and where the review on screen puts it. */
export interface PlacedReviewComment {
  comment: ReviewComment;
  placement: ReviewCommentPlacement;
}

/**
 * Every comment, placed against the files this review is showing.
 *
 * One pass, one answer, so that the diff a comment is drawn on and the text
 * handed to the composer cannot come to disagree about where it belongs.
 *
 * A comment whose file is not in the review at all is still in the answer. Its
 * file may have been committed, reverted, or filtered out of this scope, and
 * none of those are reasons to stop showing somebody their own note.
 */
export function placeReviewComments(
  comments: readonly ReviewComment[],
  files: ReadonlyMap<string, { patch: string; revision?: string }>,
): PlacedReviewComment[] {
  return comments.map((comment) => {
    const file = files.get(comment.path);
    return {
      comment,
      placement: file ? placeReviewComment(comment, file) : { state: "detached", reason: "absent" },
    };
  });
}
