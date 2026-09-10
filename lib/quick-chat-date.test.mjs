import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { quickChatDate } = await createJiti(import.meta.url).import("./quick-chat-date.ts");
test("Quick chat dates match Codex calendar-day boundaries", () => {
  const now = new Date(2026, 8, 8, 12);
  const label = day => quickChatDate(new Date(2026, 8, day, 23).toISOString(), "en", "Today", "Yesterday", now);
  assert.equal(label(8), "Today");
  assert.equal(label(7), "Yesterday");
  assert.equal(label(6), "2d");
  assert.equal(label(1), "Sep 1");
});
