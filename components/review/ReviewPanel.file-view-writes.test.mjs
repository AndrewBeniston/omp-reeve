/**
 * How the panel accepts a file-view write.
 *
 * The scroll keeper writes from an unmount cleanup, so its write arrives after
 * the render that made its handler. Two things must hold: the write must not
 * carry that render's whole selection back, and a write from the owner that
 * has just left must not land on the owner now on screen. The panel cannot be
 * mounted without its Git reads, so both are asserted against the source it is
 * composed from, the way the options menu's order already is.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("./ReviewPanel.tsx", import.meta.url), "utf8");

test("the file-view write goes through the owner-checked handler", () => {
  assert.match(panel, /onFileViewChange=\{\(fileView\) => applyFileView\(ownerKey, fileView\)\}/);
  assert.doesNotMatch(panel, /onFileViewChange=\{\(fileView\) => onSelectionChange\(\{ \.\.\.selection, fileView \}\)\}/,
    "a file-view write spread the selection captured at render time");
});

test("the handler drops a write from an owner that has left", () => {
  const start = panel.indexOf("const applyFileView = useCallback(");
  assert.notEqual(start, -1, "the panel has one owner-checked file-view handler");
  const body = panel.slice(start, panel.indexOf("}, [onSelectionChange]);", start));
  assert.match(body, /if \(owner !== currentOwner\.current\) return;/);
  assert.match(body, /onSelectionChange\(\{ \.\.\.latestSelection\.current, fileView \}\)/);
});

test("the panel holds the selection that is current, for a late write", () => {
  assert.match(panel, /const latestSelection = useRef\(selection\);\n  latestSelection\.current = selection;/);
});
