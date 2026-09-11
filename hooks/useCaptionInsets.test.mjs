import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false, tryNative: false });
const { readCaptionInsets } = await jiti.import("./useCaptionInsets.ts");

test("a caption strip on the trailing edge is measured, not assumed", () => {
  // Windows leaves the page 1142px of a 1280px window and keeps the rest for
  // its three caption buttons.
  const insets = readCaptionInsets({ x: 0, y: 0, width: 1142, height: 36 }, 1280);

  assert.deepEqual(insets, { start: 0, end: 138 });
});

test("a caption strip on the leading edge is measured the same way", () => {
  // A right-to-left window puts the buttons on the other side. The same
  // arithmetic covers it, so nothing asks which side they are on.
  const insets = readCaptionInsets({ x: 138, y: 0, width: 1142, height: 36 }, 1280);

  assert.deepEqual(insets, { start: 138, end: 0 });
});

test("a window with no caption strip reserves nothing", () => {
  const insets = readCaptionInsets({ x: 0, y: 0, width: 1280, height: 36 }, 1280);

  assert.deepEqual(insets, { start: 0, end: 0 });
});

test("a rectangle wider than its window never reserves a negative width", () => {
  const insets = readCaptionInsets({ x: 0, y: 0, width: 1300, height: 36 }, 1280);

  assert.deepEqual(insets, { start: 0, end: 0 });
});

