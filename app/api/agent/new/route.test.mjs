import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { parseRequestedThinkingLevel } = await createJiti(import.meta.url).import("../../../../lib/thinking-level.ts");

test("accepts OMP's Auto selector for a new Session", () => {
  assert.equal(parseRequestedThinkingLevel("auto"), "auto");
  assert.equal(parseRequestedThinkingLevel("med"), "medium");
  assert.throws(() => parseRequestedThinkingLevel("unknown"), /Invalid thinking level/);
});
