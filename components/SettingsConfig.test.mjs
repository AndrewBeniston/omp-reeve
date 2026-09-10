import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { click, domDocument, mount, press, settle, textOf, typeInto } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { AccessConfigView } = await jiti.import("./AccessConfig.tsx");
const { ProjectTrustDialog } = await jiti.import("./ProjectTrustDialog.tsx");
const { SearchableSelect } = await jiti.import("./SearchableSelect.tsx");
const { FormField } = await jiti.import("./ui/FormField.tsx");
const { Tabs } = await jiti.import("./ui/Tabs.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const { SettingsConfig } = await jiti.import("./SettingsConfig.tsx");
const { COMPLETION_SOUND_SETTING_PATH } = await jiti.import("../lib/settings-api.ts");

const baseStatus = {
  enabled: false,
  configured: false,
  stored: false,
  source: "none",
  managedByEnvironment: false,
  unreadable: false,
  username: "omp",
  updatedAt: null,
  file: "/tmp/omp-web-auth.json",
};

function props(overrides = {}) {
  return {
    status: baseStatus,
    loadError: null,
    error: null,
    notice: null,
    busy: false,
    password: "",
    confirmation: "",
    onPasswordChange() {},
    onConfirmationChange() {},
    onToggleEnabled() {},
    onClearPassword() {},
    onSavePassword() {},
    ...overrides,
  };
}

function render(overrides = {}) {
  return renderToStaticMarkup(React.createElement(AccessConfigView, props(overrides)));
}

function renderProjectTrustDialog(props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ProjectTrustDialog, props),
    ),
  );
}

function findElement(node, predicate) {
  if (!React.isValidElement(node)) return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

test("Access settings expose form states, warnings, labels, and save behavior", () => {
  const loadingHtml = render({ status: null });
  assert.match(loadingHtml, /data-access-state="loading"/);
  assert.match(loadingHtml, /role="status"/);
  assert.match(loadingHtml, /Loading password access/);

  const loadErrorHtml = render({ status: null, loadError: "Credential status failed." });
  assert.match(loadErrorHtml, /data-access-state="load-error"/);
  assert.match(loadErrorHtml, /role="alert"/);
  assert.match(loadErrorHtml, /Credential status failed/);

  const openHtml = render();
  assert.match(openHtml, /data-access-state="unprotected"/);
  assert.match(openHtml, /<h2[^>]*>Security<\/h2>/);
  assert.doesNotMatch(openHtml, /<h2[^>]*>Access<\/h2>/);
  assert.match(openHtml, />Not protected</);
  assert.match(openHtml, /Anyone who can reach this server can use it/);
  assert.match(openHtml, /Reeve never keeps the password/);
  assert.match(openHtml, /reeve --reset-password/);
  assert.doesNotMatch(openHtml, /omp-web (?:never|prints|beyond)/);
  assert.match(openHtml, /<label[^>]*for="access-new-password"/);
  assert.match(openHtml, /<label[^>]*for="access-confirm-password"/);
  assert.match(openHtml, /type="submit"[^>]*disabled=""/);

  const managedHtml = render({
    status: {
      ...baseStatus,
      enabled: true,
      configured: true,
      source: "environment",
      managedByEnvironment: true,
    },
  });
  assert.match(managedHtml, /data-access-state="managed"/);
  assert.match(managedHtml, />Managed</);
  assert.match(managedHtml, /OMP_WEB_PASSWORD/);
  assert.match(managedHtml, /<input(?=[^>]*id="access-new-password")(?=[^>]*disabled="")[^>]*>/);

  const unreadableHtml = render({
    status: { ...baseStatus, configured: true, unreadable: true },
  });
  assert.match(unreadableHtml, /data-access-state="unavailable"/);
  assert.match(unreadableHtml, />Unavailable</);
  assert.match(unreadableHtml, /credential file exists but could not be read/);
  assert.match(unreadableHtml, /Basic Auth is not encryption/);
  assert.match(unreadableHtml, /href="\/recover"/);

  const actionErrorHtml = render({ error: "The update failed." });
  assert.match(actionErrorHtml, /role="alert"/);
  assert.match(actionErrorHtml, /The update failed/);

  let saves = 0;
  const view = AccessConfigView(props({
    password: "password-one",
    confirmation: "password-one",
    onSavePassword() { saves += 1; },
  }));
  const form = findElement(view, (element) => element.type === "form");
  assert.ok(form, "The access settings must expose a password form.");
  let prevented = false;
  form.props.onSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(saves, 1);

  const readyHtml = render({ password: "password-one", confirmation: "password-one" });
  assert.match(readyHtml, /data-dirty="true"/);
  assert.match(readyHtml, /type="submit"(?![^>]*disabled)/);
  assert.match(readyHtml, />Unsaved changes</);

  const savingHtml = render({
    busy: true,
    password: "password-one",
    confirmation: "password-one",
  });
  assert.match(savingHtml, /data-busy="true"/);
  assert.match(savingHtml, /aria-busy="true"/);
  assert.match(savingHtml, />Saving/);
});

test("ProjectTrustDialog exposes labelled dialog and action semantics with zero inline styles", async () => {
  const source = await readFile(new URL("./ProjectTrustDialog.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bstyle\s*=/);
  assert.doesNotMatch(source, /currentTarget\.style/);

  const idleHtml = renderProjectTrustDialog({
    cwd: "/Users/andrew/projects/my-app",
    busy: false,
    error: null,
    onCancel() {},
    onConfirm() {},
  });
  const dialogTag = idleHtml.match(/<div(?=[^>]*role="dialog")[^>]*>/)?.[0];
  const titleId = idleHtml.match(/<h2[^>]*id="([^"]+)"[^>]*>.*Trust this project\?.*<\/h2>/)?.[1];
  const descriptionId = idleHtml.match(/<p[^>]*id="([^"]+)"[^>]*>Project resources can run local code\.[^<]*<\/p>/)?.[1];
  assert.ok(dialogTag, "The trust prompt must expose a dialog.");
  assert.ok(titleId, "The dialog must expose its title as a heading.");
  assert.ok(descriptionId, "The dialog must expose its description.");
  assert.match(dialogTag, /aria-modal="true"/);
  assert.ok(dialogTag.includes(`aria-labelledby="${titleId}"`));
  assert.ok(dialogTag.includes(`aria-describedby="${descriptionId}"`));
  assert.match(idleHtml, />\/Users\/andrew\/projects\/my-app</);
  assert.match(idleHtml, /<button[^>]*>.*Cancel.*<\/button>/);
  assert.match(idleHtml, /<button[^>]*>.*Trust project.*<\/button>/);

  const errorBusyHtml = renderProjectTrustDialog({
    cwd: "/Users/andrew/projects/my-app",
    busy: true,
    error: "Failed to trust project.",
    onCancel() {},
    onConfirm() {},
  });
  assert.match(errorBusyHtml, /role="alert"/);
  assert.match(errorBusyHtml, /Failed to trust project/);
  assert.match(errorBusyHtml, /disabled=""/);
  assert.match(errorBusyHtml, /<button(?=[^>]*aria-busy="true")[^>]*>.*Trusting\.\.\..*<\/button>/);
});

test("SearchableSelect exposes combobox, listbox, option ARIA contracts and zero inline styles", async () => {
  const source = await readFile(new URL("./SearchableSelect.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bstyle\s*=/);
  assert.doesNotMatch(source, /currentTarget\.style/);

  const options = [
    { value: "m1", label: "Model 1", description: "First model" },
    { value: "m2", label: "Model 2" },
  ];
  const html = renderToStaticMarkup(React.createElement(SearchableSelect, {
    value: "m1",
    options,
    onChange() {},
    ariaLabel: "Choose model",
  }));
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-label="Choose model"/);
});

test("SettingsConfig uses grouped vertical Tabs with lazy panels and preserved shell behavior", async () => {
  const [source, tabsSource] = await Promise.all([
    readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8"),
    readFile(new URL("./ui/Tabs.tsx", import.meta.url), "utf8"),
  ]);
  let activeMounts = 0;
  let inactiveMounts = 0;
  function ActivePanel() {
    activeMounts += 1;
    return React.createElement("p", null, "Active settings");
  }
  function InactivePanel() {
    inactiveMounts += 1;
    return React.createElement("p", null, "Inactive settings");
  }
  const html = renderToStaticMarkup(React.createElement(Tabs, {
    label: "Settings sections",
    value: "models",
    orientation: "vertical",
    onValueChange() {},
    items: [
      {
        id: "models",
        label: "Models",
        panel: React.createElement(ActivePanel),
        group: { id: "coding", label: "Coding" },
      },
      {
        id: "settings:appearance",
        label: "Terminal appearance",
        panel: React.createElement(InactivePanel),
        group: { id: "personal", label: "Personal" },
      },
    ],
  }));

  assert.match(source, /import \{ Tabs \} from "\.\/ui\/Tabs"/);
  assert.match(source, /import \{ buildSettingsNavigation \} from "@\/lib\/settings-navigation"/);
  assert.match(source, /<Tabs[\s\S]*?label="Settings sections"[\s\S]*?orientation="vertical"/);
  assert.doesNotMatch(source, /mountInactivePanels/);
  assert.doesNotMatch(source, /NAV_GROUPS|label: "Configuration"|label: "OMP settings"/);
  assert.match(source, /buildSettingsNavigation\(CORE_SECTIONS, settings\?\.tabs \?\? \[\]\)/);
  for (const route of ["models", "themes", "skills", "plugins", "mcp", "access", "archived"]) {
    assert.match(source, new RegExp(`sectionId === "${route}"`));
  }
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, />Coding</);
  assert.match(html, />Personal</);
  assert.equal(activeMounts, 1);
  assert.equal(inactiveMounts, 0);
  assert.match(html, /Active settings/);
  assert.doesNotMatch(html, /Inactive settings/);
  assert.match(tabsSource, /orientation === "horizontal" \? "ArrowLeft" : "ArrowUp"/);
  assert.match(tabsSource, /orientation === "horizontal" \? "ArrowRight" : "ArrowDown"/);
  assert.match(source, /value=\{query\}[\s\S]*?onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
  assert.match(source, /onValueChange=\{\(value\) => \{ setQuery\(""\); setSection\(value as SettingsSection\); \}\}/);
  assert.match(source, /const close = useCallback\(\(\) => \{ onModelsChanged\?\.\(\); onClose\(\); \}/);
  assert.match(source, /onOpenChange=\{\(next\) => \{ if \(!next\) close\(\); \}\}/);
  assert.match(source, /<ModelsConfig[\s\S]*?embedded[\s\S]*?onClose=\{close\}/);
});

test("Settings opens General and uses neutral Codex selection surfaces", async () => {
  const [source, sheet, treeSheet, rolesSheet] = await Promise.all([
    readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8"),
    readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8"),
    readFile(new URL("./models/models-sidebar-tree.module.css", import.meta.url), "utf8"),
    readFile(new URL("./ModelRolesPanel.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /initialSection = "settings:interaction"/);
  assert.match(source, /className=\{styles\.backRail\}/);
  assert.match(source, /t\("settings\.backToApp"\)/);
  assert.doesNotMatch(source, /className=\{styles\.eyebrow\}/);
  assert.doesNotMatch(source, /className=\{styles\.closeRail\}/);

  assert.match(sheet, /--settings-selection-bg:\s*var\(--ui-row-selected\);/);
  assert.match(sheet, /\.settingsTabs \[role="tab"\]\[aria-selected="true"\]\s*\{[^}]*background:\s*var\(--settings-selection-bg\);/);
  assert.doesNotMatch(sheet, /\.settingsTabs \[role="tab"\]\[aria-selected="true"\]\s*\{[^}]*var\(--ui-active\)/);
  assert.match(treeSheet, /\[data-selected="true"\]\s*\{[^}]*background:\s*var\(--settings-selection-bg,\s*var\(--ui-row-selected\)\);/);
  const roleTagRule = rolesSheet.match(/\.roleTag\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(roleTagRule, /color:\s*var\(--ui-text-dim\);/);
  assert.doesNotMatch(roleTagRule, /background:|border:/);
  assert.match(rolesSheet, /\.thinkingButton\[data-active="true"\]\s*\{[^}]*background:\s*var\(--settings-selection-bg,\s*var\(--ui-row-selected\)\);[^}]*color:\s*var\(--settings-selection-text,\s*var\(--ui-text\)\);/);
});

test("Settings owns one theme-derived palette, type scale, and radius scale", async () => {
  const [sheet, tokens] = await Promise.all([
    readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/tokens.css", import.meta.url), "utf8"),
  ]);
  const root = sheet.match(/\.settingsDialog\.settingsDialog\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(tokens, /--ui-settings-canvas:\s*var\(--assistant-bg\);/);
  assert.match(tokens, /--ui-settings-sidebar:\s*color-mix\(in srgb, var\(--assistant-bg\) 97\.5%, var\(--text\)\);/);
  assert.match(tokens, /html\.dark\s*\{[^}]*--ui-settings-sidebar:\s*color-mix\(in srgb, var\(--assistant-bg\) 92%, var\(--text\)\);/);
  assert.match(tokens, /--ui-settings-surface:\s*color-mix\(in srgb, var\(--bg-panel\) 92%, var\(--text\)\);/);
  assert.doesNotMatch(tokens, /--ui-settings-[^:]+:[^;]*oklch\(/);
  assert.match(root, /--settings-canvas:\s*var\(--ui-settings-canvas\);/);
  assert.match(root, /--settings-sidebar:\s*var\(--ui-settings-sidebar\);/);
  assert.match(root, /--ui-canvas:\s*var\(--settings-canvas\);/);
  assert.match(root, /--ui-sidebar:\s*var\(--settings-sidebar\);/);
  assert.match(root, /--ui-active:\s*var\(--ui-row-selected\);/);
  assert.match(root, /--ui-border-strong:\s*color-mix\(in srgb, var\(--settings-border\) 60%, var\(--settings-text\)\);/);
  assert.match(root, /--ui-border-subtle:\s*color-mix\(in srgb, var\(--settings-border\) 55%, transparent\);/);
  assert.match(root, /--settings-text-label:\s*14px;/);
  assert.match(root, /--settings-text-description:\s*13px;/);
  assert.match(root, /--settings-text-value:\s*13px;/);
  assert.match(root, /--settings-radius-row:\s*10px;/);
  assert.match(root, /--settings-radius-card:\s*12px;/);
  assert.match(root, /--settings-radius-control:\s*8px;/);
  assert.doesNotMatch(root, /#[0-9a-f]{3,8}|\brgba?\(/i);
});

test("Settings contains the web theme and language controls", async () => {
  const source = await readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");
  assert.match(source, /const \{ preference, theme, toggleTheme \} = useTheme\(\)/);
  assert.match(source, /const \{ locale, setLocale, supportedLocales, t \} = useI18n\(\)/);
  assert.match(source, /t\("settings\.appearance\.theme"\)/);
  assert.match(source, /t\("settings\.appearance\.language"\)/);
  assert.match(source, /supportedLocales\.map/);
  assert.match(source, /setLocale\(option\.id as typeof locale\)/);
});

test("Settings search finds core destinations and supports keyboard entry", async (t) => {
  const fixture = {
    tabs: [{ id: "model", label: "Model", groups: ["Retry & Fallback"] }],
    fields: [
      {
        path: "theme.dark",
        tab: "appearance",
        group: "Theme",
        label: "Dark theme",
        description: "The dark theme.",
        type: "select",
        value: "titanium",
        defaultValue: "titanium",
        configured: false,
        options: [{ value: "titanium", label: "Titanium" }],
      },
      {
        path: "theme.light",
        tab: "appearance",
        group: "Theme",
        label: "Light theme",
        description: "The light theme.",
        type: "select",
        value: "light",
        defaultValue: "light",
        configured: false,
        options: [{ value: "light", label: "Light" }],
      },
      {
        path: "retry.maxRetries",
        tab: "model",
        group: "Retry & Fallback",
        label: "Retry Attempts",
        description: "Maximum retry attempts.",
        type: "select",
        value: 3,
        defaultValue: 3,
        configured: false,
        options: [{ value: "3", label: "3" }],
      },
    ],
    availableThemes: [],
    theme: {
      names: { dark: "titanium", light: "light" },
      palettes: {
        dark: { name: "titanium", colorScheme: "dark", variables: {} },
        light: { name: "light", colorScheme: "light", variables: {} },
      },
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => structuredClone(fixture) });
  t.after(() => { globalThis.fetch = previousFetch; });

  const view = await mount(React.createElement(I18nProvider, null, React.createElement(SettingsConfig, {
    cwd: null,
    sessionId: null,
    initialSection: "settings:model",
    soundEnabled: true,
    onSoundToggle() {},
    onClose() {},
  })));
  await settle();
  const search = domDocument.body.querySelector("[aria-label='Search settings']");

  await typeInto(search, "password");
  await settle();
  let results = domDocument.body.querySelector("[aria-label='Settings search results']");
  assert.ok(results);
  assert.match(textOf(results), /Security/);
  assert.match(textOf(domDocument.body), /1 matching Settings results/);

  await press(search, "ArrowDown");
  assert.equal(domDocument.activeElement, results.querySelector("button"));

  await typeInto(search, "retry");
  await settle();
  results = domDocument.body.querySelector("[aria-label='Settings search results']");
  assert.match(textOf(results), /Agent behavior/);
  assert.match(textOf(results), /Retry Attempts/);

  await view.unmount();
});

test("Settings renders completion sound in Interaction Notifications and toggles the audio preference", async (t) => {
  const fixture = {
    tabs: [{ id: "interaction", label: "Interaction", groups: ["Notifications"] }],
    fields: [
      {
        path: "theme.dark",
        tab: "appearance",
        group: "Theme",
        label: "Dark theme",
        description: "The dark theme.",
        type: "select",
        value: "titanium",
        defaultValue: "titanium",
        configured: false,
        options: [{ value: "titanium", label: "Titanium" }],
      },
      {
        path: "theme.light",
        tab: "appearance",
        group: "Theme",
        label: "Light theme",
        description: "The light theme.",
        type: "select",
        value: "light",
        defaultValue: "light",
        configured: false,
        options: [{ value: "light", label: "Light" }],
      },
      {
        path: "completion.notify",
        tab: "interaction",
        group: "Notifications",
        label: "Completion Notification",
        description: "Notify when the agent finishes a turn.",
        type: "boolean",
        value: true,
        defaultValue: true,
        configured: false,
      },
      {
        path: COMPLETION_SOUND_SETTING_PATH,
        owner: "browser",
        tab: "interaction",
        group: "Notifications",
        label: "settings.interaction.completionSound",
        description: "settings.interaction.completionSoundDescription",
        type: "boolean",
        value: null,
        defaultValue: true,
        configured: false,
      },
    ],
    availableThemes: [],
    theme: {
      names: { dark: "titanium", light: "light" },
      palettes: {
        dark: { name: "titanium", colorScheme: "dark", variables: {} },
        light: { name: "light", colorScheme: "light", variables: {} },
      },
    },
  };
  const previousFetch = globalThis.fetch;
  let patches = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PATCH") {
      patches += 1;
      return { ok: true, status: 200, json: async () => ({ success: true, value: true }) };
    }
    return { ok: true, status: 200, json: async () => structuredClone(fixture) };
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  let toggles = 0;
  function Harness() {
    const [soundEnabled, setSoundEnabled] = React.useState(false);
    return React.createElement(I18nProvider, null, React.createElement(SettingsConfig, {
      cwd: null,
      sessionId: null,
      initialSection: "settings:interaction",
      soundEnabled,
      onSoundToggle() {
        toggles += 1;
        setSoundEnabled((current) => !current);
      },
      onClose() {},
    }));
  }

  const view = await mount(React.createElement(Harness));
  await settle();
  const dialog = domDocument.body.querySelector("[role=dialog]");
  const notificationGroup = dialog.querySelectorAll("h3")
    .find((heading) => heading.textContent === "Notifications")
    ?.parentElement;
  const ompControl = dialog.querySelector("#setting-completion-notify");
  let soundControl = dialog.querySelector("#setting-web-omp-sound-enabled");

  assert.ok(notificationGroup, "Interaction must render the Notifications group.");
  assert.ok(notificationGroup.contains(ompControl), "The group must retain OMP's Completion Notification row.");
  assert.ok(notificationGroup.contains(soundControl), "The group must add the Completion sound row.");
  assert.equal(notificationGroup.textContent.includes("Completion sound"), true);
  assert.equal(notificationGroup.textContent.includes("Play a sound when an agent run finishes."), true);
  assert.equal(soundControl.getAttribute("aria-pressed"), "false");

  await click(soundControl);
  await settle();
  soundControl = dialog.querySelector("#setting-web-omp-sound-enabled");
  assert.equal(toggles, 1);
  assert.equal(patches, 0);
  assert.equal(soundControl.getAttribute("aria-pressed"), "true");

  await view.unmount();
});

test("Settings does not render a browser field without an adapter", async (t) => {
  const fixture = {
    tabs: [{ id: "interaction", label: "Interaction", groups: ["Notifications"] }],
    fields: [
      {
        path: "theme.dark",
        tab: "appearance",
        group: "Theme",
        label: "Dark theme",
        description: "The dark theme.",
        type: "select",
        value: "titanium",
        defaultValue: "titanium",
        configured: false,
        options: [{ value: "titanium", label: "Titanium" }],
      },
      {
        path: "theme.light",
        tab: "appearance",
        group: "Theme",
        label: "Light theme",
        description: "The light theme.",
        type: "select",
        value: "light",
        defaultValue: "light",
        configured: false,
        options: [{ value: "light", label: "Light" }],
      },
      {
        path: "web.missing-adapter",
        owner: "browser",
        tab: "interaction",
        group: "Notifications",
        label: "settings.interaction.missingAdapter",
        description: "settings.interaction.missingAdapterDescription",
        type: "boolean",
        value: null,
        defaultValue: false,
        configured: false,
      },
      {
        path: "completion.notify",
        tab: "interaction",
        group: "Notifications",
        label: "Completion Notification",
        description: "Notify when the agent finishes a turn.",
        type: "boolean",
        value: true,
        defaultValue: true,
        configured: false,
      },
    ],
    availableThemes: [],
    theme: {
      names: { dark: "titanium", light: "light" },
      palettes: {
        dark: { name: "titanium", colorScheme: "dark", variables: {} },
        light: { name: "light", colorScheme: "light", variables: {} },
      },
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => structuredClone(fixture),
  });
  t.after(() => { globalThis.fetch = previousFetch; });

  const view = await mount(React.createElement(I18nProvider, null, React.createElement(SettingsConfig, {
    cwd: null,
    sessionId: null,
    initialSection: "settings:interaction",
    soundEnabled: true,
    onSoundToggle() {},
    onClose() {},
  })));
  await settle();

  const dialog = domDocument.body.querySelector("[role=dialog]");
  assert.ok(dialog.querySelector("#setting-completion-notify"));
  assert.equal(dialog.querySelector("#setting-web-missing-adapter"), null);
  assert.equal(dialog.textContent.includes("settings.interaction.missingAdapter"), false);
  await view.unmount();
});

test("completion sound labels use Settings i18n keys", async () => {
  const [settingsApi, english, simplifiedChinese] = await Promise.all([
    readFile(new URL("../lib/settings-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  assert.match(settingsApi, /label: "settings\.interaction\.completionSound"/);
  assert.match(settingsApi, /description: "settings\.interaction\.completionSoundDescription"/);
  assert.doesNotMatch(settingsApi, /label: "Completion sound"|description: "Play a sound when an agent run finishes\."/);
  for (const catalog of [english, simplifiedChinese]) {
    assert.match(catalog, /"settings\.interaction\.completionSound"/);
    assert.match(catalog, /"settings\.interaction\.completionSoundDescription"/);
    assert.doesNotMatch(catalog, /"chat\.(?:enableSound|disableSound)"/);
  }
});

test("the Settings stylesheet keeps the shell layout, focus ring, and touch size", async () => {
  const sheet = await readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8");

  // Settings renders beside ShellLayout, so it names its own sans stack.
  assert.match(sheet, /\.settingsDialog\.settingsDialog \{[^}]*font-family: var\(--font-sans\)/);
  assert.match(sheet, /\.settingsDialog\.settingsDialog \{[^}]*display: block/);
  assert.match(sheet, /\.settingsLayout\s*\{[^}]*display: grid/);
  assert.doesNotMatch(sheet, /\bInter\b/);
  assert.doesNotMatch(sheet, /\bmigrated\d*\b/);

  const focusRules = sheet.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(focusRules.length > 0, "The Settings controls need a focus rule.");
  for (const rule of focusRules) {
    assert.match(rule, /outline: var\(--ui-focus-ring\)/, rule);
    assert.match(rule, /outline-offset: var\(--ui-focus-offset\)/, rule);
  }

  const touchBlocks = sheet.match(/@media[^{]*pointer: coarse[^{]*\{[\s\S]*?\n\}/g) ?? [];
  assert.ok(touchBlocks.length >= 1, "Settings needs coarse-pointer rules.");
  assert.match(touchBlocks.join("\n"), /var\(--ui-control-touch\)/);
  for (const control of [".search", ".textInput", ".switch", ".backButton", ".serverToggle", ".choiceToggle"]) {
    assert.ok(touchBlocks.join("\n").includes(control), `${control} needs the touch size`);
  }
});

test("Settings navigation inherits the current app sidebar width and title-bar clearance", async () => {
  const [source, sheet] = await Promise.all([
    readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8"),
    readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    sheet,
    /\.settingsLayout\s*\{[^}]*grid-template-columns:\s*var\(--ui-panel-width\)\s+minmax\(0,\s*1fr\);/,
  );
  assert.match(source, /variables=\{\{ "--ui-panel-width": getPanelWidthCssValue\(sidebarWidth\) \}\}/);
  assert.match(sheet, /\.backRail\s*\{[^}]*padding:\s*44px var\(--space-3\) var\(--space-2\);/);
  assert.match(sheet, /\.backButton\s*\{[^}]*font-weight:\s*var\(--font-weight-regular\);/);
  assert.match(source, /<path d="M19 12H5" \/>[\s\S]*?<path d="m12 19-7-7 7-7" \/>/);
});

test("Settings navigation uses the current Codex text and icon sizes", async () => {
  const sheet = await readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8");
  assert.match(sheet, /\.search\s*\{[^}]*font:\s*13px\/18px var\(--font-sans\);/);
  assert.match(sheet, /\.settingsTabs \[role="group"\] > div\s*\{[^}]*font-size:\s*var\(--text-sm\);[^}]*line-height:\s*18px;/);
  assert.match(sheet, /\.settingsTabs \[role="tab"\]\s*\{[^}]*min-height:\s*30px;[^}]*gap:\s*var\(--space-2\);[^}]*border-radius:\s*var\(--settings-radius-row\);[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*21px;/);
  assert.match(sheet, /\.navIcon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/);
  assert.match(sheet, /\.backButton\s*\{[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*21px;/);
});

test("Settings groups use Codex section headers and card rows", async () => {
  const sheet = await readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8");
  assert.match(sheet, /\.groupTitle\s*\{[^}]*font-family:\s*var\(--font-sans\);[^}]*font-size:\s*var\(--settings-text-label\);[^}]*line-height:\s*21px;[^}]*text-transform:\s*none;/);
  assert.match(sheet, /\.settingRow\s*\{[^}]*padding:\s*14px 16px;[^}]*background:\s*var\(--settings-card-bg\);/);
  assert.match(sheet, /\.groupTitle \+ \.settingRow\s*\{[^}]*border-radius:\s*var\(--settings-radius-card\) var\(--settings-radius-card\) 0 0;/);
  assert.match(sheet, /\.group \.settingRow:last-child\s*\{[^}]*border-radius:\s*0 0 var\(--settings-radius-card\) var\(--settings-radius-card\);/);
  assert.match(sheet, /\.group \.settingRow:only-child\s*\{[^}]*border-radius:\s*var\(--settings-radius-card\);/);
});

test("Settings switches keep the Codex track size inside a separate touch target", async () => {
  const sheet = await readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8");

  assert.match(sheet, /\.switch\s*\{[^}]*width:\s*38px;[^}]*height:\s*22px;[^}]*border:\s*0;[^}]*background:\s*transparent;/);
  assert.match(sheet, /\.switch > span\s*\{[^}]*border:\s*1px solid var\(--ui-border\);[^}]*border-radius:\s*var\(--radius-round\);/);
  assert.match(sheet, /\.switch > span::after\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/);
  assert.match(sheet, /\.switch\[data-on="true"\] > span\s*\{[^}]*background:\s*var\(--ui-accent\);/);
  assert.match(sheet, /@media \(pointer: coarse\)[\s\S]*?\.switch\s*\{[^}]*width:\s*var\(--ui-control-touch\);[^}]*height:\s*var\(--ui-control-touch\);/);
});

test("Settings chrome uses the sans face while paths and values stay monospace", async () => {
  const sheet = await readFile(new URL("./SettingsConfig.module.css", import.meta.url), "utf8");
  const ruleFor = (selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declarations = sheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
    assert.ok(declarations, `${selector} needs a CSS rule.`);
    return declarations;
  };

  for (const selector of [
    '.settingsTabs [role="group"] > div',
    '.settingsTabs [role="tab"]',
    ".search",
    ".backButton",
  ]) {
    const declarations = ruleFor(selector);
    assert.match(declarations, /var\(--font-sans\)/, `${selector} must use the sans face.`);
    assert.doesNotMatch(declarations, /var\(--font-mono\)/, `${selector} must not use the mono face.`);
  }

  assert.match(ruleFor(".context"), /var\(--font-mono\)/, "The settings path must keep the mono face.");
  assert.match(
    sheet,
    /\.select, \.textInput, \.jsonEditor, \.numberInput \{[^}]*var\(--font-mono\)/,
    "Settings values must keep the mono face.",
  );
});

test("the SearchableSelect stylesheet keeps the focus ring and the touch size", async () => {
  const sheet = await readFile(new URL("./SearchableSelect.module.css", import.meta.url), "utf8");

  const focusRules = sheet.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? [];
  assert.ok(focusRules.length > 0, "The select needs a focus rule.");
  for (const rule of focusRules) {
    assert.match(rule, /outline: var\(--ui-focus-ring\)/, rule);
    assert.match(rule, /outline-offset: var\(--ui-focus-offset\)/, rule);
  }

  const touchBlocks = sheet.match(/@media[^{]*pointer: coarse[^{]*\{[\s\S]*?\n\}/g) ?? [];
  assert.equal(touchBlocks.length, 1, "The select needs one touch block.");
  assert.match(touchBlocks[0], /var\(--ui-control-touch\)/);
});

test("SettingsConfig uses horizontal Tabs for MCP scope navigation", async () => {
  const source = await readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");
  const html = renderToStaticMarkup(React.createElement(Tabs, {
    label: "MCP configuration scope",
    value: "user",
    orientation: "horizontal",
    onValueChange() {},
    items: [
      { id: "user", label: "User · 2", panel: "User servers" },
      { id: "project", label: "Project · 1", panel: "Project servers" },
    ],
  }));

  assert.match(source, /<Tabs[\s\S]*?label="MCP configuration scope"[\s\S]*?orientation="horizontal"/);
  assert.match(html, /aria-orientation="horizontal"/);
  assert.match(html, /aria-controls="[^"]+"/);
  assert.match(html, /role="tabpanel"/);
  assert.doesNotMatch(source, /styles\.scopeButton/);
});

test("SettingsConfig gives shared FormField and SearchableSelect stable ARIA relationships", async () => {
  const source = await readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");
  const html = renderToStaticMarkup(React.createElement(FormField, {
    id: "setting-defaultThinkingLevel",
    label: "Thinking level",
    description: "Choose the default thinking level.",
    labelMode: "aria-labelledby",
  }, React.createElement(SearchableSelect, {
    value: "medium",
    options: [{ value: "medium", label: "Medium" }],
    onChange() {},
  })));

  assert.match(source, /function settingFieldId\(path: string\)/);
  assert.match(source, /<FormField[\s\S]*?id=\{settingFieldId\(field\.path\)\}[\s\S]*?labelMode="aria-labelledby"[\s\S]*?<SettingControl/);
  assert.match(source, /<SearchableSelect[\s\S]*?\{\.\.\.controlProps\}/);
  assert.match(source, /id=\{`theme-\$\{mode\}`\}[\s\S]*?labelMode="aria-labelledby"[\s\S]*?<SearchableSelect/);
  assert.match(html, /id="setting-defaultThinkingLevel-label"/);
  assert.match(html, /id="setting-defaultThinkingLevel"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-labelledby="setting-defaultThinkingLevel-label"/);
  assert.match(html, /aria-describedby="setting-defaultThinkingLevel-description"/);
});

test("SettingsConfig uses shared action buttons", async () => {
  const source = await readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ Button \} from "\.\/ui\/Button"/);
  assert.match(source, /import \{ IconButton \} from "\.\/ui\/IconButton"/);
  assert.doesNotMatch(source, /<button\b/);
});

test("Settings contains the archived chats recovery section", async () => {
  const source = await readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ ArchivedChatsSettings \}/);
  assert.match(source, /\{ id: "archived", label: "Archived chats", icon: "archive" \}/);
  assert.match(source, /sectionId === "archived"/);
  assert.match(source, /<ArchivedChatsSettings onChanged=\{onArchivedSessionsChanged\}/);
});

test("Settings state components eliminate direct DOM mutations and state inline styles", async () => {
  const sourceFiles = [
    "SettingsConfig.tsx",
    "ModelsConfig.tsx",
    "ModelRolesPanel.tsx",
    "PluginsConfig.tsx",
    "SkillsConfig.tsx",
    "AccessConfig.tsx",
    "ProjectTrustDialog.tsx",
    "SearchableSelect.tsx",
  ];
  const sources = await Promise.all(sourceFiles.map(async (file) => [
    file,
    await readFile(new URL(`./${file}`, import.meta.url), "utf8"),
  ]));
  const sourceByFile = Object.fromEntries(sources);
  const rolesSource = sourceByFile["ModelRolesPanel.tsx"];

  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /currentTarget\.style/, file);
    assert.doesNotMatch(source, /\bstyle\s*=/, file);
    assert.doesNotMatch(source, /React\.CSSProperties/, file);
  }

  assert.match(rolesSource, /aria-pressed={scope === option}/);
  assert.match(rolesSource, /data-active={scope === option}/);
  assert.match(rolesSource, /role="group"/);
});

test("settings preserve public configuration actions", async () => {
  const settingsSource = await readFile(new URL("./SettingsConfig.tsx", import.meta.url), "utf8");
  const pluginsSource = await readFile(new URL("./PluginsConfig.tsx", import.meta.url), "utf8");
  const skillsSource = await readFile(new URL("./SkillsConfig.tsx", import.meta.url), "utf8");

  assert.match(settingsSource, /method: "PATCH"/);
  assert.match(settingsSource, /method: "PUT"/);
  assert.match(settingsSource, /type: "reload"/);
  for (const action of ["install", "remove", "update", "disable", "enable"]) {
    assert.match(pluginsSource, new RegExp(`"${action}"`));
  }
  for (const route of ["/api/skills/search", "/api/skills/install", "/api/skills/check", "/api/skills/update"]) {
    assert.match(skillsSource, new RegExp(route));
  }
  assert.match(skillsSource, /disableModelInvocation: next/);
});
