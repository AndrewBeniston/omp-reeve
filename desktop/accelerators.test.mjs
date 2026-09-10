import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PANEL_ACCELERATORS, matchAccelerator } = require("./desktop-runtime.cjs");

/** An Electron before-input-event input, with no modifiers unless named. */
function press(key, modifiers = {}) {
  return {
    type: "keyDown",
    key,
    meta: false,
    control: false,
    alt: false,
    shift: false,
    ...modifiers,
  };
}

test("the accelerators are the reference application's five", () => {
  assert.deepEqual(Object.entries(PANEL_ACCELERATORS), [
    ["Ctrl+Shift+G", "review"],
    ["Control+`", "terminal"],
    ["CmdOrCtrl+T", "browser"],
    ["CmdOrCtrl+P", "files"],
    ["CmdOrCtrl+Alt+S", "side-chat"],
  ]);
});

test("CmdOrCtrl is Command on darwin and Control elsewhere", () => {
  assert.equal(matchAccelerator(press("t", { meta: true }), "darwin"), "browser");
  assert.equal(matchAccelerator(press("t", { control: true }), "win32"), "browser");

  // The wrong one for the platform must not fire.
  assert.equal(matchAccelerator(press("t", { control: true }), "darwin"), null);
  assert.equal(matchAccelerator(press("t", { meta: true }), "win32"), null);
});

test("Control means Control even on darwin, which the terminal chord needs", () => {
  assert.equal(matchAccelerator(press("`", { control: true }), "darwin"), "terminal");
  // Command+backtick is a different chord and must not open a Terminal.
  assert.equal(matchAccelerator(press("`", { meta: true }), "darwin"), null);
});

test("an unnamed modifier must be absent", () => {
  // Cmd+Shift+T is not Cmd+T. A matcher that ignored Shift would fire here.
  assert.equal(matchAccelerator(press("t", { meta: true, shift: true }), "darwin"), null);
  assert.equal(matchAccelerator(press("p", { meta: true, alt: true }), "darwin"), null);
});

test("every accelerator resolves to its own action", () => {
  assert.equal(matchAccelerator(press("g", { control: true, shift: true }), "darwin"), "review");
  assert.equal(matchAccelerator(press("p", { meta: true }), "darwin"), "files");
  assert.equal(matchAccelerator(press("s", { meta: true, alt: true }), "darwin"), "side-chat");
});

test("a key release is not a press", () => {
  const release = { ...press("t", { meta: true }), type: "keyUp" };
  assert.equal(matchAccelerator(release, "darwin"), null);
});

test("an unrelated chord matches nothing", () => {
  assert.equal(matchAccelerator(press("k", { meta: true }), "darwin"), null);
  assert.equal(matchAccelerator(press("t"), "darwin"), null);
});

test("a malformed event is refused rather than throwing", () => {
  assert.equal(matchAccelerator(null, "darwin"), null);
  assert.equal(matchAccelerator({ type: "keyDown" }, "darwin"), null);
});

