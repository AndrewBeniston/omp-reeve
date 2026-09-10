import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, domDocument, mount, press, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { SettingsSearchResults } = await jiti.import("./SettingsSearchResults.tsx");
const h = React.createElement;

const results = [
  { id: "section:access", kind: "section", label: "Security", context: "Personal", sectionId: "access", icon: "access" },
  { id: "field:retry.maxRetries", kind: "field", label: "Retry Attempts", context: "Agent behavior · Retry & Fallback", sectionId: "settings:model", fieldPath: "retry.maxRetries", icon: "model" },
];

test("renders readable Settings destinations and activates them from the keyboard", async () => {
  const selected = [];
  const view = await mount(h(SettingsSearchResults, { results, onSelect: (result) => selected.push(result.id) }));
  const list = view.container.querySelector("[aria-label='Settings search results']");
  const buttons = list.querySelectorAll("button");

  assert.ok(list);
  assert.equal(buttons.length, 2);
  assert.match(textOf(buttons[0]), /Security/);
  assert.match(textOf(buttons[0]), /Personal/);
  assert.match(textOf(buttons[1]), /Retry Attempts/);
  assert.equal(buttons[0].getAttribute("tabindex"), "0");
  assert.equal(buttons[1].getAttribute("tabindex"), "-1");

  buttons[0].focus();
  await press(buttons[0], "ArrowDown");
  assert.equal(domDocument.activeElement, buttons[1]);
  await press(buttons[1], "Enter");
  assert.deepEqual(selected, ["field:retry.maxRetries"]);

  await click(buttons[0]);
  assert.deepEqual(selected, ["field:retry.maxRetries", "section:access"]);
  await view.unmount();
});

test("shows a clear empty state and uses only semantic theme tokens", async () => {
  const view = await mount(h(SettingsSearchResults, { results: [], onSelect() {} }));
  const css = await readFile(new URL("./settings-search-results.module.css", import.meta.url), "utf8");

  assert.match(textOf(view.container), /No results found/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|\brgba?\(|\bInter\b/i);
  assert.match(css, /var\(--ui-row-hover\)/);
  assert.match(css, /outline:\s*var\(--ui-focus-ring\)/);
  await view.unmount();
});
