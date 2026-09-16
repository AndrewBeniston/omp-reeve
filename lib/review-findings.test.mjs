import assert from "node:assert/strict";
import test from "node:test";
import {
  placeReviewFinding,
  placeReviewFindings,
  placedFindingsForFile,
  reviewFindingPath,
  reviewFindingSitsOnALine,
  reviewFindingsComposerText,
} from "./review-findings.ts";

/** The patch the review request was composed against: line 3 is the changed line. */
const REVIEWED = [
  "@@ -1,6 +1,6 @@",
  " const alpha = 1;",
  " const bravo = 2;",
  "-const charlie = 0;",
  "+const charlie = 3;",
  " const delta = 4;",
  " const echo = 5;",
  " const foxtrot = 6;",
  "",
].join("\n");

/** The same file after two lines were added above the reviewed one. */
const MOVED = [
  "@@ -1,8 +1,8 @@",
  " const one = 1;",
  " const two = 2;",
  " const alpha = 1;",
  " const bravo = 2;",
  "-const charlie = 0;",
  "+const charlie = 3;",
  " const delta = 4;",
  " const echo = 5;",
  " const foxtrot = 6;",
  "",
].join("\n");

/** The same file with the reviewed line taken out altogether. */
const GONE = [
  "@@ -1,6 +1,5 @@",
  " const alpha = 1;",
  " const bravo = 2;",
  "-const charlie = 0;",
  " const delta = 4;",
  " const echo = 5;",
  " const foxtrot = 6;",
  "",
].join("\n");

function finding(overrides = {}) {
  return {
    id: "e1#0",
    entryId: "e1",
    directiveIndex: 0,
    path: "lib/values.ts",
    side: "additions",
    startLine: 3,
    endLine: 3,
    title: "Wrong constant",
    body: "This should be four.",
    requestId: "r1",
    createdAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

test("the reviewed revision still on screen anchors the finding", () => {
  assert.deepEqual(
    placeReviewFinding(finding(), { revision: "rev-1", patch: REVIEWED }, { patch: REVIEWED, revision: "rev-1" }),
    { state: "anchored", startLine: 3, endLine: 3 },
  );
});

test("lines that moved are followed from the reviewed patch", () => {
  assert.deepEqual(
    placeReviewFinding(finding(), { revision: "rev-1", patch: REVIEWED }, { patch: MOVED, revision: "rev-2" }),
    { state: "moved", startLine: 5, endLine: 5 },
  );
});

test("lines that are gone detach rather than move to a neighbour", () => {
  assert.deepEqual(
    placeReviewFinding(finding(), { revision: "rev-1", patch: REVIEWED }, { patch: GONE, revision: "rev-3" }),
    { state: "detached", reason: "gone" },
  );
});

test("no record of what the model read leaves the finding on no line", () => {
  assert.deepEqual(
    placeReviewFinding(finding(), undefined, { patch: REVIEWED, revision: "rev-1" }),
    { state: "unplaced", reason: "no-provenance" },
  );
});

test("an unkept reviewed patch on a file that has since changed leaves it on no line", () => {
  assert.deepEqual(
    placeReviewFinding(finding(), { revision: "rev-1" }, { patch: MOVED, revision: "rev-2" }),
    { state: "unplaced", reason: "revision-changed" },
  );
});

test("an unkept reviewed patch is taken from the diff only when the revision proves it", () => {
  assert.deepEqual(
    placeReviewFinding(finding(), { revision: "rev-1" }, { patch: REVIEWED, revision: "rev-1" }),
    { state: "anchored", startLine: 3, endLine: 3 },
  );
});

test("a line the reviewed diff never showed is refused", () => {
  assert.deepEqual(
    placeReviewFinding(finding({ startLine: 900, endLine: 900 }), { revision: "rev-1", patch: REVIEWED }, { patch: REVIEWED, revision: "rev-1" }),
    { state: "unplaced", reason: "line-not-reviewed" },
  );
});

test("a file the review is not showing keeps the finding off every diff", () => {
  const placed = placeReviewFindings([finding()], new Map([["lib/values.ts", { revision: "rev-1", patch: REVIEWED }]]), new Map());
  assert.deepEqual(placed[0].placement, { state: "unplaced", reason: "outside-review" });
});

test("a path that leaves the repository, or names a machine, is refused", () => {
  assert.equal(reviewFindingPath("lib/a.ts"), "lib/a.ts");
  assert.equal(reviewFindingPath("./lib/a.ts"), "lib/a.ts");
  assert.equal(reviewFindingPath("/etc/passwd"), null);
  assert.equal(reviewFindingPath("C:\\Windows\\a.ts"), null);
  assert.equal(reviewFindingPath("../outside/a.ts"), null);
  assert.equal(reviewFindingPath("lib/../../a.ts"), null);
  assert.equal(reviewFindingPath("   "), null);
});

test("the findings of one file are the ones that name it", () => {
  const mine = { finding: finding(), placement: { state: "anchored", startLine: 3, endLine: 3 } };
  const other = { finding: finding({ id: "e2#0", path: "lib/other.ts" }), placement: { state: "file-level" } };
  assert.deepEqual(placedFindingsForFile([mine, other], "lib/values.ts"), [mine]);
});

test("only an anchored or a moved finding has a line to sit on", () => {
  const line = (state) => reviewFindingSitsOnALine({ finding: finding(), placement: { state, startLine: 3, endLine: 3 } });
  assert.equal(line("anchored"), true);
  assert.equal(line("moved"), true);
  assert.equal(line("detached"), false);
  assert.equal(line("unplaced"), false);
});

test("a finding handed to the composer names the lines it is on now", () => {
  const text = reviewFindingsComposerText(
    [{ finding: finding(), placement: { state: "moved", startLine: 5, endLine: 6 } }],
    (path) => `./${path}`,
  );
  assert.match(text, /^Findings from the review:\n/);
  assert.match(text, /lib\/values\.ts/);
  assert.match(text, /5-6|5–6|#L5/);
  assert.match(text, /Wrong constant — This should be four\./);
});

test("a finding on no line names its file and what it was written against", () => {
  const detached = reviewFindingsComposerText(
    [{ finding: finding(), placement: { state: "detached", reason: "gone" } }],
    (path) => path,
  );
  assert.match(detached, /written against line 3, which this review cannot show now/);
  const fileLevel = reviewFindingsComposerText(
    [{ finding: finding({ startLine: undefined, endLine: undefined }), placement: { state: "unplaced", reason: "file-level" } }],
    (path) => path,
  );
  assert.match(fileLevel, /about the file rather than a line of it/);
  assert.equal(reviewFindingsComposerText([], (path) => path), "");
});
