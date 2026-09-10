import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

import { click, mount, press } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { ModelsSidebarTree } = await jiti.import("./ModelsSidebarTree.tsx");
const {
  addModelNodeId,
  buildModelsTree,
  modelNodeId,
  providerNodeId,
  resolveTreeNavigation,
  rolesNodeId,
} = await jiti.import("./models-tree-navigation.ts");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const activeOAuth = [{ id: "anthropic", name: "Anthropic", usesCallbackServer: true, loggedIn: true }];
const activeApiKey = [{ id: "openai", displayName: "OpenAI", configured: true, modelCount: 4 }];
const providers = [
  ["local", { models: [{ id: "qwen3", reasoning: true }, { id: "" }] }],
  ["remote", { models: [] }],
];

const nodes = buildModelsTree({
  oauthProviders: activeOAuth,
  apiKeyProviders: activeApiKey,
  providers,
});

function renderTree(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ModelsSidebarTree, {
        loading: false,
        selection: { type: "roles" },
        activeOAuth,
        activeApiKey,
        providers,
        onSelect() {},
        onAddModel() {},
        ...overrides,
      }),
    ),
  );
}

function rowTags(html) {
  return html.match(/<button[^>]*role="treeitem"[^>]*>/g) ?? [];
}

function tabbableDomId(html) {
  const tabbable = rowTags(html).filter((tag) => tag.includes('tabindex="0"'));
  assert.equal(tabbable.length, 1, "exactly one row may hold tabindex 0");
  return tabbable[0].match(/ id="([^"]+)"/)[1];
}

function nodeIdOf(domId) {
  return domId.replace(/^.*?-(?=roles$|oauth:|apikey:|provider:|model:|add-model:)/, "");
}

test("every selectable row is a native button inside one ARIA tree", () => {
  const html = renderTree();

  assert.match(html, /<div role="tree" aria-label="Models"/);
  assert.equal(rowTags(html).length, nodes.length);
  for (const tag of rowTags(html)) {
    assert.match(tag, /<button type="button"/);
    assert.match(tag, /aria-level="[12]"/);
    assert.match(tag, /aria-posinset="\d+"/);
    assert.match(tag, /aria-setsize="\d+"/);
  }
  assert.doesNotMatch(html, /migrated\d/);
});

test("a model row sits at level 2 under its provider row", () => {
  const html = renderTree();
  const providerTag = html.match(new RegExp(`<button[^>]*id="[^"]*${providerNodeId("local")}"[^>]*>`))[0];
  const modelTag = html.match(new RegExp(`<button[^>]*id="[^"]*${modelNodeId("local", 0)}"[^>]*>`))[0];

  assert.match(providerTag, /aria-level="1"/);
  assert.match(providerTag, /aria-expanded="true"/);
  assert.match(modelTag, /aria-level="2"/);
  assert.match(modelTag, /aria-setsize="3"/);
});

test("the selected row reports aria-selected and takes the roving tabindex", () => {
  const html = renderTree({ selection: { type: "model", providerName: "local", index: 1 } });

  assert.equal(nodeIdOf(tabbableDomId(html)), modelNodeId("local", 1));
  const selectedTags = rowTags(html).filter((tag) => tag.includes('aria-selected="true"'));
  assert.equal(selectedTags.length, 1);
  assert.match(selectedTags[0], new RegExp(modelNodeId("local", 1)));
});

test("without a stored selection the first row takes the roving tabindex", () => {
  const html = renderTree({ selection: null });

  assert.equal(nodeIdOf(tabbableDomId(html)), rolesNodeId());
  assert.equal(rowTags(html).filter((tag) => tag.includes('aria-selected="true"')).length, 0);
});

test("ArrowDown from the focused row reaches a row that the tree rendered", () => {
  const html = renderTree({ selection: { type: "provider", name: "local" } });
  const focused = nodeIdOf(tabbableDomId(html));
  assert.equal(focused, providerNodeId("local"));

  const next = resolveTreeNavigation(nodes, focused, "ArrowDown");
  assert.deepEqual(next, { action: "focus", nodeId: modelNodeId("local", 0) });
  assert.match(html, new RegExp(`<button[^>]*id="[^"]*${next.nodeId}"`));

  const back = resolveTreeNavigation(nodes, next.nodeId, "ArrowLeft");
  assert.deepEqual(back, { action: "focus", nodeId: focused });
});

test("End reaches the last add-model row, which the tree renders and labels", () => {
  const html = renderTree();
  const last = resolveTreeNavigation(nodes, rolesNodeId(), "End").nodeId;
  assert.equal(last, addModelNodeId("remote"));

  const lastTag = html.match(new RegExp(`<button[^>]*id="[^"]*${last}"[^>]*>`))[0];
  assert.ok(lastTag.includes('aria-label="+ Model · remote"'), lastTag);
  assert.doesNotMatch(lastTag, /aria-selected/);
});

test("a model without an id still shows a readable row", () => {
  const html = renderTree();
  assert.match(html, /new model/);
  assert.match(html, /qwen3/);
});

test("the loading state hides the provider rows and keeps the tree valid", () => {
  const html = renderTree({ loading: true });

  assert.doesNotMatch(html, /provider:local/);
  assert.equal(rowTags(html).length, 3);
  assert.match(html, /Loading/i);
});

const h = React.createElement;

async function mountTree(overrides = {}) {
  const calls = { selected: [], addedModels: [] };
  const view = await mount(h(I18nProvider, null, h(ModelsSidebarTree, {
    loading: false,
    selection: { type: "roles" },
    activeOAuth,
    activeApiKey,
    providers,
    onSelect(next) { calls.selected.push(next); },
    onAddModel(name) { calls.addedModels.push(name); },
    ...overrides,
  })));
  return { ...view, calls };
}

function rows(container) {
  return container.querySelectorAll("[role='treeitem']");
}

function rowFor(container, nodeId) {
  return rows(container).find((row) => nodeIdOf(row.getAttribute("id")) === nodeId) ?? null;
}

function tabbableRow(container) {
  const owners = rows(container).filter((row) => row.getAttribute("tabindex") === "0");
  assert.equal(owners.length, 1, "exactly one row may hold tabindex 0");
  return owners[0];
}

test("ArrowLeft collapses a provider and removes its model rows from the tree", async () => {
  const view = await mountTree({ selection: { type: "provider", name: "local" } });
  const providerRow = tabbableRow(view.container);
  assert.equal(nodeIdOf(providerRow.getAttribute("id")), providerNodeId("local"));
  assert.equal(providerRow.getAttribute("aria-expanded"), "true");

  await press(providerRow, "ArrowLeft");

  const collapsed = rowFor(view.container, providerNodeId("local"));
  assert.equal(collapsed.getAttribute("aria-expanded"), "false");
  assert.equal(rowFor(view.container, modelNodeId("local", 0)), null);
  assert.equal(rowFor(view.container, addModelNodeId("local")), null);
  await view.unmount();
});

test("a hidden model row leaves the tab order and the visible rows keep their positions", async () => {
  const view = await mountTree({ selection: { type: "provider", name: "local" } });
  const before = rows(view.container).length;

  await press(tabbableRow(view.container), "ArrowLeft");

  const after = rows(view.container);
  assert.equal(after.length, before - 3);
  for (const row of after) {
    assert.ok(["0", "-1"].includes(row.getAttribute("tabindex")), row.getAttribute("id"));
  }
  const roots = after.filter((row) => row.getAttribute("aria-level") === "1");
  assert.deepEqual(roots.map((row) => row.getAttribute("aria-posinset")), ["1", "2", "3", "4", "5"]);
  for (const root of roots) assert.equal(root.getAttribute("aria-setsize"), "5");
  await view.unmount();
});

test("ArrowRight expands a collapsed provider, then enters its first child", async () => {
  const view = await mountTree({ selection: { type: "provider", name: "local" } });
  await press(tabbableRow(view.container), "ArrowLeft");
  assert.equal(rowFor(view.container, modelNodeId("local", 0)), null);

  await press(rowFor(view.container, providerNodeId("local")), "ArrowRight");
  const reopened = rowFor(view.container, providerNodeId("local"));
  assert.equal(reopened.getAttribute("aria-expanded"), "true");
  assert.equal(nodeIdOf(tabbableRow(view.container).getAttribute("id")), providerNodeId("local"));

  await press(reopened, "ArrowRight");
  assert.equal(nodeIdOf(tabbableRow(view.container).getAttribute("id")), modelNodeId("local", 0));
  await view.unmount();
});

test("Home and End still reach the first and the last visible row after a collapse", async () => {
  const view = await mountTree({ selection: { type: "provider", name: "local" } });
  await press(tabbableRow(view.container), "ArrowLeft");

  await press(tabbableRow(view.container), "End");
  assert.equal(nodeIdOf(tabbableRow(view.container).getAttribute("id")), addModelNodeId("remote"));

  await press(tabbableRow(view.container), "Home");
  assert.equal(nodeIdOf(tabbableRow(view.container).getAttribute("id")), rolesNodeId());
  await view.unmount();
});

test("a click on a provider row still selects the provider and toggles its branch", async () => {
  const view = await mountTree();
  const providerRow = rowFor(view.container, providerNodeId("local"));

  await click(providerRow);
  assert.deepEqual(view.calls.selected.at(-1), { type: "provider", name: "local" });
  assert.equal(rowFor(view.container, providerNodeId("local")).getAttribute("aria-expanded"), "false");

  await click(rowFor(view.container, providerNodeId("local")));
  assert.equal(view.calls.selected.length, 2);
  assert.equal(rowFor(view.container, providerNodeId("local")).getAttribute("aria-expanded"), "true");
  await view.unmount();
});

test("a model row and an add-model row keep their own activation", async () => {
  const view = await mountTree();

  await click(rowFor(view.container, modelNodeId("local", 0)));
  assert.deepEqual(view.calls.selected.at(-1), { type: "model", providerName: "local", index: 0 });

  await click(rowFor(view.container, addModelNodeId("local")));
  assert.deepEqual(view.calls.addedModels, ["local"]);
  assert.equal(rowFor(view.container, providerNodeId("local")).getAttribute("aria-expanded"), "true");
  await view.unmount();
});

test("a leaf row reports no expanded state and ArrowLeft returns it to its provider", async () => {
  const view = await mountTree({ selection: { type: "model", providerName: "local", index: 1 } });
  const modelRow = tabbableRow(view.container);
  assert.equal(modelRow.getAttribute("aria-expanded"), null);

  await press(modelRow, "ArrowLeft");
  assert.equal(nodeIdOf(tabbableRow(view.container).getAttribute("id")), providerNodeId("local"));
  await view.unmount();
});
