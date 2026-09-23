import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { CHAT_DRAG_TYPE, dragDropKind } = await jiti.import("./useDragDrop.ts");

function dataTransfer({ items = [], types = [] } = {}) {
  return { items, types };
}

test("classifies any file, dropped text, and a previous chat drag", () => {
  assert.equal(dragDropKind(dataTransfer({ items: [{ kind: "file", type: "application/pdf" }] })), "file");
  assert.equal(dragDropKind(dataTransfer({ types: ["text/plain"] })), "text");
  assert.equal(dragDropKind(dataTransfer({ items: [{ kind: "string", type: CHAT_DRAG_TYPE }] })), "chat");
  assert.equal(dragDropKind(dataTransfer()), null);
});
