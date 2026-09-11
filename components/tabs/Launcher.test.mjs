import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const require = createRequire(import.meta.url);
const React = require("react");
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { Launcher } = await jiti.import("./Launcher.tsx");

/**
 * The five entries, in the reference application's order, with the accelerators
 * read from its command registry.
 */
const actions = [
  { id: "review", label: "Review", keys: "⌃⇧G", unavailableReason: "Not yet available", run() {} },
  { id: "terminal", label: "Terminal", keys: "⌃`", unavailableReason: "Not yet available", run() {} },
  { id: "browser", label: "Browser", keys: "⌘T", run() {} },
  { id: "files", label: "Files", keys: "⌘P", run() {} },
  { id: "side-chat", label: "Side chat", keys: "⌥⌘S", unavailableReason: "Not yet available", run() {} },
];

function render(list = actions) {
  return renderToStaticMarkup(React.createElement(Launcher, { actions: list, label: "Suggested" }));
}

test("the launcher lists every entry in the reference application's order", () => {
  const html = render();
  const order = ["Review", "Terminal", "Browser", "Files", "Side chat"]
    .map((label) => html.indexOf(`>${label}<`));

  assert.ok(order.every((index) => index >= 0), "every entry is rendered");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "entries appear in reference order");
});

test("each available entry shows its accelerator", () => {
  const html = render();
  // Browser and Files are the two that work today.
  assert.match(html, /⌘T/);
  assert.match(html, /⌘P/);
});

test("an entry whose feature is unbuilt is listed, disabled, and says why", () => {
  const html = render();

  // Listed, because the launcher is how a human learns what the panel holds.
  assert.match(html, />Review</);
  assert.match(html, />Side chat</);
  assert.match(html, /Not yet available/);
  // Disabled rather than hidden.
  assert.match(html, /disabled/);
});

test("an unavailable entry shows its reason instead of an accelerator", () => {
  const html = render([
    { id: "review", label: "Review", keys: "⌃⇧G", unavailableReason: "Not yet available", run() {} },
  ]);

  assert.match(html, /Not yet available/);
  // The accelerator would be a promise the entry cannot keep.
  assert.doesNotMatch(html, /⌃⇧G/);
});

test("the list is announced as a list", () => {
  assert.match(render(), /role="list"[^>]*aria-label="Suggested"/);
});

