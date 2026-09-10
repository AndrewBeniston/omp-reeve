import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { DomEvent, React, click, domDocument, mount, press, tabbable } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const h = React.createElement;

test("primitives expose their labels and ARIA relationships in static markup", async () => {
  const [
    { Button },
    { IconButton },
    { Surface },
    { StatusBadge },
    { Disclosure },
    { Dialog },
    { Menu, MenuItem },
    { Tabs },
    { Tooltip },
    { FormField },
    { VisuallyHidden },
    { DynamicStyleVars },
  ] = await Promise.all([
    jiti.import("./Button.tsx"),
    jiti.import("./IconButton.tsx"),
    jiti.import("./Surface.tsx"),
    jiti.import("./StatusBadge.tsx"),
    jiti.import("./Disclosure.tsx"),
    jiti.import("./Dialog.tsx"),
    jiti.import("./Menu.tsx"),
    jiti.import("./Tabs.tsx"),
    jiti.import("./Tooltip.tsx"),
    jiti.import("./FormField.tsx"),
    jiti.import("./VisuallyHidden.tsx"),
    jiti.import("./DynamicStyleVars.tsx"),
  ]);

  const button = renderToStaticMarkup(React.createElement(Button, { loading: true }, "Save"));
  assert.match(button, /<button[^>]*disabled=""[^>]*aria-busy="true"/);
  assert.match(button, /Save/);

  const iconButton = renderToStaticMarkup(React.createElement(IconButton, {
    label: "Mute sound",
    pressed: true,
  }, "S"));
  assert.match(iconButton, /aria-label="Mute sound"/);
  assert.match(iconButton, /aria-pressed="true"/);

  const surface = renderToStaticMarkup(React.createElement(Surface, null, "Panel"));
  assert.doesNotMatch(surface, / style=/);

  const badge = renderToStaticMarkup(React.createElement(StatusBadge, {
    icon: React.createElement("span", null, "✓"),
  }, "Complete"));
  assert.match(badge, /Complete/);
  assert.match(badge, /aria-hidden="true"/);

  const disclosure = renderToStaticMarkup(React.createElement(Disclosure, {
    label: "Reasoning",
    expanded: true,
  }, React.createElement("p", null, "Details")));
  assert.match(disclosure, /aria-expanded="true"/);
  assert.match(disclosure, /role="region"/);
  assert.match(disclosure, /aria-labelledby="[^"]+"/);

  const dialog = renderToStaticMarkup(React.createElement(Dialog, {
    open: true,
    title: "Settings",
    onOpenChange() {},
  }, "Dialog body"));
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby="[^"]+"/);

  const menu = renderToStaticMarkup(React.createElement(Menu, {
    open: true,
    label: "Actions",
    onClose() {},
  }, React.createElement(MenuItem, null, "Rename")));
  assert.match(menu, /role="menu"/);
  assert.match(menu, /aria-label="Actions"/);
  assert.match(menu, /role="menuitem"/);

  const tabs = renderToStaticMarkup(React.createElement(Tabs, {
    label: "Settings sections",
    value: "general",
    orientation: "vertical",
    onValueChange() {},
    items: [
      {
        id: "general",
        label: "General",
        panel: "General panel",
        group: { id: "application", label: "Application" },
      },
      {
        id: "themes",
        label: "Themes",
        panel: "Themes panel",
        group: { id: "appearance", label: "Appearance" },
      },
    ],
  }));
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-orientation="vertical"/);
  assert.equal((tabs.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(tabs, /role="group"/);
  assert.match(tabs, /aria-labelledby="[^"]+-group-application"/);
  assert.match(tabs, />Application</);
  assert.match(tabs, /aria-selected="true"/);
  assert.match(tabs, /aria-controls="[^"]+"/);
  assert.match(tabs, /role="tabpanel"/);
  assert.match(tabs, /aria-labelledby="[^"]+"/);
  assert.match(tabs, /General panel/);
  assert.doesNotMatch(tabs, /Themes panel/);

  const eagerTabs = renderToStaticMarkup(React.createElement(Tabs, {
    label: "Settings sections",
    value: "general",
    mountInactivePanels: true,
    onValueChange() {},
    items: [
      { id: "general", label: "General", panel: "General panel" },
      { id: "themes", label: "Themes", panel: "Themes panel" },
    ],
  }));
  assert.match(eagerTabs, /General panel/);
  assert.match(eagerTabs, /Themes panel/);
  assert.match(eagerTabs, /hidden=""/);

  const tooltip = renderToStaticMarkup(React.createElement(Tooltip, {
    content: "Open settings",
  }, React.createElement("button", null, "Open")));
  assert.match(tooltip, /role="tooltip"/);

  const field = renderToStaticMarkup(React.createElement(FormField, {
    id: "project-name",
    label: "Project name",
    description: "Use a short name.",
    error: "A name is required.",
  }, React.createElement("input")));
  assert.match(field, /<label[^>]*for="project-name"/);
  assert.match(field, /id="project-name"/);
  assert.match(field, /aria-describedby="[^"]+"/);
  assert.match(field, /aria-invalid="true"/);

  const groupField = renderToStaticMarkup(React.createElement(FormField, {
    id: "notification-controls",
    label: "Notifications",
    description: "Choose the notification methods.",
    labelMode: "aria-labelledby",
  }, React.createElement("div", { role: "group" }, "Controls")));
  assert.doesNotMatch(groupField, /<label/);
  assert.doesNotMatch(groupField, /for="notification-controls"/);
  assert.match(groupField, /id="notification-controls-label"/);
  assert.match(groupField, /role="group"/);
  assert.match(groupField, /aria-labelledby="notification-controls-label"/);
  assert.match(groupField, /aria-describedby="notification-controls-description"/);

  const hidden = renderToStaticMarkup(React.createElement(VisuallyHidden, null, "Screen reader text"));
  assert.match(hidden, /Screen reader text/);
  assert.doesNotMatch(hidden, / style=/);

  const dynamic = renderToStaticMarkup(React.createElement(DynamicStyleVars, {
    variables: { "--ui-panel-width": "320px" },
  }));
  assert.match(dynamic, /style="--ui-panel-width:320px"/);
  assert.throws(
    () => renderToStaticMarkup(React.createElement(DynamicStyleVars, {
      variables: { "--ui-color": "red" },
    })),
    /Unsupported dynamic style variable/,
  );
});

test("the focus ring stays one token pair across every interactive primitive", async () => {
  const [recipes, tokens] = await Promise.all([
    readFile(new URL("../../lib/ui/recipes.module.css", import.meta.url), "utf8"),
    readFile(new URL("../../app/tokens.css", import.meta.url), "utf8"),
  ]);

  assert.match(recipes, /:focus-visible/);
  assert.match(tokens, /--ui-focus-ring:\s*2px solid var\(--ui-accent\)/);
  assert.match(tokens, /--ui-focus-offset:\s*2px/);
});

test("the dialog moves focus in, traps Tab, and returns focus to the trigger", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");
  const globalKeys = [];
  const listener = (event) => globalKeys.push(event.key);
  domDocument.addEventListener("keydown", listener);

  function Harness() {
    const [open, setOpen] = React.useState(false);
    return h(
      "div",
      null,
      h("button", { type: "button", id: "trigger", onClick: () => setOpen(true) }, "Open"),
      open
        ? h(
            Dialog,
            { open: true, title: "Settings", onOpenChange: setOpen },
            h("button", { type: "button", id: "save" }, "Save"),
            h("button", { type: "button", id: "cancel" }, "Cancel"),
          )
        : null,
    );
  }

  const view = await mount(h(Harness));
  const trigger = view.container.querySelector("#trigger");
  trigger.focus();
  await click(trigger);

  const dialog = domDocument.body.querySelector("[role='dialog']");
  const save = dialog.querySelector("#save");
  const cancel = dialog.querySelector("#cancel");
  assert.equal(domDocument.activeElement, save, "the dialog focuses its first control");

  cancel.focus();
  await press(cancel, "Tab");
  assert.equal(domDocument.activeElement, save, "Tab wraps to the first control");

  await press(save, "Tab", { shiftKey: true });
  assert.equal(domDocument.activeElement, cancel, "Shift and Tab wrap to the last control");

  const escape = await press(cancel, "Escape");
  assert.equal(domDocument.body.querySelector("[role='dialog']"), null, "Escape closes the dialog");
  assert.equal(domDocument.activeElement, trigger, "focus returns to the trigger");
  assert.equal(escape.defaultPrevented, true);
  assert.equal(globalKeys.includes("Escape"), false, "Escape stays inside the dialog");

  domDocument.removeEventListener("keydown", listener);
  await view.unmount();
});

test("nested dialogs portal, isolate lower layers, and restore stack focus", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");

  function Harness() {
    const [parentOpen, setParentOpen] = React.useState(false);
    const [childOpen, setChildOpen] = React.useState(false);
    return h(
      "div",
      null,
      h("button", { type: "button", id: "open-parent", onClick: () => setParentOpen(true) }, "Open parent"),
      parentOpen
        ? h(
            Dialog,
            { open: true, title: "Parent", onOpenChange: setParentOpen },
            h("button", { type: "button", id: "open-child", onClick: () => setChildOpen(true) }, "Open child"),
            childOpen
              ? h(
                  Dialog,
                  { open: true, title: "Child", onOpenChange: setChildOpen },
                  h("button", { type: "button", id: "child-action" }, "Child action"),
                )
              : null,
            h("button", { type: "button", id: "parent-action" }, "Parent action"),
          )
        : null,
    );
  }

  const view = await mount(h(Harness));
  const parentTrigger = view.container.querySelector("#open-parent");
  parentTrigger.focus();
  await click(parentTrigger);

  const parentDialog = domDocument.body.querySelector("[role='dialog']");
  const parentBackdrop = parentDialog.parentElement;
  const parentLayer = parentBackdrop.parentElement;
  const childTrigger = parentDialog.querySelector("#open-child");
  assert.equal(domDocument.body.getAttribute("data-dialog-scroll-locked"), "true");

  await click(childTrigger);
  const childAction = domDocument.body.querySelector("#child-action");
  const childDialog = childAction.closest("[role='dialog']");
  const childBackdrop = childDialog.parentElement;
  const childLayer = childBackdrop.parentElement;
  const modalHost = childLayer.parentElement;

  assert.equal(modalHost.parentElement, domDocument.body, "the shared host uses the body portal");
  assert.deepEqual(modalHost.childNodes, [parentLayer, childLayer], "registration order controls painting order");
  assert.equal(parentBackdrop.contains(childBackdrop), false, "the nested layer leaves the parent layer");
  assert.equal(parentLayer.hasAttribute("inert"), true, "the lower layer is inert");
  assert.equal(parentLayer.getAttribute("aria-hidden"), "true", "the lower layer is hidden from accessibility navigation");
  assert.equal(childLayer.hasAttribute("inert"), false, "the top layer stays interactive");
  assert.equal(childLayer.hasAttribute("aria-hidden"), false, "the top layer stays accessible");
  assert.equal(domDocument.activeElement, childAction, "the nested layer owns focus");

  await press(childAction, "Escape");
  assert.equal(domDocument.body.querySelector("#child-action"), null, "Escape closes only the top layer");
  assert.equal(domDocument.body.querySelector("[role='dialog']"), parentDialog, "the parent layer stays open");
  assert.equal(parentLayer.hasAttribute("inert"), false, "the parent layer becomes interactive again");
  assert.equal(parentLayer.hasAttribute("aria-hidden"), false, "the parent layer becomes accessible again");
  assert.equal(domDocument.activeElement, childTrigger, "focus returns to the nested trigger");
  assert.equal(domDocument.body.getAttribute("data-dialog-scroll-locked"), "true", "the remaining layer keeps the scroll lock");

  await click(childTrigger);
  const outsideBackdrop = domDocument.body.querySelector("#child-action").closest("[role='dialog']").parentElement;
  await React.act(async () => {
    outsideBackdrop.dispatchEvent(new DomEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  assert.equal(domDocument.body.querySelector("#child-action"), null, "an outside press closes only the top layer");
  assert.equal(domDocument.activeElement, childTrigger, "an outside close restores nested trigger focus");

  await click(childTrigger);
  await view.unmount();
  assert.equal(domDocument.body.querySelector("[role='dialog']"), null, "unmount removes every dialog layer");
  assert.equal(domDocument.body.querySelector("[data-dialog-host]"), null, "unmount removes the shared host");
  assert.equal(domDocument.body.hasAttribute("data-dialog-scroll-locked"), false, "unmount removes the scroll lock");
  assert.equal(parentLayer.hasAttribute("inert"), false, "unmount removes the inert attribute");
  assert.equal(parentLayer.hasAttribute("aria-hidden"), false, "unmount removes the accessibility hiding attribute");
});

test("sibling dialogs paint in registration order when they open in reverse component order", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");

  function Harness() {
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [extensionOpen, setExtensionOpen] = React.useState(false);
    return h(
      "div",
      null,
      h("button", { type: "button", id: "open-settings", onClick: () => setSettingsOpen(true) }, "Open settings"),
      extensionOpen
        ? h(
            Dialog,
            { open: true, title: "Extension", onOpenChange: setExtensionOpen },
            h("button", { type: "button", id: "extension-action" }, "Extension action"),
          )
        : null,
      settingsOpen
        ? h(
            Dialog,
            { open: true, title: "Settings", onOpenChange: setSettingsOpen },
            h("button", { type: "button", id: "open-extension", onClick: () => setExtensionOpen(true) }, "Open extension"),
            h("button", { type: "button", id: "settings-action" }, "Settings action"),
          )
        : null,
    );
  }

  const view = await mount(h(Harness));
  const settingsTrigger = view.container.querySelector("#open-settings");
  settingsTrigger.focus();
  await click(settingsTrigger);

  const extensionTrigger = domDocument.body.querySelector("#open-extension");
  const settingsAction = domDocument.body.querySelector("#settings-action");
  const settingsLayer = settingsAction.closest("[data-dialog-layer]");
  const modalHost = settingsLayer.parentElement;
  assert.deepEqual(modalHost.childNodes, [settingsLayer], "the first modal owns the first host position");

  await click(extensionTrigger);
  const extensionAction = domDocument.body.querySelector("#extension-action");
  const extensionLayer = extensionAction.closest("[data-dialog-layer]");

  assert.deepEqual(
    modalHost.childNodes,
    [settingsLayer, extensionLayer],
    "the later registration paints after the earlier component sibling",
  );
  assert.equal(settingsLayer.hasAttribute("inert"), true, "the lower sibling is inert");
  assert.equal(settingsLayer.getAttribute("aria-hidden"), "true", "the lower sibling is hidden from accessibility navigation");
  assert.equal(extensionLayer.hasAttribute("inert"), false, "the latest sibling stays interactive");
  assert.equal(extensionLayer.hasAttribute("aria-hidden"), false, "the latest sibling stays accessible");
  assert.equal(extensionLayer.contains(domDocument.activeElement), true, "the latest sibling owns focus");

  await press(settingsAction, "Escape");
  assert.equal(domDocument.body.querySelector("#settings-action"), settingsAction, "the lower sibling ignores Escape");
  assert.equal(domDocument.body.querySelector("#extension-action"), extensionAction, "the latest sibling stays open");

  await press(extensionAction, "Escape");
  assert.equal(domDocument.body.querySelector("#extension-action"), null, "Escape closes the latest sibling");
  assert.deepEqual(modalHost.childNodes, [settingsLayer], "the host removes the closed layer");
  assert.equal(settingsLayer.hasAttribute("inert"), false, "the remaining sibling becomes interactive");
  assert.equal(settingsLayer.hasAttribute("aria-hidden"), false, "the remaining sibling becomes accessible");
  assert.equal(domDocument.activeElement, extensionTrigger, "focus returns to the sibling trigger");

  await press(settingsAction, "Escape");
  assert.equal(domDocument.body.querySelector("[data-dialog-host]"), null, "the final close removes the shared host");
  assert.equal(domDocument.body.hasAttribute("data-dialog-scroll-locked"), false, "the final close removes the scroll lock");
  assert.equal(settingsLayer.hasAttribute("inert"), false, "cleanup removes inert from the detached layer");
  assert.equal(settingsLayer.hasAttribute("aria-hidden"), false, "cleanup removes accessibility hiding from the detached layer");
  assert.equal(domDocument.activeElement, settingsTrigger, "focus returns to the first trigger");

  await view.unmount();
});

test("a non-dismissible dialog keeps Escape away from the global shortcut", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");
  const globalKeys = [];
  const listener = (event) => globalKeys.push(event.key);
  domDocument.addEventListener("keydown", listener);

  const changes = [];
  const view = await mount(h(
    Dialog,
    {
      open: true,
      title: "Saving",
      dismissible: false,
      onOpenChange: (open) => changes.push(open),
    },
    h("button", { type: "button", id: "busy" }, "Working"),
  ));

  const dialog = domDocument.body.querySelector("[role='dialog']");
  const escape = await press(dialog.querySelector("#busy"), "Escape");

  assert.deepEqual(changes, [], "a busy dialog stays open");
  assert.equal(escape.defaultPrevented, false, "the dialog leaves the default action alone");
  assert.equal(globalKeys.includes("Escape"), false, "Escape still stays inside the dialog");

  domDocument.removeEventListener("keydown", listener);
  await view.unmount();
});

test("the dialog honours an explicit initial control and an autoFocus control", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");

  function ExplicitHarness() {
    const initialFocus = React.useRef(null);
    return h(
      Dialog,
      { open: true, title: "Settings", initialFocus, onOpenChange() {} },
      h("button", { type: "button", id: "first" }, "First"),
      h("button", { type: "button", id: "chosen", ref: initialFocus }, "Chosen"),
    );
  }

  const explicit = await mount(h(ExplicitHarness));
  assert.equal(domDocument.activeElement.getAttribute("id"), "chosen");
  await explicit.unmount();

  const automatic = await mount(h(
    Dialog,
    { open: true, title: "Directory", onOpenChange() {} },
    h("button", { type: "button", id: "close" }, "Close"),
    h("input", { id: "path", autoFocus: true }),
  ));
  assert.equal(domDocument.activeElement.getAttribute("id"), "path", "autoFocus keeps its control");
  await automatic.unmount();
});

test("a dialog without a focusable control takes focus itself", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");
  const view = await mount(h(
    Dialog,
    { open: true, title: "Notice", onOpenChange() {} },
    h("p", null, "Nothing to do."),
  ));

  const dialog = domDocument.body.querySelector("[role='dialog']");
  assert.equal(domDocument.activeElement, dialog);

  const tab = await press(dialog, "Tab");
  assert.equal(tab.defaultPrevented, true);
  assert.equal(domDocument.activeElement, dialog);
  await view.unmount();
});

test("the dialog focus trap skips a closed disclosure panel", async () => {
  const [{ Dialog }, { Disclosure }] = await Promise.all([
    jiti.import("./Dialog.tsx"),
    jiti.import("./Disclosure.tsx"),
  ]);

  const view = await mount(h(
    Dialog,
    { open: true, title: "Tools", onOpenChange() {} },
    h("button", { type: "button", id: "one" }, "One"),
    h("button", { type: "button", id: "two" }, "Two"),
    h(Disclosure, { label: "Details" }, h("button", { type: "button", id: "hidden-control" }, "Hidden")),
  ));

  const dialog = domDocument.body.querySelector("[role='dialog']");
  const one = dialog.querySelector("#one");
  const disclosureTrigger = dialog.querySelector("[aria-expanded]");
  const hiddenControl = dialog.querySelector("#hidden-control");

  assert.equal(tabbable(dialog).includes(hiddenControl), false, "closed content leaves the tab order");

  disclosureTrigger.focus();
  await press(disclosureTrigger, "Tab");
  assert.equal(domDocument.activeElement, one, "the trap treats the disclosure trigger as the last control");
  await view.unmount();
});

test("the full-window dialog and the centered dialog use different surface classes", async () => {
  const { Dialog } = await jiti.import("./Dialog.tsx");

  const centered = await mount(h(Dialog, { open: true, title: "Small", size: "sm", onOpenChange() {} }, "Body"));
  const centeredClass = domDocument.body.querySelector("[role='dialog']").className;
  await centered.unmount();

  const full = await mount(h(Dialog, { open: true, title: "Settings", presentation: "fullWindow", onOpenChange() {} }, "Body"));
  const fullElement = domDocument.body.querySelector("[role='dialog']");
  const fullClass = fullElement.className;
  const backdropClass = fullElement.parentElement.className;
  await full.unmount();

  assert.match(centeredClass, /dialogCentered/);
  assert.match(centeredClass, /dialogSm/);
  assert.match(fullClass, /dialogFullWindow/);
  assert.doesNotMatch(fullClass, /dialogSm|dialogMd|dialogLg/);
  assert.match(backdropClass, /dialogBackdropFullWindow/);
});

test("the icon button emits aria-pressed only for a toggle caller", async () => {
  const { IconButton } = await jiti.import("./IconButton.tsx");

  const plain = await mount(h(IconButton, { label: "Close" }, "x"));
  const plainButton = plain.container.querySelector("button");
  assert.equal(plainButton.hasAttribute("aria-pressed"), false);
  assert.equal(plainButton.getAttribute("aria-label"), "Close");
  await plain.unmount();

  const off = await mount(h(IconButton, { label: "Mute sound", pressed: false }, "s"));
  assert.equal(off.container.querySelector("button").getAttribute("aria-pressed"), "false");
  await off.unmount();

  const mixed = await mount(h(IconButton, { label: "Wrap lines", pressed: "mixed" }, "w"));
  assert.equal(mixed.container.querySelector("button").getAttribute("aria-pressed"), "mixed");
  await mixed.unmount();
});

test("the disclosure keeps closed content inert and animates through the panel class", async () => {
  const { Disclosure } = await jiti.import("./Disclosure.tsx");
  const view = await mount(h(
    Disclosure,
    { label: "Reasoning" },
    h("button", { type: "button", id: "inside" }, "Inside"),
  ));

  const trigger = view.container.querySelector("[aria-expanded]");
  const panel = view.container.querySelector("[role='region']");
  const inside = view.container.querySelector("#inside");

  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(panel.hasAttribute("inert"), true, "closed content is inert");
  assert.equal(panel.hasAttribute("hidden"), false, "the panel stays in the layout for the exit transition");
  assert.match(panel.className, /disclosurePanelClosed/);
  assert.equal(tabbable(view.container).includes(inside), false);

  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(panel.hasAttribute("inert"), false);
  assert.match(panel.className, /disclosurePanelExpanded/);
  assert.equal(tabbable(view.container).includes(inside), true);

  await click(trigger);
  assert.equal(panel.hasAttribute("inert"), true);
  assert.equal(panel.hasAttribute("hidden"), false);
  await view.unmount();
});

test("the tabs move roving focus along the list orientation", async () => {
  const { Tabs } = await jiti.import("./Tabs.tsx");
  const items = [
    { id: "general", label: "General", panel: "General panel" },
    { id: "themes", label: "Themes", panel: "Themes panel" },
    { id: "access", label: "Access", panel: "Access panel" },
  ];

  const horizontal = await mount(h(Tabs, { label: "Settings", value: "general", items, onValueChange() {} }));
  const horizontalTabs = horizontal.container.querySelectorAll("[role='tab']");
  horizontalTabs[0].focus();

  await press(horizontalTabs[0], "ArrowRight");
  assert.equal(domDocument.activeElement, horizontalTabs[1]);

  await press(horizontalTabs[1], "ArrowLeft");
  assert.equal(domDocument.activeElement, horizontalTabs[0]);

  await press(horizontalTabs[0], "End");
  assert.equal(domDocument.activeElement, horizontalTabs[2]);

  await press(horizontalTabs[2], "Home");
  assert.equal(domDocument.activeElement, horizontalTabs[0]);
  await horizontal.unmount();

  const vertical = await mount(h(Tabs, {
    label: "Settings",
    value: "general",
    orientation: "vertical",
    items,
    onValueChange() {},
  }));
  const verticalTabs = vertical.container.querySelectorAll("[role='tab']");
  verticalTabs[0].focus();

  await press(verticalTabs[0], "ArrowDown");
  assert.equal(domDocument.activeElement, verticalTabs[1]);

  await press(verticalTabs[1], "ArrowUp");
  assert.equal(domDocument.activeElement, verticalTabs[0]);
  await vertical.unmount();
});

test("the tooltip appears on keyboard focus after the delay", async () => {
  const { Tooltip } = await jiti.import("./Tooltip.tsx");
  const view = await mount(h(
    Tooltip,
    { content: "Open settings" },
    h("button", { type: "button", id: "settings" }, "Open"),
  ));

  const trigger = view.container.querySelector("#settings");
  const bubble = view.container.querySelector("[role='tooltip']");
  assert.equal(bubble.getAttribute("aria-hidden"), "true");

  await React.act(async () => { trigger.focus(); });
  assert.equal(bubble.getAttribute("aria-hidden"), "true", "the tooltip waits for the delay");

  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
  assert.equal(bubble.getAttribute("aria-hidden"), "false");
  assert.equal(trigger.getAttribute("aria-describedby"), bubble.getAttribute("id"));
  await view.unmount();
});
