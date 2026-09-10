import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  buildModelsTree,
  resolveTreeNavigation,
  treeNodeIdForSelection,
} = await jiti.import("./models-tree-navigation.ts");

const treeInput = {
  oauthProviders: [{ id: "anthropic" }],
  apiKeyProviders: [{ id: "openai" }],
  providers: [
    ["local", { models: [{ id: "a" }, { id: "b" }] }],
    ["remote", { models: [] }],
  ],
};

const tree = buildModelsTree(treeInput);

function focusTarget(command) {
  return command !== null && command.action === "focus" ? command.nodeId : null;
}

const ids = tree.map((node) => node.id);
const [
  rolesId,
  oauthId,
  apiKeyId,
  localId,
  localModelAId,
  localModelBId,
  localAddId,
  remoteId,
  remoteAddId,
] = ids;

test("the tree flattens roles, managed providers, custom providers, and add-model actions in render order", () => {
  assert.deepEqual(tree.map((node) => node.kind), [
    "roles",
    "oauth",
    "apikey",
    "provider",
    "model",
    "model",
    "add-model",
    "provider",
    "add-model",
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test("a provider name that contains a separator keeps a unique node id", () => {
  const collidable = buildModelsTree({
    oauthProviders: [],
    apiKeyProviders: [],
    providers: [
      ["a:0", { models: [] }],
      ["a", { models: [{ id: "zero" }] }],
    ],
  });

  const collidableIds = collidable.map((node) => node.id);
  assert.equal(new Set(collidableIds).size, collidableIds.length);
});

test("models sit one level below their provider and count their own set", () => {
  assert.deepEqual(tree.map((node) => node.level), [1, 1, 1, 1, 2, 2, 2, 1, 2]);
  assert.equal(tree[0].setSize, 5);
  assert.equal(tree[0].posInSet, 1);
  assert.equal(tree[4].setSize, 3);
  assert.equal(tree[4].posInSet, 1);
  assert.equal(tree[6].posInSet, 3);
  assert.equal(tree[8].setSize, 1);
});

test("a provider node owns its models and reports the expanded state", () => {
  assert.deepEqual(tree[3].childIds, [localModelAId, localModelBId, localAddId]);
  assert.equal(tree[3].expanded, true);
  assert.equal(tree[0].expanded, undefined);
  assert.equal(tree[4].parentId, localId);
});

test("ArrowDown and ArrowUp walk every row, including nested models", () => {
  assert.equal(focusTarget(resolveTreeNavigation(tree, rolesId, "ArrowDown")), oauthId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, oauthId, "ArrowDown")), apiKeyId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, localId, "ArrowDown")), localModelAId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, localAddId, "ArrowDown")), remoteId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, remoteId, "ArrowUp")), localAddId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, localModelAId, "ArrowUp")), localId);
});

test("ArrowDown stops at the last row and ArrowUp stops at the first row", () => {
  assert.equal(resolveTreeNavigation(tree, remoteAddId, "ArrowDown"), null);
  assert.equal(resolveTreeNavigation(tree, rolesId, "ArrowUp"), null);
});

test("ArrowRight enters an expanded provider and ArrowLeft returns to it", () => {
  assert.equal(focusTarget(resolveTreeNavigation(tree, localId, "ArrowRight")), localModelAId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, localModelBId, "ArrowLeft")), localId);
  assert.equal(resolveTreeNavigation(tree, localModelBId, "ArrowRight"), null);
  assert.equal(resolveTreeNavigation(tree, rolesId, "ArrowLeft"), null);
});

test("ArrowRight on a provider without models moves to its add-model action", () => {
  assert.equal(focusTarget(resolveTreeNavigation(tree, remoteId, "ArrowRight")), remoteAddId);
});

test("Home and End jump to the first and last row", () => {
  assert.equal(focusTarget(resolveTreeNavigation(tree, localModelBId, "Home")), rolesId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, localModelBId, "End")), remoteAddId);
});

test("ArrowLeft collapses an expanded provider before it leaves the row", () => {
  assert.deepEqual(
    resolveTreeNavigation(tree, localId, "ArrowLeft"),
    { action: "collapse", nodeId: localId },
  );
});

test("Enter and Space stay with the native button activation", () => {
  assert.equal(resolveTreeNavigation(tree, localId, "Enter"), null);
  assert.equal(resolveTreeNavigation(tree, localId, " "), null);
  assert.equal(resolveTreeNavigation(tree, localId, "Tab"), null);
});

test("an unknown focus point falls back to the first or last row", () => {
  assert.equal(focusTarget(resolveTreeNavigation(tree, null, "ArrowDown")), rolesId);
  assert.equal(focusTarget(resolveTreeNavigation(tree, "gone", "ArrowUp")), remoteAddId);
  assert.equal(resolveTreeNavigation([], null, "ArrowDown"), null);
});

test("every selection resolves to the row that carries it", () => {
  assert.equal(treeNodeIdForSelection(tree, { type: "roles" }), rolesId);
  assert.equal(treeNodeIdForSelection(tree, { type: "oauth", providerId: "anthropic" }), oauthId);
  assert.equal(treeNodeIdForSelection(tree, { type: "apikey", providerId: "openai" }), apiKeyId);
  assert.equal(treeNodeIdForSelection(tree, { type: "provider", name: "local" }), localId);
  assert.equal(treeNodeIdForSelection(tree, { type: "model", providerName: "local", index: 1 }), localModelBId);
  assert.equal(treeNodeIdForSelection(tree, { type: "model", providerName: "local", index: 9 }), null);
  assert.equal(treeNodeIdForSelection(tree, null), null);
});

test("an add-model row carries an action instead of a selection", () => {
  assert.equal(tree[6].selection, null);
  assert.equal(tree[6].providerName, "local");
  assert.deepEqual(tree[4].selection, { type: "model", providerName: "local", index: 0 });
});

const collapsedTree = buildModelsTree({ ...treeInput, collapsedProviders: new Set(["local"]) });

test("a collapsed provider hides its model rows and its add-model row", () => {
  assert.deepEqual(collapsedTree.map((node) => node.kind), [
    "roles",
    "oauth",
    "apikey",
    "provider",
    "provider",
    "add-model",
  ]);
  assert.equal(collapsedTree[3].id, localId);
  assert.equal(collapsedTree[3].expanded, false);
});

test("a collapsed provider still owns its children and keeps the root set count", () => {
  assert.deepEqual(collapsedTree[3].childIds, [localModelAId, localModelBId, localAddId]);
  for (const node of collapsedTree.filter((entry) => entry.level === 1)) {
    assert.equal(node.setSize, 5, node.id);
  }
  assert.deepEqual(collapsedTree.map((node) => node.posInSet), [1, 2, 3, 4, 5, 1]);
  assert.equal(collapsedTree[5].setSize, 1);
});

test("ArrowRight expands a collapsed provider instead of moving focus", () => {
  assert.deepEqual(
    resolveTreeNavigation(collapsedTree, localId, "ArrowRight"),
    { action: "expand", nodeId: localId },
  );
});

test("ArrowLeft on a collapsed root provider moves no focus", () => {
  assert.equal(resolveTreeNavigation(collapsedTree, localId, "ArrowLeft"), null);
});

test("ArrowDown skips the hidden model rows of a collapsed provider", () => {
  assert.equal(focusTarget(resolveTreeNavigation(collapsedTree, localId, "ArrowDown")), remoteId);
  assert.equal(focusTarget(resolveTreeNavigation(collapsedTree, remoteId, "ArrowUp")), localId);
  assert.equal(focusTarget(resolveTreeNavigation(collapsedTree, rolesId, "End")), remoteAddId);
});

test("a selection inside a collapsed provider resolves to no visible row", () => {
  assert.equal(treeNodeIdForSelection(collapsedTree, { type: "model", providerName: "local", index: 0 }), null);
  assert.equal(treeNodeIdForSelection(collapsedTree, { type: "provider", name: "local" }), localId);
});
