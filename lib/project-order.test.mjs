import assert from "node:assert/strict";
import test from "node:test";

import {
  applySavedProjectOrder,
  mergeVisibleProjectOrder,
  normalizeProjectOrder,
  reorderProjectIds,
} from "./project-order.ts";

test("normalizes saved project order without empty or duplicate entries", () => {
  assert.deepEqual(
    normalizeProjectOrder(["/projects/a", "", "/projects/a", 42, "/projects/b"]),
    ["/projects/a", "/projects/b"],
  );
});

test("matches Codex by placing new projects before the saved order", () => {
  assert.deepEqual(
    applySavedProjectOrder(
      ["/projects/new", "/projects/b", "/projects/a"],
      ["/projects/a", "/projects/b", "/projects/missing"],
    ),
    ["/projects/new", "/projects/a", "/projects/b"],
  );
});

test("moves a project to the hovered project position", () => {
  assert.deepEqual(
    reorderProjectIds(["a", "b", "c", "d"], "d", "b"),
    ["a", "d", "b", "c"],
  );
  assert.deepEqual(
    reorderProjectIds(["a", "b", "c", "d"], "a", "c"),
    ["b", "c", "a", "d"],
  );
});

test("preserves hidden project positions when a filtered list is reordered", () => {
  assert.deepEqual(
    mergeVisibleProjectOrder(
      ["a", "hidden-1", "b", "hidden-2", "c"],
      ["a", "b", "c"],
      ["c", "a", "b"],
    ),
    ["c", "hidden-1", "a", "hidden-2", "b"],
  );
});
