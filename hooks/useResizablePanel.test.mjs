import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false, tryNative: false });
const { nextMaximiseState } = await jiti.import("./useResizablePanel.ts");

test("maximising fills the room and remembers the width to come back to", () => {
  const out = nextMaximiseState(432, 1180, null);

  assert.deepEqual(out, { width: 1180, restore: 432 });
});

test("a round trip returns the exact width the human chose", () => {
  const out = nextMaximiseState(1180, 1180, 432);

  assert.deepEqual(out, { width: 432, restore: null });
});

test("a panel already at its maximum still comes back", () => {
  // Dragging to the edge and then maximising must not strand the panel there.
  const maximised = nextMaximiseState(1180, 1180, null);
  assert.deepEqual(maximised, { width: 1180, restore: 1180 });

  assert.deepEqual(nextMaximiseState(1180, 1180, maximised.restore), { width: 1180, restore: null });
});
