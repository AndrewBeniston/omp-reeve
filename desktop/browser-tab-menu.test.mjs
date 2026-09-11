import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createBrowserTabMenuTemplate } = require("./desktop-runtime.cjs");

function build(hasUrl) {
  const chosen = [];
  const template = createBrowserTabMenuTemplate({ hasUrl, onAction: (a) => chosen.push(a) });
  return { template, chosen };
}

test("the menu is the reference application's own, in its order", () => {
  const { template } = build(true);

  // Read from the reference's shipped bundle: one entry, a separator, then the
  // five that act on the page. Its last group forks a conversation from the tab,
  // which Reeve has no concept of, so those are absent rather than invented.
  assert.deepEqual(
    template.map((entry) => entry.type === "separator" ? "---" : entry.label),
    [
      "New tab to the right",
      "---",
      "Reload",
      "Duplicate",
      "Rename",
      "Copy URL",
      "Open in external browser",
    ],
  );
});

test("a Tab that has been nowhere offers only what makes sense", () => {
  const { template } = build(false);
  const byLabel = Object.fromEntries(
    template.filter((e) => e.label).map((e) => [e.label, e.enabled]),
  );

  // Nothing to duplicate, copy or hand to the system browser yet.
  assert.equal(byLabel["Duplicate"], false);
  assert.equal(byLabel["Copy URL"], false);
  assert.equal(byLabel["Open in external browser"], false);

  // Reload stays: a Tab that failed to load is exactly when somebody reaches
  // for it. Rename and New tab to the right do not need an address either.
  assert.notEqual(byLabel["Reload"], false);
  assert.notEqual(byLabel["Rename"], false);
  assert.notEqual(byLabel["New tab to the right"], false);
});

test("every entry reports the action the renderer switches on", () => {
  const { template, chosen } = build(true);
  for (const entry of template) entry.click?.();

  assert.deepEqual(chosen, [
    "new-tab-right",
    "reload",
    "duplicate",
    "rename",
    "copy-url",
    "open-external",
  ]);
});
