import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { stepTabIndex } = await jiti.import("./panel-actions.ts");

test("a step through the Tab strip wraps at both ends", () => {
  assert.equal(stepTabIndex(3, 0, 1), 1);
  assert.equal(stepTabIndex(3, 2, 1), 0);
  assert.equal(stepTabIndex(3, 0, -1), 2);
  assert.equal(stepTabIndex(1, 0, 1), 0);
});

test("a step with nothing open lands nowhere", () => {
  assert.equal(stepTabIndex(0, -1, 1), null);
  assert.equal(stepTabIndex(0, 0, -1), null);
});

test("a step from a Tab that is no longer in the strip starts at the first", () => {
  // One render after a close, the active id can name a Tab that has gone.
  assert.equal(stepTabIndex(3, -1, 1), 1);
  assert.equal(stepTabIndex(3, 9, 1), 1);
  assert.equal(stepTabIndex(3, -1, -1), 2);
});
