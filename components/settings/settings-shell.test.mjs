import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createJiti } from "jiti";
import {
  DomEvent,
  click,
  domDocument,
  domWindow,
  focused,
  mount,
  press,
  settle,
  tabbable,
} from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { SettingsConfig } = await jiti.import("../SettingsConfig.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const palettes = {
  dark: {
    name: "titanium",
    colorScheme: "dark",
    variables: {
      "--bg": "#101418",
      "--bg-panel": "#181d23",
      "--border": "#2a3138",
      "--text": "#e5e7eb",
      "--text-muted": "#a8b0b8",
      "--accent": "#4ea1ff",
    },
  },
  light: {
    name: "light",
    colorScheme: "light",
    variables: {
      "--bg": "#fdfdfd",
      "--bg-panel": "#f2f3f5",
      "--border": "#d8dade",
      "--text": "#17191d",
      "--text-muted": "#5b6169",
      "--accent": "#0b62d6",
    },
  },
};

function field(overrides) {
  return {
    path: "layout.density",
    tab: "appearance",
    group: "Layout",
    label: "Layout density",
    description: "Choose the layout density.",
    type: "select",
    value: "default",
    defaultValue: "default",
    configured: false,
    options: [
      { value: "default", label: "Default" },
      { value: "compact", label: "Compact" },
    ],
    ...overrides,
  };
}

const settingsResponse = {
  tabs: [{ id: "appearance", label: "Appearance", groups: ["Theme", "Layout"] }],
  fields: [
    field({}),
    field({
      path: "theme.dark",
      group: "Theme",
      label: "Dark theme",
      description: "The theme for dark mode.",
      value: "titanium",
      defaultValue: "titanium",
      options: [{ value: "titanium", label: "Titanium" }, { value: "nord", label: "Nord" }],
    }),
    field({
      path: "theme.light",
      group: "Theme",
      label: "Light theme",
      description: "The theme for light mode.",
      value: "light",
      defaultValue: "light",
      options: [{ value: "light", label: "Light" }, { value: "paper", label: "Paper" }],
    }),
  ],
  availableThemes: [
    { name: "titanium", colorScheme: "dark" },
    { name: "light", colorScheme: "light" },
  ],
  theme: { names: { dark: "titanium", light: "light" }, palettes },
};

let settingsRequests = 0;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith("/api/settings")) {
    settingsRequests += 1;
    return { ok: true, status: 200, json: async () => structuredClone(settingsResponse) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

async function openSettings(props = {}) {
  const trigger = { current: null };
  function Harness({ open }) {
    return h(
      I18nProvider,
      null,
      h("button", { type: "button", id: "settings-trigger" }, "Open settings"),
      open
        ? h(SettingsConfig, {
          cwd: "/Users/andrew/projects/omp-web",
          sessionId: null,
          initialSection: "settings:appearance",
          onClose() {},
          ...props,
        })
        : null,
    );
  }

  const view = await mount(h(Harness, { open: false }));
  trigger.current = view.container.querySelector("#settings-trigger");
  trigger.current.focus();
  await view.render(h(Harness, { open: true }));
  await settle();
  return {
    ...view,
    trigger: trigger.current,
    dialog: domDocument.body.querySelector("[role=dialog]"),
    async close() { await view.render(h(Harness, { open: false })); },
  };
}

test("the Settings shell is the shared full-window dialog", async () => {
  const view = await openSettings();
  const { dialog } = view;

  assert.ok(dialog, "Settings must render one dialog.");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.match(dialog.className, /dialogFullWindow/);
  assert.doesNotMatch(dialog.className, /dialogSm|dialogMd|dialogLg/);
  assert.match(dialog.parentNode.className, /dialogBackdropFullWindow/);

  const heading = dialog.querySelector("h2");
  assert.equal(heading.textContent, "Settings");
  assert.equal(dialog.getAttribute("aria-labelledby"), heading.getAttribute("id"));

  const description = dialog.querySelector("p");
  assert.equal(dialog.getAttribute("aria-describedby"), description.getAttribute("id"));
  assert.equal(description.textContent, "/Users/andrew/projects/omp-web");

  assert.equal(dialog.querySelector("[role=tablist]").getAttribute("aria-orientation"), "vertical");
  assert.ok(settingsRequests > 0, "Settings must still load its data.");

  await view.close();
  await view.unmount();
});

test("Settings takes initial focus, traps Tab, and restores the trigger", async () => {
  const view = await openSettings();
  const search = view.dialog.querySelector("input[aria-label=Search settings]");

  assert.equal(focused(), search, "The search field must take the opening focus.");

  const reachable = tabbable(view.dialog);
  const first = reachable[0];
  const last = reachable[reachable.length - 1];
  assert.ok(reachable.length > 2, "The dialog must hold several reachable controls.");

  last.focus();
  await press(last, "Tab");
  assert.equal(focused(), first, "Tab must wrap to the first control.");

  await press(first, "Tab", { shiftKey: true });
  assert.equal(focused(), last, "Shift and Tab must wrap to the last control.");

  await view.close();
  assert.equal(focused(), view.trigger, "Closing must return focus to the trigger.");
  await view.unmount();
});

test("Escape closes Settings and never reaches the global shortcut listener", async () => {
  let closes = 0;
  const view = await openSettings({ onClose() { closes += 1; } });

  let globalKeys = 0;
  const listener = () => { globalKeys += 1; };
  domWindow.addEventListener("keydown", listener);

  // A button target matters: the global shortcut hook skips an input target
  // by itself, so only the dialog can stop the key press here.
  const backButton = [...view.dialog.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Back to app"));
  const event = await press(backButton, "Escape");

  domWindow.removeEventListener("keydown", listener);

  assert.equal(closes, 1, "Escape must close Settings.");
  assert.equal(event.defaultPrevented, true, "Settings must mark Escape handled.");
  assert.equal(globalKeys, 0, "Escape must not reach the global shortcut listener.");

  await view.close();
  await view.unmount();
});

test("a global keydown still reaches the window when Settings is closed", async () => {
  const view = await mount(h("button", { type: "button" }, "Chat"));
  let globalKeys = 0;
  const listener = () => { globalKeys += 1; };
  domWindow.addEventListener("keydown", listener);

  await press(view.container.querySelector("button"), "Escape");
  domWindow.removeEventListener("keydown", listener);

  assert.equal(globalKeys, 1, "The harness must carry a keydown to the window.");
  await view.unmount();
});

test("the Back to app control reports the model change before it closes Settings", async () => {
  const order = [];
  const view = await openSettings({
    onClose() { order.push("close"); },
    onModelsChanged() { order.push("models"); },
  });

  const backButton = [...view.dialog.querySelectorAll("button")]
    .find((button) => button.textContent.includes("Back to app"));
  assert.ok(backButton, "Settings must keep its Back to app control.");
  await click(backButton);

  assert.deepEqual(order, ["models", "close"]);
  await view.close();
  await view.unmount();
});

test("Settings keeps grouped lazy tabs, search, and FormField relationships", async () => {
  const view = await openSettings();
  const { dialog } = view;

  const groupLabels = dialog.querySelectorAll("[role=group]").map((group) => {
    const labelId = group.getAttribute("aria-labelledby");
    return dialog.querySelector(`#${labelId}`).textContent;
  });
  assert.deepEqual(groupLabels, ["Personal", "Integrations", "Coding", "Archived"]);

  const panels = dialog.querySelectorAll("[role=tabpanel]");
  assert.equal(panels.length, 1, "Only the selected panel mounts.");

  const control = dialog.querySelector("#setting-layout-density");
  assert.ok(control, "The settings field must keep its generated identifier.");
  assert.equal(control.getAttribute("role"), "combobox");
  assert.equal(control.getAttribute("aria-labelledby"), "setting-layout-density-label");
  assert.equal(
    control.getAttribute("aria-describedby"),
    "setting-layout-density-description",
  );
  assert.equal(dialog.querySelector("#setting-layout-density-label").textContent, "Layout density");

  const appearanceTab = [...dialog.querySelectorAll("[role=tab]")]
    .find((tab) => tab.textContent === "Appearance");
  await click(appearanceTab);
  await settle();

  const previews = dialog.querySelectorAll("[data-theme-preview]");
  assert.deepEqual(
    previews.map((preview) => preview.getAttribute("data-theme-preview")),
    ["dark", "light"],
  );
  const previewRules = dialog.querySelectorAll("style").map((node) => node.textContent);
  assert.ok(previewRules.some((rule) => rule.includes("#4ea1ff")), "The dark card shows its accent.");
  assert.ok(previewRules.some((rule) => rule.includes("#0b62d6")), "The light card shows its accent.");

  await view.close();
  await view.unmount();
});

test("a select inside Settings keeps Escape for its own list", async () => {
  let closes = 0;
  const view = await openSettings({ onClose() { closes += 1; } });

  const trigger = view.dialog.querySelector("#setting-layout-density");
  await click(trigger);
  await settle();

  const listbox = view.dialog.querySelector("[role=listbox]");
  assert.ok(listbox, "The select must open its list.");

  const search = view.dialog.querySelector("input[aria-label=Search options…]");
  await press(search, "Escape");
  await settle();

  assert.equal(view.dialog.querySelector("[role=listbox]"), null, "Escape must close the list.");
  assert.equal(closes, 0, "Escape must not close Settings while the list is open.");

  await view.close();
  await view.unmount();
});

test("the harness event carries the same flags a browser event carries", () => {
  const event = new DomEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  event.preventDefault();
  assert.equal(event.defaultPrevented, true);
  assert.equal(domDocument.parentNode, domWindow);
});
