import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { formatAppShortcut } = await createJiti(import.meta.url).import("./useShortcutLabel.ts");
test("shortcut labels match their platform modifiers", () => {
  assert.equal(formatAppShortcut("N", true), "⌘N");
  assert.equal(formatAppShortcut("N", true, true), "⌥⌘N");
  assert.equal(formatAppShortcut("K", false), "Ctrl+K");
  assert.equal(formatAppShortcut("N", false, true), "Ctrl+Alt+N");
});
