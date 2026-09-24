import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, textOf, focused, settle, press } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerAddMenu } = await jiti.import("./ComposerAddMenu.tsx");

const labels = {
  add: "Add files and more",
  images: "Add photos",
  files: "Select files",
  folder: "Select folder",
  planMode: "Plan mode",
  voiceChat: "Voice chat",
  unavailable: "Unavailable",
  folderUnavailable: "Folder selection is unavailable in a browser. Open Reeve on the desktop to select a folder.",
};

function composerAddMenuProps(overrides = {}) {
  return {
    sections: [],
    labels,
    onAttachImages() {},
    onBrowseFiles() {},
    onBrowseFolder() {},
    folderDisabledReason: labels.folderUnavailable,
    onPlanMode() {},
    onSelect() {},
    ...overrides,
  };
}

test("the Add menu exposes active attachment actions in reference order", async () => {
  const calls = [];
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps({
    onAttachImages: () => calls.push("photos"),
    onBrowseFiles: () => calls.push("files"),
    onBrowseFolder: () => calls.push("folder"),
    onPlanMode: () => calls.push("plan"),
    folderDisabledReason: null,
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });

  try {
    assert.equal(trigger.getAttribute("aria-label"), "Add files and more");
    assert.equal(trigger.getAttribute("title"), "Add files and more");
    await click(trigger);
    const rows = Array.from(document.body.querySelectorAll("[role='menuitem']"));
    assert.deepEqual(rows.map(textOf), ["Add photos", "Select files", "Select folder", "Plan mode", "Voice chatUnavailable"]);
    assert.equal(rows[4].getAttribute("aria-disabled"), "true");
    assert.doesNotMatch(document.body.textContent, /remote files|sketch|appshot/i);

    await click(trigger);
    await settle();
    for (const [label, expected] of [["Add photos", "photos"], ["Select files", "files"], ["Select folder", "folder"], ["Plan mode", "plan"]]) {
      await click(trigger);
      await settle();
      const button = Array.from(document.body.querySelectorAll("[role='menuitem']")).find(row => textOf(row) === label);
      assert.ok(button, `${label} row must exist`);
      if (button) await click(button);
      assert.equal(calls.at(-1), expected);
    }
  } finally {
    await view.unmount();
  }
});

test("the Add menu disables folder selection in a browser with a plain reason", async () => {
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps({
    onBrowseFolder() {},
    folderDisabledReason: labels.folderUnavailable,
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });

  try {
    await click(trigger);
    const folder = Array.from(document.body.querySelectorAll("[role='menuitem']")).find(row => textOf(row).startsWith("Select folder"));
    assert.equal(folder.getAttribute("aria-disabled"), "true");
    assert.equal(folder.getAttribute("aria-description"), labels.folderUnavailable);
    assert.equal(folder.textContent.includes("Unavailable"), true);
    await press(folder, "ArrowDown");
    assert.equal(textOf(focused()), "Select files");
    await press(focused(), "ArrowUp");
    assert.equal(textOf(focused()), "Add photos");
    folder.focus();
    assert.equal(focused().getAttribute("aria-disabled"), "true");
    await press(focused(), "Enter");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
  } finally {
    await view.unmount();
  }
});

test("the root menu keeps attachment actions before OMP suggestions", async () => {
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps({
    sections: [
      { id: "commands", items: [{ id: "goal", kind: "command", label: "Goal", raw: "/goal", icon: "goal" }] },
      { id: "plugins", items: [{ id: "computer", kind: "plugin", label: "Computer", raw: "@computer", icon: "extension" }] },
      { id: "skills", items: [{ id: "skill", kind: "skill", label: "Example", raw: "/skill:example", detail: "A long skill description", icon: "skill" }] },
    ],
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  try {
    const rows = Array.from(document.body.querySelectorAll("[role='menuitem']"));
    assert.deepEqual(rows.slice(0, 8).map(textOf), ["Add photos", "Select files", "Select folderFolder selection is unavailable in a browser. Open Reeve on the desktop to select a folder.Unavailable", "Plan mode", "Voice chatUnavailable", "Goal", "Computer", "ExampleA long skill description"]);
    assert.equal(view.container.querySelector("[role='menu']"), null, "the popup mounts outside the Composer");
  } finally { await view.unmount(); }
});

test("the Add menu hides rows parked in issue 205", async () => {
  const parked = [
    ["Add remote files", "@remote"], ["Sketch", "@sketch"], ["Attach appshot", "@appshot"],
    ["Pull request", "@pull"], ["Shared chat", "@chat"], ["Sites", "@sites"], ["Browser annotation", "@annotate"],
  ];
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps({
    sections: [{ id: "commands", items: parked.map(([label, raw], index) => ({ id: String(index), kind: "command", group: "commands", label, raw })) }],
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  try {
    const menuText = textOf(document.body.querySelector("[role='menu']"));
    for (const [label] of parked) assert.equal(menuText.includes(label), false);
  } finally {
    await view.unmount();
  }
});

test("the Add popup uses a compact capped panel on the page layer", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("./composer-add-menu.module.css", import.meta.url), "utf8");
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps()));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  try {
    assert.ok(document.body.querySelector("[data-add-menu-popup]"));
    assert.match(css, /\.popup\s*\{[^}]*width:\s*min\(320px,/);
    assert.match(css, /\.menu\s*\{[^}]*max-height:\s*var\(--ui-scroll-offset\);[^}]*overflow-y:\s*auto;/);
  } finally { await view.unmount(); }
});

test("Add menu sends each supported attachment action to its own picker", async () => {
  const calls = [];
  const item = { id: "goal", kind: "command", group: "commands", label: "Goal", raw: "/goal", icon: "goal" };
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps({
    sections: [{ id: "commands", items: [item] }],
    folderDisabledReason: null,
    onAttachImages: () => calls.push("image"),
    onBrowseFiles: () => calls.push("files"),
    onBrowseFolder: () => calls.push("folder"),
    onSelect: value => calls.push(value),
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  for (const [label, expected] of [["Add photos", "image"], ["Select files", "files"], ["Select folder", "folder"], ["Goal", item]]) {
    await click(trigger);
    await settle();
    const button = Array.from(document.body.querySelectorAll("[role='menuitem']")).find(row => textOf(row) === label);
    assert.ok(button);
    await click(button);
    assert.deepEqual(calls.at(-1), expected);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  }
  await view.unmount();
});

test("opening a submenu retains keyboard focus and Escape returns to the root", async () => {
  const parent = { id: "skill", kind: "skill", group: "skills", label: "Example", raw: "/skill:example", icon: "skill" };
  const child = { id: "status", kind: "skill", group: "skills", label: "Status", raw: "/skill:example status", icon: "skill" };
  const view = await mount(React.createElement(ComposerAddMenu, composerAddMenuProps({
    sections: [{ id: "skills", items: [parent] }],
    childrenFor: item => item.id === parent.id ? [{ id: "skills", items: [child] }] : [],
  })));
  const trigger = view.container.querySelector("[aria-haspopup='menu']");
  trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 28, height: 28 });
  await click(trigger);
  await settle();
  await click(Array.from(document.body.querySelectorAll("[role='menuitem']")).find(item => textOf(item).startsWith("Example")));
  await settle();
  assert.ok(document.body.querySelector("[role='menu']").contains(focused()), "submenu focus must stay in the popup");
  await press(focused(), "ArrowDown");
  assert.equal(textOf(focused()), "Status");
  await press(focused(), "Escape");
  assert.equal(document.body.querySelector("[role='menu']").getAttribute("aria-label"), "Add files and more");
  await press(focused(), "Escape");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(focused(), trigger);
  await view.unmount();
});
