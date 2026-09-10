import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { React, click, domDocument, mount, press, settle } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  serializeHeaderRows,
  setCompatBool,
  updateHeaderRow,
} = await jiti.import("./models-config-helpers.ts");
const { ModelsConfig } = await jiti.import("./ModelsConfig.tsx");
const { ProviderDetail } = await jiti.import("./models/ProviderDetail.tsx");
const { ModelDetail } = await jiti.import("./models/ModelDetail.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

const modelsDirectory = new URL("./models/", import.meta.url);
const modelsFiles = await readdir(modelsDirectory);
const featureSources = await Promise.all(
  ["ModelsConfig.tsx", "ModelsConfig.module.css", "ModelRolesPanel.tsx", "ModelRolesPanel.module.css"]
    .map((name) => new URL(`./${name}`, import.meta.url))
    .concat(modelsFiles.map((name) => new URL(name, modelsDirectory)))
    .map(async (url) => ({ name: url.pathname.split("/").pop(), text: await readFile(url, "utf8") })),
);

function styleSheets() {
  return featureSources.filter((file) => file.name.endsWith(".module.css"));
}

function interactiveStyleSheets() {
  return styleSheets().filter((file) => /:focus-visible/.test(file.text));
}

/** Shipped sources only. A test file may name a class it forbids. */
function shippedSources() {
  return featureSources.filter((file) => !file.name.endsWith(".test.mjs"));
}

function render(element) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, element));
}

test("editing a header preserves row order and stable identities", () => {
  const rows = [
    { id: 10, name: "X-First", value: "one" },
    { id: 11, name: "X-Second", value: "two" },
  ];
  const updated = updateHeaderRow(rows, 10, { name: "X-First-Edited" });

  assert.deepEqual(updated.map(({ id, name }) => ({ id, name })), [
    { id: 10, name: "X-First-Edited" },
    { id: 11, name: "X-Second" },
  ]);
  assert.deepEqual(serializeHeaderRows(updated), {
    "X-First-Edited": "one",
    "X-Second": "two",
  });
});

test("blank header drafts are omitted until they have a name", () => {
  const rows = [
    { id: 1, name: "X-Existing", value: "kept" },
    { id: 2, name: "", value: "draft value" },
  ];

  assert.deepEqual(serializeHeaderRows(rows), { "X-Existing": "kept" });
  assert.deepEqual(
    serializeHeaderRows(updateHeaderRow(rows, 2, { name: "X-Draft" })),
    { "X-Existing": "kept", "X-Draft": "draft value" },
  );
});

test("disabling the developer role writes an explicit false override", () => {
  assert.deepEqual(
    setCompatBool({ compat: { supportsStore: true } }, "supportsDeveloperRole", false),
    { compat: { supportsStore: true, supportsDeveloperRole: false } },
  );
});

test("the provider panel exposes provider-level request headers", () => {
  const html = render(React.createElement(ProviderDetail, {
    name: "local",
    provider: { api: "openai-completions", headers: { "User-Agent": "omp" } },
    onChange() {},
    onRename() {},
    onDelete() {},
    onAddModels() {},
  }));

  assert.match(html, /placeholder="Header-Name"/);
  assert.match(html, /value="User-Agent"/);
  assert.match(html, /aria-label="Header value"/);
});

test("the model panel exposes model headers and the developer-role compat toggle", () => {
  const html = render(React.createElement(ModelDetail, {
    providerName: "local",
    provider: { api: "openai-completions", compat: { supportsDeveloperRole: false } },
    model: { id: "qwen3", reasoning: true, headers: { "X-Model": "1" } },
    onChange() {},
    onDelete() {},
  }));

  assert.match(html, /value="X-Model"/);
  assert.match(html, /Use developer role for the system prompt/);
  // The provider set the flag to false, so the model panel shows it unchecked.
  const beforeLabel = html.slice(0, html.indexOf("Use developer role"));
  assert.doesNotMatch(beforeLabel.slice(beforeLabel.lastIndexOf("<input")), /checked=""/);
  assert.match(html, /Thinking level map/);
});

test("the model panel hides the thinking map until reasoning is on", () => {
  const html = render(React.createElement(ModelDetail, {
    providerName: "local",
    provider: {},
    model: { id: "qwen3" },
    onChange() {},
    onDelete() {},
  }));

  assert.doesNotMatch(html, /Thinking level map/);
  assert.doesNotMatch(html, /DeepSeek thinking compat/);
});

test("ModelsConfig renders its shell, its tree, and its save actions", () => {
  const html = render(React.createElement(ModelsConfig, { cwd: "/tmp/project", onClose() {} }));

  assert.match(html, /~\/\.omp\/agent\/models\.yml/);
  assert.match(html, /<div role="tree" aria-label="Models"/);
  assert.match(html, /<button[^>]*role="treeitem"/);
  assert.match(html, /Model roles/);
  assert.match(html, /Add provider/);
  assert.match(html, /Save/);
  assert.match(html, /aria-label="Close"/);
});

test("the embedded Models page uses the Settings navigation instead of a second close control", () => {
  const source = featureSources.find((file) => file.name === "ModelsConfig.tsx").text;

  assert.match(source, /\{!embedded && \(\s*<IconButton[^>]*label=\{t\("i18n\.close"\)\}/s);
});

test("the embedded Models page consumes one Settings visual contract", () => {
  const container = featureSources.find((file) => file.name === "ModelsConfig.module.css").text;
  const roles = featureSources.find((file) => file.name === "ModelRolesPanel.module.css").text;
  const tree = featureSources.find((file) => file.name === "models-sidebar-tree.module.css").text;
  const roleSource = featureSources.find((file) => file.name === "ModelRolesPanel.tsx").text;

  assert.match(container, /\.modelsModalCard\[data-embedded="true"\] \.modalHeader\s*\{[^}]*padding:\s*60px clamp\(24px, 5vw, 56px\) 28px;[^}]*border-bottom:\s*0;/);
  assert.match(container, /\.modelsModalCard\[data-embedded="true"\] \.modalTitle\s*\{[^}]*font-size:\s*28px;[^}]*font-weight:\s*var\(--font-weight-medium\);/);
  assert.match(container, /\.modelsModalCard\[data-embedded="true"\] \.modelsModalBody\s*\{[^}]*max-width:\s*1060px;[^}]*gap:\s*var\(--space-5\);/);
  assert.match(container, /\.modelsSidebarTree\s*\{[^}]*border:\s*1px solid var\(--ui-border\);[^}]*border-radius:\s*var\(--settings-radius-card, 12px\);[^}]*background:\s*var\(--settings-card-bg, var\(--ui-sidebar\)\);/);
  assert.match(roles, /\.rolesList\s*\{[^}]*gap:\s*0;[^}]*border:\s*1px solid var\(--ui-border\);[^}]*border-radius:\s*var\(--settings-radius-card, 12px\);[^}]*overflow:\s*hidden;/);
  assert.match(roles, /\.roleCard\.roleCard\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/);
  assert.match(roles, /\.roleCard \+ \.roleCard\s*\{[^}]*border-top:\s*1px solid var\(--ui-border-subtle\);/);
  assert.match(roleSource, /className=\{styles\.roleIdentity\}/);
  assert.match(tree, /\.treeRow,[\s\S]*?border-radius:\s*var\(--settings-radius-row, 10px\);/);
  assert.match(tree, /\.providerName\s*\{[^}]*font-size:\s*var\(--settings-text-value, 13px\);[^}]*font-family:\s*var\(--font-sans\);/);
});

test("the provider picker owns its nested modal layer and restores focus", async () => {
  const { Dialog } = await jiti.import("./ui/Dialog.tsx");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = String(input);
    const data = path === "/api/models-config"
      ? { providers: {} }
      : { providers: [] };
    return { ok: true, status: 200, json: async () => data };
  };

  let view;
  try {
    view = await mount(React.createElement(
      I18nProvider,
      null,
      React.createElement(
        Dialog,
        { open: true, title: "Settings", onOpenChange() {} },
        React.createElement(ModelsConfig, { embedded: true, onClose() {} }),
      ),
    ));
    await settle();

    const settingsDialog = domDocument.body.querySelector("[role='dialog']");
    const settingsBackdrop = settingsDialog.parentElement;
    const settingsLayer = settingsBackdrop.parentElement;
    const addProvider = settingsDialog.querySelectorAll("button")
      .find((button) => button.textContent.includes("Add provider"));
    assert.ok(addProvider, "ModelsConfig must expose the provider picker trigger");

    addProvider.focus();
    await click(addProvider);
    const pickerInput = domDocument.body.querySelector("input[aria-label='Search providers…']");
    const pickerDialog = pickerInput.closest("[role='dialog']");
    const pickerBackdrop = pickerDialog.parentElement;
    const pickerLayer = pickerBackdrop.parentElement;
    const modalHost = pickerLayer.parentElement;

    assert.equal(modalHost.parentElement, domDocument.body, "the shared host uses the body portal");
    assert.deepEqual(modalHost.childNodes, [settingsLayer, pickerLayer], "the provider picker paints above Settings");
    assert.equal(settingsLayer.hasAttribute("inert"), true, "Settings becomes inert below the provider picker");
    assert.equal(settingsLayer.getAttribute("aria-hidden"), "true", "Settings leaves accessibility navigation");
    assert.equal(domDocument.activeElement, pickerInput, "the provider search owns focus");

    await press(pickerInput, "Escape");
    assert.equal(domDocument.body.querySelector("input[aria-label='Search providers…']"), null);
    assert.equal(settingsLayer.hasAttribute("inert"), false);
    assert.equal(settingsLayer.hasAttribute("aria-hidden"), false);
    assert.equal(domDocument.activeElement, addProvider, "focus returns to Add provider");
  } finally {
    if (view) await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("ModelsConfig keeps every provider, model, role, auth, discovery and save route", () => {
  const code = featureSources.filter((file) => /\.tsx?$/.test(file.name)).map((file) => file.text).join("\n");

  for (const route of [
    "/api/models-config/discover",
    "/api/models-config/test",
    "/api/models-config/catalog",
    "/api/auth/providers",
    "/api/auth/all-providers",
    "/api/auth/api-key/",
    "/api/auth/login/",
    "/api/auth/logout/",
    "/api/models-config",
  ]) {
    assert.ok(code.includes(route), `missing route ${route}`);
  }
  assert.match(code, /<ModelRolesPanel/);
  assert.match(code, /body: JSON\.stringify\(config\)/);
  assert.match(code, /method: "PUT"/);
  assert.match(code, /method: "DELETE"/);
});

test("ModelsConfig keeps the shared settings primitives", () => {
  const container = featureSources.find((file) => file.name === "ModelsConfig.tsx").text;
  for (const primitive of ["Button", "IconButton", "Surface"]) {
    assert.match(container, new RegExp(`import \\{ ${primitive} \\} from "\\./ui/${primitive}"`));
  }

  const code = featureSources.filter((file) => /\.tsx$/.test(file.name)).map((file) => file.text).join("\n");
  for (const primitive of ["FormField", "StatusBadge", "Tooltip"]) {
    assert.match(code, new RegExp(`<${primitive}\\b`));
  }
});

test("no generated placeholder class name survives the migration", () => {
  for (const file of shippedSources()) {
    assert.doesNotMatch(file.text, /\bmigrated\d*\b/, file.name);
  }
});

test("ModelsConfig mutates no DOM style and writes no inline style", () => {
  for (const file of featureSources.filter((entry) => /\.tsx$/.test(entry.name))) {
    assert.doesNotMatch(file.text, /\.style\s*(?:\.|\[)|setAttribute\(\s*["']style/, file.name);
    assert.doesNotMatch(file.text, /\sstyle=\{/, file.name);
  }
});

test("every Models stylesheet gives its own controls a visible focus ring", () => {
  for (const sheet of styleSheets()) {
    const focusRules = sheet.text.match(/:focus-visible[^{]*\{[^}]*\}/g) ?? [];
    if (focusRules.length === 0) {
      // A sheet with no own control relies on the shared primitives.
      assert.doesNotMatch(sheet.text, /cursor: pointer/, sheet.name);
      continue;
    }
    for (const rule of focusRules) {
      assert.match(rule, /outline: var\(--ui-focus-ring\)/, `${sheet.name}: ${rule}`);
      assert.match(rule, /outline-offset:.*var\(--ui-focus-offset\)/, `${sheet.name}: ${rule}`);
    }
  }
});

test("the focus ring token stays 2px with a 2px offset", async () => {
  const tokens = await readFile(new URL("../app/tokens.css", import.meta.url), "utf8");
  assert.match(tokens, /--ui-focus-ring:\s*2px solid var\(--ui-accent\)/);
  assert.match(tokens, /--ui-focus-offset:\s*2px/);
  assert.match(tokens, /--ui-control-touch:\s*44px/);
});

test("every Models stylesheet raises its controls to the touch target size", () => {
  for (const sheet of interactiveStyleSheets()) {
    const touchBlocks = sheet.text.match(/@media[^{]*pointer: coarse[^{]*\{[\s\S]*?\n\}/g) ?? [];
    assert.equal(touchBlocks.length, 1, `${sheet.name} needs one touch block`);
    assert.match(touchBlocks[0], /var\(--ui-control-touch\)/, sheet.name);
  }
  assert.ok(interactiveStyleSheets().length >= 6);
});

test("reduced motion disables both Models saved-state animations", () => {
  const sheet = featureSources.find((file) => file.name === "ModelsConfig.module.css").text;

  assert.match(
    sheet,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.modalSaveBtn\[data-state="saved"\],[\s\S]*?\.savedCheckIcon\s*\{[^}]*animation:\s*none;/,
  );
});
