import assert from "node:assert/strict";
import test from "node:test";
import { hunkLineRange, patchHeader, patchHunks, singleHunkPatch, wholeFilePatch } from "./review-patch.ts";

const TWO_HUNKS = [
  "diff --git a/file.txt b/file.txt",
  "index 1111111..2222222 100644",
  "--- a/file.txt",
  "+++ b/file.txt",
  "@@ -1,3 +1,3 @@",
  "-one",
  "+one edited",
  " two",
  " three",
  "@@ -10,3 +10,3 @@",
  " ten",
  "-eleven",
  "+eleven edited",
  " twelve",
  "",
].join("\n");

test("a file's patch splits into its hunks and the header they share", () => {
  const hunks = patchHunks(TWO_HUNKS);
  assert.equal(hunks.length, 2);
  assert.equal(hunks[0], "@@ -1,3 +1,3 @@\n-one\n+one edited\n two\n three\n");
  assert.equal(hunks[1], "@@ -10,3 +10,3 @@\n ten\n-eleven\n+eleven edited\n twelve\n");
  assert.equal(patchHeader(TWO_HUNKS), "diff --git a/file.txt b/file.txt\nindex 1111111..2222222 100644\n--- a/file.txt\n+++ b/file.txt");
});

test("one hunk becomes a patch that names its file and carries nothing else", () => {
  const second = singleHunkPatch(TWO_HUNKS, 1);
  assert.match(second, /^diff --git a\/file\.txt b\/file\.txt\n/);
  assert.match(second, /\+\+\+ b\/file\.txt\n@@ -10,3 \+10,3 @@\n/);
  assert.doesNotMatch(second, /one edited/);
  assert.ok(second.endsWith("\n"));
  // A hunk position that is no longer there fails closed rather than picking a neighbour.
  assert.equal(singleHunkPatch(TWO_HUNKS, 2), null);
  assert.equal(singleHunkPatch("diff --git a/x.bin b/x.bin\nBinary files differ\n", 0), null);
});

test("the marker for a missing final newline stays with its own hunk", () => {
  const patch = [
    "diff --git a/file.txt b/file.txt",
    "--- a/file.txt",
    "+++ b/file.txt",
    "@@ -1 +1 @@",
    "-one",
    "\\ No newline at end of file",
    "+one edited",
    "\\ No newline at end of file",
    "",
  ].join("\n");
  const [hunk] = patchHunks(patch);
  assert.equal(hunk.match(/No newline at end of file/g).length, 2);
  assert.equal(singleHunkPatch(patch, 0), wholeFilePatch(patch));
});

test("a patch without a trailing newline gains one, because Git reads it from a stream", () => {
  assert.equal(wholeFilePatch("diff --git a/a b/a\n@@ -1 +1 @@\n-a\n+b"), "diff --git a/a b/a\n@@ -1 +1 @@\n-a\n+b\n");
  assert.equal(wholeFilePatch(TWO_HUNKS), TWO_HUNKS);
});

test("a hunk knows which file lines it covers on each side", () => {
  const [first, second] = patchHunks(TWO_HUNKS);
  assert.deepEqual(hunkLineRange(first), { deletions: { start: 1, end: 3 }, additions: { start: 1, end: 3 } });
  assert.deepEqual(hunkLineRange(second), { deletions: { start: 10, end: 12 }, additions: { start: 10, end: 12 } });
  // A single-line hunk omits its count, and a new file has nothing on the old side.
  assert.deepEqual(hunkLineRange("@@ -4 +4 @@\n-a\n+b\n"), { deletions: { start: 4, end: 4 }, additions: { start: 4, end: 4 } });
  assert.deepEqual(hunkLineRange("@@ -0,0 +1,2 @@\n+a\n+b\n"), { deletions: { start: 0, end: -1 }, additions: { start: 1, end: 2 } });
  assert.equal(hunkLineRange("diff --git a/a b/a\n"), null);
});
