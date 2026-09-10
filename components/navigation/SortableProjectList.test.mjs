import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("./SortableProjectList.tsx", import.meta.url);
const stylesPath = new URL("./sortable-project-list.module.css", import.meta.url);

test("uses Codex-style live sortable project movement", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /from "@dnd-kit\/core"/);
  assert.match(source, /from "@dnd-kit\/sortable"/);
  assert.match(source, /useSortable/);
  assert.match(source, /verticalListSortingStrategy/);
  assert.match(source, /<DragOverlay/);
  assert.match(source, /dropAnimation=\{null\}/);
  assert.match(source, /activationConstraint: \{ distance: 6 \}/);
  assert.doesNotMatch(source, /draggable=|onDrop=/);
});

test("keeps the source project visible and faint during a drag", async () => {
  const css = await readFile(stylesPath, "utf8");

  assert.match(css, /\.item\[data-dragging\][\s\S]*?opacity: 0\.2/);
  assert.match(css, /\.dragOverlay[\s\S]*?opacity: 0\.7/);
  assert.match(css, /\.dropIndicator/);
});
