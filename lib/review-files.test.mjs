import assert from "node:assert/strict";
import test from "node:test";
import { reviewFilesFromPatch, reviewReferencePath } from "./review-files.ts";

test("Review retains binary, rename-only, and mode-only changes", () => {
  const files = reviewFilesFromPatch([
    "diff --git a/image.bin b/image.bin\nBinary files a/image.bin and b/image.bin differ\n",
    "diff --git a/old name.txt b/new name.txt\nsimilarity index 100%\nrename from old name.txt\nrename to new name.txt\n",
    "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n",
  ].join(""));
  assert.deepEqual(files.map(({ path, oldPath, binary }) => ({ path, oldPath, binary })), [
    { path: "image.bin", oldPath: "image.bin", binary: true },
    { path: "new name.txt", oldPath: "old name.txt", binary: false },
    { path: "run.sh", oldPath: "run.sh", binary: false },
  ]);
  assert.equal(files[0].additions, null);
  assert.equal(files[0].deletions, null);
  assert.equal(files[1].additions, 0);
  assert.equal(files[1].deletions, 0);
});

test("Review decodes Git's quoted UTF-8 paths and preserves path whitespace", () => {
  const files = reviewFilesFromPatch('diff --git "a/caf\\303\\251\\t.txt" "b/caf\\303\\251\\t.txt"\nBinary files differ\n');
  assert.equal(files[0].path, "café\t.txt");
  const ambiguous = reviewFilesFromPatch("diff --git a/foo b/bar  b/foo b/bar \nold mode 100644\nnew mode 100755\n");
  assert.equal(ambiguous[0].path, "foo b/bar ");
});

test("Review counts header-looking content as changes within its file", () => {
  const patch = "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1,2 +1,2 @@\n--- removed\n+++ added\n context\n";
  const [file] = reviewFilesFromPatch(patch);
  assert.equal(file.path, "file.txt");
  assert.equal(file.additions, 1);
  assert.equal(file.deletions, 1);
  assert.equal(file.patch, patch);
  assert.deepEqual(reviewFilesFromPatch(""), []);
});

test("conflicted files remain visible without presenting combined hunks as normal diffs", () => {
  const files = reviewFilesFromPatch("diff --cc conflict.txt\n@@@ -1,1 -1,1 +1,5 @@@\n++conflict markers\n", ["conflict.txt"]);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "conflict.txt");
  assert.equal(files[0].conflicted, true);
  assert.equal(files[0].additions, null);
  assert.equal(files[0].patch, "");
});

test("a Session reference names a changed file from the Session's own directory", () => {
  // The Session runs in /repo/selected, so @selected/file.txt would name a
  // file that does not exist there.
  assert.equal(reviewReferencePath("/repo", "/repo/selected", "selected/file.txt"), "file.txt");
  assert.equal(reviewReferencePath("/repo", "/repo/selected", "selected/deep/file.txt"), "deep/file.txt");
  // A Session at the repository root keeps the patch's own path.
  assert.equal(reviewReferencePath("/repo", "/repo", "selected/file.txt"), "selected/file.txt");
  assert.equal(reviewReferencePath("/repo/", "/repo", "file.txt"), "file.txt");
  assert.equal(reviewReferencePath("C:\\repo", "C:\\repo\\selected", "selected/file.txt"), "file.txt");
});
