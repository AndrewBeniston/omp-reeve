import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, domDocument, mount, press, settle, tabbable } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const h = React.createElement;
const { Menu, MenuItem } = await jiti.import("./Menu.tsx");

function MenuHarness({ items, label = "Actions", onCloseSpy, closeOnSelect = false, triggerRefEnabled = true }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef(null);

  return h(
    React.Fragment,
    null,
    h("button", { type: "button", ref: triggerRef, "data-role": "trigger", onClick: () => setOpen(true) }, "Open"),
    open
      ? h(
        Menu,
        {
          open: true,
          label,
          triggerRef: triggerRefEnabled ? triggerRef : undefined,
          onClose: () => {
            onCloseSpy?.();
            setOpen(false);
          },
        },
        items.map((item) => {
          const { onClick, ...itemProps } = item.props;
          return h(MenuItem, {
            key: item.key,
            ...itemProps,
            onClick: (event) => {
              onClick?.(event);
              if (closeOnSelect) setOpen(false);
            },
          }, item.children);
        }),
      )
      : null,
    h("button", { type: "button", "data-role": "after" }, "After"),
  );
}

function menuItems(container) {
  return container.querySelectorAll("[role='menuitem'],[role='menuitemradio']");
}

async function openHarness(view) {
  const trigger = view.container.querySelector("[data-role='trigger']");
  await click(trigger);
  return trigger;
}

test("the menu moves focus to the checked item when it opens", async () => {
  const view = await mount(h(MenuHarness, {
    items: [
      { key: "low", props: { role: "menuitemradio", checked: false }, children: "Low" },
      { key: "medium", props: { role: "menuitemradio", checked: true }, children: "Medium" },
      { key: "high", props: { role: "menuitemradio", checked: false }, children: "High" },
    ],
  }));

  await openHarness(view);
  const items = menuItems(view.container);

  assert.equal(items.length, 3);
  assert.equal(domDocument.activeElement, items[1]);
  assert.deepEqual(items.map((item) => item.getAttribute("tabindex")), ["-1", "0", "-1"]);
  assert.deepEqual(items.map((item) => item.getAttribute("aria-checked")), ["false", "true", "false"]);
  await view.unmount();
});

test("the menu moves focus to the first enabled item when nothing is checked", async () => {
  const view = await mount(h(MenuHarness, {
    items: [
      { key: "rename", props: { disabled: true }, children: "Rename" },
      { key: "duplicate", props: {}, children: "Duplicate" },
      { key: "delete", props: {}, children: "Delete" },
    ],
  }));

  await openHarness(view);
  const items = menuItems(view.container);

  assert.equal(domDocument.activeElement, items[1]);
  assert.deepEqual(items.map((item) => item.getAttribute("tabindex")), ["-1", "0", "-1"]);
  assert.equal(items[0].getAttribute("aria-disabled"), "true");
  await view.unmount();
});

test("the arrow keys skip a disabled item and wrap at both ends", async () => {
  const view = await mount(h(MenuHarness, {
    items: [
      { key: "rename", props: {}, children: "Rename" },
      { key: "duplicate", props: { disabled: true }, children: "Duplicate" },
      { key: "delete", props: {}, children: "Delete" },
    ],
  }));

  await openHarness(view);
  const items = menuItems(view.container);
  assert.equal(domDocument.activeElement, items[0]);

  const down = await press(items[0], "ArrowDown");
  assert.equal(down.defaultPrevented, true);
  assert.equal(domDocument.activeElement, items[2]);
  assert.deepEqual(items.map((item) => item.getAttribute("tabindex")), ["-1", "-1", "0"]);

  await press(items[2], "ArrowDown");
  assert.equal(domDocument.activeElement, items[0]);

  await press(items[0], "ArrowUp");
  assert.equal(domDocument.activeElement, items[2]);

  await press(items[2], "ArrowUp");
  assert.equal(domDocument.activeElement, items[0]);
  await view.unmount();
});

test("a checked menu checkbox receives focus and joins arrow navigation", async () => {
  const view = await mount(h(MenuHarness, {
    items: [
      { key: "priority", props: { role: "menuitemcheckbox", checked: true }, children: "Priority section" },
      { key: "archive", props: {}, children: "Archive chats" },
    ],
  }));

  await openHarness(view);
  const checkbox = view.container.querySelector("[role='menuitemcheckbox']");
  const archive = view.container.querySelector("[role='menuitem']");

  assert.equal(checkbox.getAttribute("aria-checked"), "true");
  assert.equal(domDocument.activeElement, checkbox);
  await press(checkbox, "ArrowDown");
  assert.equal(domDocument.activeElement, archive);

  await view.unmount();
});

test("Home and End move to the first and the last enabled item", async () => {
  const view = await mount(h(MenuHarness, {
    items: [
      { key: "rename", props: {}, children: "Rename" },
      { key: "duplicate", props: { role: "menuitemradio", checked: true }, children: "Duplicate" },
      { key: "delete", props: {}, children: "Delete" },
      { key: "purge", props: { disabled: true }, children: "Purge" },
    ],
  }));

  await openHarness(view);
  const items = menuItems(view.container);
  assert.equal(domDocument.activeElement, items[1]);

  await press(items[1], "End");
  assert.equal(domDocument.activeElement, items[2]);

  await press(items[2], "Home");
  assert.equal(domDocument.activeElement, items[0]);
  await view.unmount();
});

test("Enter and Space activate the focused item one time each", async () => {
  const activated = [];
  const view = await mount(h(MenuHarness, {
    items: [
      { key: "rename", props: { onClick: () => activated.push("rename") }, children: "Rename" },
      { key: "delete", props: { onClick: () => activated.push("delete") }, children: "Delete" },
    ],
  }));

  await openHarness(view);
  const items = menuItems(view.container);

  const enter = await press(items[0], "Enter");
  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(activated, ["rename"]);

  await press(items[0], "ArrowDown");
  assert.equal(domDocument.activeElement, items[1]);

  const space = await press(items[1], " ");
  assert.equal(space.defaultPrevented, true);
  assert.deepEqual(activated, ["rename", "delete"]);
  await view.unmount();
});

test("Escape cannot reach document listeners and returns focus to the trigger", async () => {
  const closed = [];
  const documentEvents = [];
  const documentListener = () => documentEvents.push("escape");
  domDocument.addEventListener("keydown", documentListener);
  const view = await mount(h(MenuHarness, {
    onCloseSpy: () => closed.push("escape"),
    items: [
      { key: "rename", props: {}, children: "Rename" },
      { key: "delete", props: {}, children: "Delete" },
    ],
  }));

  const trigger = await openHarness(view);
  const items = menuItems(view.container);

  const escape = await press(items[0], "Escape");
  domDocument.removeEventListener("keydown", documentListener);

  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(closed, ["escape"]);
  assert.deepEqual(documentEvents, []);
  assert.equal(menuItems(view.container).length, 0);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("pointer selection restores trigger focus after the menu unmounts", async () => {
  const view = await mount(h(MenuHarness, {
    closeOnSelect: true,
    items: [{ key: "rename", props: {}, children: "Rename" }],
  }));

  const trigger = await openHarness(view);
  await click(menuItems(view.container)[0]);
  await settle();

  assert.equal(menuItems(view.container).length, 0);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("keyboard selection restores trigger focus after the menu unmounts", async () => {
  const view = await mount(h(MenuHarness, {
    closeOnSelect: true,
    items: [{ key: "rename", props: {}, children: "Rename" }],
  }));

  const trigger = await openHarness(view);
  const enter = await press(menuItems(view.container)[0], "Enter");
  await settle();

  assert.equal(enter.defaultPrevented, true);
  assert.equal(menuItems(view.container).length, 0);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("the harness resets focus when a focused menu unmounts without a trigger", async () => {
  const view = await mount(h(MenuHarness, {
    closeOnSelect: true,
    triggerRefEnabled: false,
    items: [{ key: "rename", props: {}, children: "Rename" }],
  }));

  await openHarness(view);
  await click(menuItems(view.container)[0]);
  await settle();

  assert.equal(domDocument.activeElement, domDocument.body);
  await view.unmount();
});

test("Tab closes the menu, returns focus to the trigger, and keeps the default focus move", async () => {
  const closed = [];
  const view = await mount(h(MenuHarness, {
    onCloseSpy: () => closed.push("tab"),
    items: [
      { key: "rename", props: {}, children: "Rename" },
      { key: "delete", props: {}, children: "Delete" },
    ],
  }));

  const trigger = await openHarness(view);
  const items = menuItems(view.container);

  const tab = await press(items[0], "Tab");
  assert.equal(tab.defaultPrevented, false);
  assert.deepEqual(closed, ["tab"]);
  assert.equal(menuItems(view.container).length, 0);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("a closed menu keeps every item out of the tab order", async () => {
  const view = await mount(h(
    Menu,
    { open: false, label: "Actions", onClose() {} },
    h(MenuItem, null, "Rename"),
    h(MenuItem, null, "Delete"),
  ));

  const menu = view.container.querySelector("[role='menu']");
  assert.equal(menu.getAttribute("aria-hidden"), "true");
  assert.deepEqual(menuItems(view.container).map((item) => item.getAttribute("tabindex")), ["-1", "-1"]);
  assert.deepEqual(tabbable(menu), []);
  await view.unmount();
});

test("the menu item carries its role, checked state, disabled state, and icon slot", async () => {
  const view = await mount(h(
    Menu,
    { open: true, label: "Reasoning", onClose() {} },
    h(MenuItem, { role: "menuitemradio", checked: true, icon: h("span", { "data-role": "mark" }, "x") }, "Medium"),
    h(MenuItem, { disabled: true, tone: "danger" }, "Delete"),
  ));

  const items = menuItems(view.container);
  assert.equal(items[0].getAttribute("role"), "menuitemradio");
  assert.equal(items[0].getAttribute("aria-checked"), "true");
  assert.equal(items[1].getAttribute("role"), "menuitem");
  assert.equal(items[1].getAttribute("aria-checked"), null);
  assert.equal(items[1].getAttribute("aria-disabled"), "true");
  assert.equal(items[1].hasAttribute("disabled"), true);

  const icon = view.container.querySelector("[data-role='mark']");
  assert.ok(icon, "the icon slot renders the icon node");
  assert.equal(icon.parentElement.getAttribute("aria-hidden"), "true");
  await view.unmount();
});
