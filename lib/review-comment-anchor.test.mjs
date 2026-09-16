import assert from "node:assert/strict";
import test from "node:test";
import { captureReviewCommentAnchor, patchSideLines, placeReviewComment, placeReviewComments } from "./review-comment-anchor.ts";

/** The patch a comment was written against: line 3 is the changed line. */
const ORIGINAL = [
  "@@ -1,6 +1,6 @@",
  " const a = 1;",
  " const b = 2;",
  "-const c = 0;",
  "+const c = 3;",
  " const d = 4;",
  " const e = 5;",
  " const f = 6;",
  "",
].join("\n");

function comment(overrides = {}) {
  return {
    id: "c1",
    path: "src/values.ts",
    side: "additions",
    startLine: 3,
    endLine: 3,
    revision: "rev-1",
    body: "name this properly",
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
    anchor: captureReviewCommentAnchor(ORIGINAL, "additions", 3, 3),
    ...overrides,
  };
}

test("each side of a patch is read with its own line numbers", () => {
  assert.deepEqual(patchSideLines(ORIGINAL, "additions").map((line) => [line.lineNumber, line.text]), [
    [1, "const a = 1;"], [2, "const b = 2;"], [3, "const c = 3;"],
    [4, "const d = 4;"], [5, "const e = 5;"], [6, "const f = 6;"],
  ]);
  // The deleted line is line 3 of the old file, and the added one is not there.
  assert.deepEqual(patchSideLines(ORIGINAL, "deletions").map((line) => [line.lineNumber, line.text]), [
    [1, "const a = 1;"], [2, "const b = 2;"], [3, "const c = 0;"],
    [4, "const d = 4;"], [5, "const e = 5;"], [6, "const f = 6;"],
  ]);
});

test("an anchor keeps the commented lines and a little of what surrounded them", () => {
  assert.deepEqual(captureReviewCommentAnchor(ORIGINAL, "additions", 3, 4), {
    lines: ["const c = 3;", "const d = 4;"],
    before: ["const a = 1;", "const b = 2;"],
    after: ["const e = 5;", "const f = 6;"],
  });
  // Lines the patch does not carry cannot be anchored to.
  assert.equal(captureReviewCommentAnchor(ORIGINAL, "additions", 6, 9), undefined);
});

test("a comment is left alone only on the revision it was written against", () => {
  const moved = [
    "@@ -1,6 +1,8 @@",
    "+const zero = 0;",
    "+const half = 0.5;",
    " const a = 1;",
    " const b = 2;",
    " const c = 3;",
    " const d = 4;",
    " const e = 5;",
    " const f = 6;",
    "",
  ].join("\n");
  // Same revision: the patch is not consulted, so the lines cannot drift.
  assert.deepEqual(placeReviewComment(comment(), { patch: moved, revision: "rev-1" }), {
    state: "anchored", startLine: 3, endLine: 3,
  });
  // A revision the diff cannot name is not evidence that nothing changed, so
  // the anchor is checked rather than taken on trust.
  assert.deepEqual(placeReviewComment(comment(), { patch: moved, revision: undefined }), {
    state: "moved", startLine: 5, endLine: 5,
  });
});

test("a comment follows its lines when two lines are inserted above them", () => {
  const moved = [
    "@@ -1,6 +1,8 @@",
    "+const zero = 0;",
    "+const half = 0.5;",
    " const a = 1;",
    " const b = 2;",
    " const c = 3;",
    " const d = 4;",
    " const e = 5;",
    " const f = 6;",
    "",
  ].join("\n");
  assert.deepEqual(placeReviewComment(comment(), { patch: moved, revision: "rev-2" }), {
    state: "moved", startLine: 5, endLine: 5,
  });
  // A range keeps its length as it follows.
  assert.deepEqual(placeReviewComment(comment({ startLine: 3, endLine: 4, anchor: captureReviewCommentAnchor(ORIGINAL, "additions", 3, 4) }), { patch: moved, revision: "rev-2" }), {
    state: "moved", startLine: 5, endLine: 6,
  });
});

test("a comment whose line was deleted stays, detached", () => {
  const deleted = [
    "@@ -1,6 +1,5 @@",
    " const a = 1;",
    " const b = 2;",
    "-const c = 3;",
    " const d = 4;",
    " const e = 5;",
    " const f = 6;",
    "",
  ].join("\n");
  assert.deepEqual(placeReviewComment(comment(), { patch: deleted, revision: "rev-3" }), {
    state: "detached", reason: "gone",
  });
});

test("neighbours decide between two identical candidates", () => {
  const twins = [
    "@@ -1,8 +1,8 @@",
    " const a = 1;",
    " const b = 2;",
    " const c = 3;",
    " const d = 4;",
    " const a = 1;",
    " const b = 2;",
    " const c = 3;",
    " const f = 6;",
    "",
  ].join("\n");
  // Both candidates follow "const b = 2;". Only the first is followed by
  // "const d = 4;", which is what the comment remembers.
  assert.deepEqual(placeReviewComment(comment(), { patch: twins, revision: "rev-4" }), {
    state: "anchored", startLine: 3, endLine: 3,
  });
});

test("a tie between two equally good candidates detaches rather than guesses", () => {
  const original = [
    "@@ -1,3 +1,3 @@",
    " const a = 1;",
    " const b = 2;",
    "-const c = 0;",
    "+const c = 3;",
    "",
  ].join("\n");
  const duplicated = [
    "@@ -1,6 +1,6 @@",
    " const a = 1;",
    " const b = 2;",
    " const c = 3;",
    " const a = 1;",
    " const b = 2;",
    " const c = 3;",
    "",
  ].join("\n");
  const ambiguous = comment({ anchor: captureReviewCommentAnchor(original, "additions", 3, 3) });
  assert.deepEqual(placeReviewComment(ambiguous, { patch: duplicated, revision: "rev-5" }), {
    state: "detached", reason: "uncertain",
  });
});

test("a blank line is never believed on its own", () => {
  const blank = ["@@ -1 +1 @@", "-const x = 1;", "+", ""].join("\n");
  const unchanged = ["@@ -1 +1 @@", "-const x = 1;", "+", ""].join("\n");
  const onBlank = comment({ startLine: 1, endLine: 1, anchor: captureReviewCommentAnchor(blank, "additions", 1, 1) });
  assert.deepEqual(onBlank.anchor, { lines: [""], before: [], after: [] });
  assert.deepEqual(placeReviewComment(onBlank, { patch: unchanged, revision: "rev-6" }), {
    state: "detached", reason: "uncertain",
  });
});


test("a short line that was deleted does not move to a survivor that matches it", () => {
  // The comment is on the "return null;" of the first function. That line is
  // deleted, and the only other line exactly like it belongs to a different
  // function. Unique is not the same as identified.
  const original = [
    "@@ -1,4 +1,4 @@",
    " function first() {",
    "   const value = compute();",
    "-  return undefined;",
    "+  return null;",
    " }",
    "",
  ].join("\n");
  const deleted = [
    "@@ -1,8 +1,7 @@",
    " function first() {",
    "   const value = compute();",
    "-  return null;",
    " }",
    " ",
    " function second() {",
    "   if (missing) return;",
    "   return null;",
    "",
  ].join("\n");
  const onReturn = comment({ anchor: captureReviewCommentAnchor(original, "additions", 3, 3) });
  assert.deepEqual(onReturn.anchor.lines, ["  return null;"]);
  assert.deepEqual(placeReviewComment(onReturn, { patch: deleted, revision: "rev-8" }), {
    state: "detached", reason: "uncertain",
  });
});

test("a comment whose file has left the review is detached, not dropped", () => {
  // The file was committed, reverted, or is outside this scope. Either way the
  // remark is still somebody's, and the answer has to keep it.
  const placed = placeReviewComments(
    [comment(), comment({ id: "c2", path: "src/gone.ts" })],
    new Map([["src/values.ts", { patch: ORIGINAL, revision: "rev-1" }]]),
  );
  assert.deepEqual(placed.map((entry) => entry.placement), [
    { state: "anchored", startLine: 3, endLine: 3 },
    { state: "detached", reason: "absent" },
  ]);
});

test("a comment saved before anchors existed stays visible, detached", () => {
  const withoutAnchor = comment({ anchor: undefined });
  assert.deepEqual(placeReviewComment(withoutAnchor, { patch: ORIGINAL, revision: "rev-7" }), {
    state: "detached", reason: "unanchored",
  });
});
