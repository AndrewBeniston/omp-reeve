import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { buildReviewTree, flattenReviewTree, reviewTreeKeyAction } = await jiti.import("./review-file-tree.ts");

const file = (path, additions = 1, deletions = 0) => ({
  path, additions, deletions, binary: false, conflicted: false, patch: "",
});

const rowsFor = (paths, collapsed = new Set()) =>
  flattenReviewTree(buildReviewTree(paths.map((path) => file(path)), new Set()), collapsed);

test("a single-child folder chain is one row, and a file keeps its own", () => {
  const rows = rowsFor(["docs/adr/deep/one.md", "docs/adr/deep/two.md", "README.md"]);
  assert.deepEqual(rows.map((row) => [row.path, row.kind, row.depth]), [
    ["docs/adr/deep", "folder", 0],
    ["docs/adr/deep/one.md", "file", 1],
    ["docs/adr/deep/two.md", "file", 1],
    ["README.md", "file", 0],
  ]);
});

test("a collapsed folder hides its children and keeps itself walkable", () => {
  const rows = rowsFor(["lib/a.ts", "lib/b.ts", "README.md"], new Set(["lib"]));
  assert.deepEqual(rows.map((row) => row.path), ["lib", "README.md"]);
  assert.equal(rows[0].expanded, false);
});

test("up and down walk every visible row, and home and end reach the ends", () => {
  const rows = rowsFor(["lib/a.ts", "lib/b.ts", "README.md"]);
  assert.deepEqual(reviewTreeKeyAction(rows, "lib", "ArrowDown"), { kind: "focus", path: "lib/a.ts" });
  assert.deepEqual(reviewTreeKeyAction(rows, "lib/b.ts", "ArrowUp"), { kind: "focus", path: "lib/a.ts" });
  assert.deepEqual(reviewTreeKeyAction(rows, "README.md", "Home"), { kind: "focus", path: "lib" });
  assert.deepEqual(reviewTreeKeyAction(rows, "lib", "End"), { kind: "focus", path: "README.md" });
  // The ends are ends: nothing wraps.
  assert.equal(reviewTreeKeyAction(rows, "lib", "ArrowUp"), null);
  assert.equal(reviewTreeKeyAction(rows, "README.md", "ArrowDown"), null);
});

test("right expands then descends, left collapses then climbs", () => {
  const collapsed = rowsFor(["lib/a.ts"], new Set(["lib"]));
  assert.deepEqual(reviewTreeKeyAction(collapsed, "lib", "ArrowRight"), { kind: "expand", path: "lib" });

  const open = rowsFor(["lib/a.ts", "lib/b.ts"]);
  assert.deepEqual(reviewTreeKeyAction(open, "lib", "ArrowRight"), { kind: "focus", path: "lib/a.ts" });
  assert.deepEqual(reviewTreeKeyAction(open, "lib", "ArrowLeft"), { kind: "collapse", path: "lib" });
  assert.deepEqual(reviewTreeKeyAction(open, "lib/b.ts", "ArrowLeft"), { kind: "focus", path: "lib" });
  // A file at the root has no parent to climb to, and no child to enter.
  const flat = rowsFor(["README.md"]);
  assert.equal(reviewTreeKeyAction(flat, "README.md", "ArrowLeft"), null);
  assert.equal(reviewTreeKeyAction(flat, "README.md", "ArrowRight"), null);
});

test("enter selects a file and discloses a folder, and v marks a file viewed", () => {
  const rows = rowsFor(["lib/a.ts"]);
  assert.deepEqual(reviewTreeKeyAction(rows, "lib/a.ts", "Enter"), { kind: "select", path: "lib/a.ts" });
  assert.deepEqual(reviewTreeKeyAction(rows, "lib", "Enter"), { kind: "collapse", path: "lib" });
  assert.deepEqual(reviewTreeKeyAction(rows, "lib/a.ts", "v"), { kind: "toggle-viewed", path: "lib/a.ts" });
  // A folder has nothing to mark viewed, and an unhandled key is left alone.
  assert.equal(reviewTreeKeyAction(rows, "lib", "v"), null);
  assert.equal(reviewTreeKeyAction(rows, "lib/a.ts", "x"), null);
});

test("a row that has gone leaves the walk at the first row", () => {
  const rows = rowsFor(["lib/a.ts"]);
  assert.deepEqual(reviewTreeKeyAction(rows, "gone.ts", "ArrowDown"), { kind: "focus", path: "lib" });
  assert.equal(reviewTreeKeyAction([], "lib", "ArrowDown"), null);
});
