import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createJiti } from "jiti";
import { React, click, mount, settle, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ApprovalModeSelector } = await jiti.import("./ApprovalModeSelector.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

async function renderSelector(props = {}) {
  return mount(h(I18nProvider, null, h(ApprovalModeSelector, {
    mode: "yolo",
    changing: false,
    error: null,
    restricted: false,
    onChange() {},
    onTrust() {},
    ...props,
  })));
}

test("matches the Codex approval menu structure and copy", async () => {
  const view = await renderSelector();
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  assert.equal(textOf(trigger), "Full access");

  await click(trigger);
  await settle();
  const text = textOf(view.container);
  assert.match(text, /How should Reeve actions be approved\?/);
  assert.match(text, /Learn more/);
  assert.match(text, /Ask for approval/);
  assert.match(text, /Approve for me/);
  assert.match(text, /Full access/);
  assert.match(text, /Always ask to edit external files and use the internet/);
  assert.match(text, /Only ask for actions detected as potentially unsafe/);
  assert.match(text, /Unrestricted access to the internet and any file on your computer/);
  const learnMore = Array.from(view.container.querySelectorAll("button"))
    .find((button) => textOf(button) === "Learn more");
  assert.equal(learnMore?.getAttribute("type"), "button");
  assert.ok(view.container.querySelector("[role='menuitemradio'][aria-checked='true']"));

  await view.unmount();
});

test("selects a real OMP approval mode and closes the menu", async () => {
  let selected = null;
  const view = await renderSelector({ onChange: (mode) => { selected = mode; } });
  await click(view.container.querySelector("[aria-haspopup='menu']"));
  await settle();
  const option = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((item) => textOf(item).includes("Approve for me"));
  await click(option);
  assert.equal(selected, "write");
  assert.equal(view.container.querySelector("[aria-haspopup='menu']")?.getAttribute("aria-expanded"), "false");
  await view.unmount();
});

test("matches the measured Codex menu geometry", async () => {
  const css = await readFile(new URL("./approval-mode-selector.module.css", import.meta.url), "utf8");
  assert.match(css, /\.menu\s*\{[^}]*width:\s*min\(440px, calc\(100vw - 32px\)\)/s);
  assert.match(css, /\.menu\s*\{[^}]*bottom:\s*calc\(100% \+ var\(--space-1\)\)/s);
  assert.match(css, /\.menuHeader\s*\{[^}]*min-height:\s*32px/s);
  assert.match(css, /\.option\s*\{[^}]*min-height:\s*42px/s);
  assert.match(css, /\.option\s*\{[^}]*padding-block:\s*var\(--space-1\)/s);
});

test("keeps the existing trust action for an untrusted project", async () => {
  let trusted = 0;
  const view = await renderSelector({ restricted: true, onTrust: () => { trusted += 1; } });
  const trigger = view.container.querySelector("button");
  assert.equal(trigger?.getAttribute("aria-label"), "Restricted mode");
  assert.equal(trigger?.hasAttribute("aria-haspopup"), false);
  await click(trigger);
  assert.equal(trusted, 1);
  await view.unmount();
});

test("disables mode changes while saving and reports a failure", async () => {
  const view = await renderSelector({ changing: true, error: "Approval mode could not be saved" });
  assert.equal(view.container.querySelector("button")?.hasAttribute("disabled"), true);
  assert.match(textOf(view.container.querySelector("[role='alert']")), /Approval mode could not be saved/);
  await view.unmount();
});
