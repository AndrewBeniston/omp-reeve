import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, domDocument, mount, press, settle, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { OpenWithMenu } = await jiti.import("./OpenWithMenu.tsx");
const h = React.createElement;

const LISTING = {
  mode: "editor",
  preferredTargetId: "vscode",
  targets: [
    { id: "vscode", label: "Visual Studio Code", kind: "editor", hidden: false, available: true },
    { id: "zed", label: "Zed", kind: "editor", hidden: false, available: true },
    { id: "idea", label: "IntelliJ IDEA", kind: "editor", hidden: false, available: false },
    { id: "finder", label: "Finder", kind: "file-manager", hidden: false, available: true },
  ],
};

async function openMenu(listing = LISTING) {
  globalThis.fetch = async () => ({ ok: true, json: async () => listing });
  const view = await mount(h(OpenWithMenu, { filePath: "/repo/notes.csv", line: 12 }));
  await settle();
  const trigger = Array.from(view.container.querySelectorAll("button"))
    .find((element) => textOf(element) === "Open with…");
  await click(trigger);
  await settle();
  return { view, trigger, items: view.container.querySelectorAll("[role='menuitem']") };
}

test("opening the menu focuses its first usable entry", async () => {
  const { view, items } = await openMenu();

  assert.deepEqual(items.map((item) => textOf(item)), ["Zed", "IntelliJ IDEANot installed", "Finder"]);
  assert.equal(domDocument.activeElement, items[0]);
  // One entry at a time takes the Tab stop. That is roving focus.
  assert.deepEqual(items.map((item) => item.getAttribute("tabindex")), ["0", "-1", "-1"]);
  await view.unmount();
});

test("the arrow keys move focus and step over an application that is not installed", async () => {
  const { view, items } = await openMenu();

  await press(items[0], "ArrowDown");
  assert.equal(domDocument.activeElement, items[2]);
  assert.deepEqual(items.map((item) => item.getAttribute("tabindex")), ["-1", "-1", "0"]);

  // The last entry wraps to the first one.
  await press(items[2], "ArrowDown");
  assert.equal(domDocument.activeElement, items[0]);

  await press(items[0], "ArrowUp");
  assert.equal(domDocument.activeElement, items[2]);
  await view.unmount();
});

test("Escape closes the menu and gives the focus back to the trigger", async () => {
  const { view, trigger, items } = await openMenu();

  await press(items[0], "Escape");
  await settle();

  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(view.container.querySelector("[role='menu']").getAttribute("aria-hidden"), "true");
  assert.equal(domDocument.activeElement, trigger);
  // A closed menu holds no Tab stop.
  assert.deepEqual(
    view.container.querySelectorAll("[role='menuitem']").map((item) => item.getAttribute("tabindex")),
    ["-1", "-1", "-1"],
  );
  await view.unmount();
});
