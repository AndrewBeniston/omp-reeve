import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, textOf, focused, settle, press } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerAddMenu } = await jiti.import("./ComposerAddMenu.tsx");

test("the root menu shows contextual Add actions before Plugins and Skills", async () => {
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [
      { id: "commands", items: [{ id: "compact", kind: "command", label: "Compact", raw: "/compact" }] },
      { id: "plugins", items: [{ id: "computer", kind: "plugin", label: "Computer", raw: "@computer" }] },
      { id: "skills", items: [{ id: "skill", kind: "skill", label: "Example", raw: "/skill:example" }] },
    ],
    labels: { add: "Add", images: "Attach image", files: "Files and folders", moreCommands: "More commands", groups: { commands: "Commands", plugins: "Plugins", skills: "Skills" } },
    onAttachImages() {}, onBrowseFiles() {}, onSelect() {},
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.parentElement.getBoundingClientRect = () => ({ top: 500, left: 20, width: 600, height: 120 });
  await click(trigger);
  const rows = Array.from(view.container.querySelectorAll("[role='menuitem']")).map(textOf);
  try { assert.deepEqual(rows, ["Files and folders›", "Computer", "Example", "More commands›"]); }
  finally { await view.unmount(); }
});

test("Add menu separates image attachment, file browsing, and shared suggestions", async () => {
  const calls = [];
  const item = { id: "goal", kind: "command", group: "commands", label: "Goal", raw: "/goal", icon: "goal" };
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [{ id: "commands", items: [item] }],
    labels: { add: "Add", images: "Attach image", files: "Files and folders", groups: { commands: "Commands" } },
    onAttachImages: () => calls.push("image"),
    onBrowseFiles: () => calls.push("files"),
    onSelect: value => calls.push(value),
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.parentElement.getBoundingClientRect = () => ({ top: 500, left: 20, width: 600, height: 120 });
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  for (const [label, expected] of [["Files and folders", "files"], ["Attach image", "image"], ["Goal", item]]) {
    await click(trigger);
    if (label !== "Goal") {
      await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Files and folders")));
    }
    const button = Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button) === label);
    assert.ok(button);
    await click(button);
    assert.equal(calls.at(-1), expected);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  }
  await view.unmount();
});

test("opening a submenu retains keyboard focus inside it", async () => {
  const parent = { id: "parent", kind: "command", group: "commands", label: "Goal", raw: "/goal" };
  const child = { id: "child", kind: "command", group: "commands", label: "Status", raw: "/goal status" };
  const view = await mount(React.createElement(ComposerAddMenu, {
    sections: [{ id: "commands", items: [parent] }],
    childrenFor: item => item.id === "parent" ? [{ id: "commands", items: [child] }] : [],
    labels: { add: "Add", images: "Image", files: "Files", groups: { commands: "Commands" } },
    onAttachImages() {}, onSelect() {},
  }));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.parentElement.getBoundingClientRect = () => ({ top: 500, left: 20, width: 600, height: 120 });
  await click(trigger);
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(item => textOf(item).startsWith("Goal")));
  await settle();
  const menu = view.container.querySelector("[role='menu']");
  assert.ok(menu.contains(focused()), "submenu focus must not return to the Add trigger");
  await press(focused(), "ArrowDown");
  assert.equal(textOf(focused()), "Status");
  await view.unmount();
});
