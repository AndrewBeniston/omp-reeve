import type { ModelEntry, ProviderEntry, Selection } from "./types";

export type ModelsTreeNodeKind = "roles" | "oauth" | "apikey" | "provider" | "model" | "add-model";

export interface ModelsTreeNode {
  id: string;
  kind: ModelsTreeNodeKind;
  level: number;
  posInSet: number;
  setSize: number;
  parentId: string | null;
  childIds: string[];
  expanded?: boolean;
  selection: Selection | null;
  providerName?: string;
}

export interface ModelsTreeInput {
  oauthProviders: readonly { id: string }[];
  apiKeyProviders: readonly { id: string }[];
  providers: readonly (readonly [string, ProviderEntry])[];
  collapsedProviders?: ReadonlySet<string>;
}

export type TreeNavigationCommand =
  | { action: "focus"; nodeId: string }
  | { action: "expand"; nodeId: string }
  | { action: "collapse"; nodeId: string };

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function rolesNodeId(): string {
  return "roles";
}

export function providerNodeId(name: string): string {
  return `provider:${encodeSegment(name)}`;
}

export function modelNodeId(providerName: string, index: number): string {
  return `model:${encodeSegment(providerName)}:${index}`;
}

export function addModelNodeId(providerName: string): string {
  return `add-model:${encodeSegment(providerName)}`;
}

export function buildModelsTree(input: ModelsTreeInput): ModelsTreeNode[] {
  const nodes: ModelsTreeNode[] = [];
  const rootIds: string[] = [];
  const collapsedProviders = input.collapsedProviders ?? new Set<string>();

  const pushRoot = (node: Omit<ModelsTreeNode, "posInSet" | "setSize">): void => {
    rootIds.push(node.id);
    nodes.push({ ...node, posInSet: rootIds.length, setSize: 0 });
  };

  pushRoot({
    id: rolesNodeId(),
    kind: "roles",
    level: 1,
    parentId: null,
    childIds: [],
    selection: { type: "roles" },
  });

  for (const provider of input.oauthProviders) {
    pushRoot({
      id: `oauth:${encodeSegment(provider.id)}`,
      kind: "oauth",
      level: 1,
      parentId: null,
      childIds: [],
      selection: { type: "oauth", providerId: provider.id },
    });
  }

  for (const provider of input.apiKeyProviders) {
    pushRoot({
      id: `apikey:${encodeSegment(provider.id)}`,
      kind: "apikey",
      level: 1,
      parentId: null,
      childIds: [],
      selection: { type: "apikey", providerId: provider.id },
    });
  }

  for (const [name, entry] of input.providers) {
    const parentId = providerNodeId(name);
    const models: ModelEntry[] = entry.models ?? [];
    const childIds = [
      ...models.map((_model, index) => modelNodeId(name, index)),
      addModelNodeId(name),
    ];
    const expanded = !collapsedProviders.has(name);

    pushRoot({
      id: parentId,
      kind: "provider",
      level: 1,
      parentId: null,
      childIds,
      expanded,
      selection: { type: "provider", name },
      providerName: name,
    });

    if (!expanded) continue;

    models.forEach((_model, index) => {
      nodes.push({
        id: modelNodeId(name, index),
        kind: "model",
        level: 2,
        posInSet: index + 1,
        setSize: childIds.length,
        parentId,
        childIds: [],
        selection: { type: "model", providerName: name, index },
        providerName: name,
      });
    });

    nodes.push({
      id: addModelNodeId(name),
      kind: "add-model",
      level: 2,
      posInSet: childIds.length,
      setSize: childIds.length,
      parentId,
      childIds: [],
      selection: null,
      providerName: name,
    });
  }

  return nodes.map((node) => (node.level === 1 ? { ...node, setSize: rootIds.length } : node));
}

export function treeNodeIdForSelection(
  nodes: readonly ModelsTreeNode[],
  selection: Selection | null,
): string | null {
  if (!selection) return null;
  const match = nodes.find((node) => node.selection !== null && sameSelection(node.selection, selection));
  return match?.id ?? null;
}

function sameSelection(left: Selection, right: Selection): boolean {
  switch (left.type) {
    case "roles":
      return right.type === "roles";
    case "provider":
      return right.type === "provider" && left.name === right.name;
    case "model":
      return right.type === "model"
        && left.providerName === right.providerName
        && left.index === right.index;
    case "oauth":
      return right.type === "oauth" && left.providerId === right.providerId;
    case "apikey":
      return right.type === "apikey" && left.providerId === right.providerId;
  }
}

export function resolveTreeNavigation(
  nodes: readonly ModelsTreeNode[],
  currentId: string | null,
  key: string,
): TreeNavigationCommand | null {
  if (nodes.length === 0) return null;
  const index = currentId === null ? -1 : nodes.findIndex((node) => node.id === currentId);

  if (index === -1) {
    if (key === "ArrowDown" || key === "Home") return focusOn(nodes[0].id);
    if (key === "ArrowUp" || key === "End") return focusOn(nodes[nodes.length - 1].id);
    return null;
  }

  const current = nodes[index];
  const isBranch = current.childIds.length > 0;
  switch (key) {
    case "ArrowDown":
      return index + 1 < nodes.length ? focusOn(nodes[index + 1].id) : null;
    case "ArrowUp":
      return index > 0 ? focusOn(nodes[index - 1].id) : null;
    case "Home":
      return focusOn(nodes[0].id);
    case "End":
      return focusOn(nodes[nodes.length - 1].id);
    case "ArrowRight":
      if (!isBranch) return null;
      if (!current.expanded) return { action: "expand", nodeId: current.id };
      return focusOn(current.childIds[0]);
    case "ArrowLeft":
      if (isBranch && current.expanded) return { action: "collapse", nodeId: current.id };
      return current.parentId === null ? null : focusOn(current.parentId);
    default:
      return null;
  }
}

function focusOn(nodeId: string): TreeNavigationCommand {
  return { action: "focus", nodeId };
}
