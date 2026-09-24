import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, textOf, focused, settle, press } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerAddMenu } = await jiti.import("./ComposerAddMenu.tsx");

test("the root menu shows Files, Goal, Plugins, and Skills", async () => {
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [
      { id: "commands", items: [{ id: "goal", kind: "command", label: "Goal", raw: "/goal" }] },
      { id: "plugins", items: [{ id: "computer", kind: "plugin", label: "Computer", raw: "@computer" }] },
      { id: "skills", items: [{ id: "skill", kind: "skill", label: "Example", raw: "/skill:example", detail: "A long skill description" }] },
    ],
    labels: { add: "Add", images: "Attach image", files: "Files and folders", goal: "Goal", groups: { commands: "Commands", plugins: "Plugins", skills: "Skills" } },
    onAttachImages() {}, onBrowseFiles() {}, onSelect() {},
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  const rows = Array.from(document.body.querySelectorAll("[role='menuitem']")).map(textOf);
  try {
    assert.deepEqual(rows, ["Files and folders›", "Goal", "Plugins›", "Skills›"]);
    assert.equal(view.container.querySelector("[role='menu']"), null, "the popup mounts outside the Composer");
    await click(rows.length ? Array.from(document.body.querySelectorAll("[role='menuitem']"))[3] : null);
    const menu = document.body.querySelector("[role='menu']");
    assert.equal(menu.getAttribute("aria-label"), "Skills");
    assert.deepEqual(Array.from(menu.querySelectorAll("[role='menuitem']")).map(textOf), ["←Add", "ExampleA long skill description"]);
  }
  finally { await view.unmount(); }
});

test("the Add popup uses a compact capped panel on the page layer", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("./composer-add-menu.module.css", import.meta.url), "utf8");
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [],
    labels: { add: "Add", images: "Attach image", files: "Files and folders", goal: "Goal", groups: { commands: "Commands", plugins: "Plugins", skills: "Skills" } },
    onAttachImages() {}, onSelect() {},
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  try {
    assert.ok(document.body.querySelector("[data-add-menu-popup]"));
    assert.match(css, /\.popup\s*\{[^}]*width:\s*min\(320px,/);
    assert.match(css, /\.menu\s*\{[^}]*max-height:\s*var\(--ui-scroll-offset\);[^}]*overflow-y:\s*auto;/);
  } finally { await view.unmount(); }
});

test("Add menu separates image attachment, file browsing, and shared suggestions", async () => {
  const calls = [];
  const item = { id: "goal", kind: "command", group: "commands", label: "Goal", raw: "/goal", icon: "goal" };
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [{ id: "commands", items: [item] }],
    labels: { add: "Add", images: "Attach image", files: "Files and folders", goal: "Goal", groups: { commands: "Commands" } },
    onAttachImages: () => calls.push("image"),
    onBrowseFiles: () => calls.push("files"),
    onSelect: value => calls.push(value),
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  for (const [label, expected] of [["Files and folders", "files"], ["Attach image", "image"], ["Goal", item]]) {
    await click(trigger);
    if (label !== "Goal") {
      await click(Array.from(document.body.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Files and folders")));
    }
    const button = Array.from(document.body.querySelectorAll("[role='menuitem']")).find(button => textOf(button) === label);
    assert.ok(button);
    await click(button);
    assert.equal(calls.at(-1), expected);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  }
  await view.unmount();
});

test("opening a submenu retains keyboard focus and Escape returns to the root", async () => {
  const parent = { id: "skill", kind: "skill", group: "skills", label: "Example", raw: "/skill:example" };
  const child = { id: "status", kind: "skill", group: "skills", label: "Status", raw: "/skill:example status" };
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [{ id: "skills", items: [parent] }],
    childrenFor: item => item.id === parent.id ? [{ id: "skills", items: [child] }] : [],
    labels: { add: "Add", images: "Image", files: "Files", goal: "Goal", groups: { commands: "Commands", plugins: "Plugins", skills: "Skills" } },
    onAttachImages() {}, onSelect() {},
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  await click(Array.from(document.body.querySelectorAll("[role='menuitem']")).find(item => textOf(item).startsWith("Skills")));
  await click(Array.from(document.body.querySelectorAll("[role='menuitem']")).find(item => textOf(item).startsWith("Example")));
  await settle();
  assert.ok(document.body.querySelector("[role='menu']").contains(focused()), "submenu focus must stay in the popup");
  await press(focused(), "ArrowDown");
  assert.equal(textOf(focused()), "Status");
  await press(focused(), "Escape");
  assert.equal(document.body.querySelector("[role='menu']").getAttribute("aria-label"), "Skills");
  await press(focused(), "Escape");
  assert.equal(document.body.querySelector("[role='menu']").getAttribute("aria-label"), "Add");
  await press(focused(), "Escape");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(focused(), trigger);
  await view.unmount();
});
