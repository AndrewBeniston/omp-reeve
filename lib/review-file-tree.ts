import type { ReviewFile } from "./review-files";

/**
 * The changed-file tree, and the walk across it.
 *
 * Shape and behaviour are separated on purpose: the panel draws rows, and the
 * keyboard decides which row comes next. Deciding that here keeps the decision
 * testable without a DOM, and keeps one answer for a walk a human does with
 * the pointer and one they do with the arrow keys.
 */
export interface ReviewTreeNode {
  name: string;
  path: string;
  children: ReviewTreeNode[];
  file: ReviewFile | null;
  /** True when the file at this node is untracked in Git. */
  untracked?: boolean;
}

/*
 * Built the way the reference builds its own:
 *
 *   - one node per path segment, nested under its parent folder
 *   - a folder whose only child is another folder merges with it into one
 *     chained row, "docs/adr/deep", so a deep path does not become a column of
 *     identical single-child rows
 *   - a folder row carries a disclosure chevron and an orange change dot
 *   - a file row carries its icon, its base name, and its line stat, or a
 *     green "U" when the file is untracked
 */
export function buildReviewTree(files: readonly ReviewFile[], untracked: ReadonlySet<string>): ReviewTreeNode[] {
  const roots: ReviewTreeNode[] = [];
  const byPath = new Map<string, ReviewTreeNode>();
  for (const file of files) {
    const segments = file.path.split("/");
    let parentPath = "";
    let parentList = roots;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const nodePath = parentPath ? parentPath + "/" + segment : segment;
      const isLeaf = index === segments.length - 1;
      let node = byPath.get(nodePath);
      if (!node) {
        node = { name: segment, path: nodePath, children: [], file: null };
        byPath.set(nodePath, node);
        parentList.push(node);
      }
      if (isLeaf) {
        node.file = file;
        node.untracked = untracked.has(file.path);
      }
      parentPath = nodePath;
      parentList = node.children;
    }
  }
  const chain = (nodes: ReviewTreeNode[]): ReviewTreeNode[] => nodes.map((node) => {
    node.children = chain(node.children);
    // Merge a single-child folder chain into one row, the reference's habit.
    while (!node.file && node.children.length === 1 && !node.children[0].file && node.children[0].children.length > 0) {
      const child = node.children[0];
      node.name = node.name + "/" + child.name;
      node.path = child.path;
      node.children = child.children;
    }
    return node;
  });
  return chain(roots);
}

/** One drawn row: what a pointer clicks and what an arrow key lands on. */
export interface ReviewTreeRow {
  node: ReviewTreeNode;
  path: string;
  name: string;
  kind: "folder" | "file";
  depth: number;
  /** A folder's disclosure state. Always true for a file. */
  expanded: boolean;
  parentPath: string | null;
}

/**
 * Every row on screen, in the order a human reads them.
 *
 * A collapsed folder keeps its own row and drops its children, so the walk
 * never lands on something that is not drawn.
 */
export function flattenReviewTree(nodes: readonly ReviewTreeNode[], collapsed: ReadonlySet<string>): ReviewTreeRow[] {
  const rows: ReviewTreeRow[] = [];
  const walk = (list: readonly ReviewTreeNode[], depth: number, parentPath: string | null) => {
    for (const node of list) {
      const folder = !node.file;
      const expanded = folder ? !collapsed.has(node.path) : true;
      rows.push({ node, path: node.path, name: node.name, kind: folder ? "folder" : "file", depth, expanded, parentPath });
      if (folder && expanded) walk(node.children, depth + 1, node.path);
    }
  };
  walk(nodes, 0, null);
  return rows;
}

export type ReviewTreeKeyAction =
  | { kind: "focus"; path: string }
  | { kind: "expand"; path: string }
  | { kind: "collapse"; path: string }
  | { kind: "select"; path: string }
  | { kind: "toggle-viewed"; path: string };

/**
 * What a key press means on the row that has focus.
 *
 * The map is the one recorded for Review, and it is a deliberate accessibility
 * choice rather than a copy of the reference: Up and Down move between rows,
 * Home and End reach the ends, Left collapses a folder or climbs to the
 * parent, Right expands a folder or enters its first child, Enter selects a
 * file and discloses a folder, and "v" marks the focused file viewed. Nothing
 * wraps, and nothing here traps focus: Tab still leaves the tree.
 *
 * Returning null means the key was not ours, so the caller leaves it to the
 * browser rather than swallowing it.
 */
export function reviewTreeKeyAction(rows: readonly ReviewTreeRow[], activePath: string | null, key: string): ReviewTreeKeyAction | null {
  if (!rows.length) return null;
  const index = rows.findIndex((row) => row.path === activePath);
  const walking = key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
  // A row that has gone - filtered away, or collapsed under its parent -
  // leaves the walk at the top rather than nowhere.
  if (index < 0) return walking ? { kind: "focus", path: rows[0].path } : null;
  const row = rows[index];
  switch (key) {
    case "ArrowDown":
      return index < rows.length - 1 ? { kind: "focus", path: rows[index + 1].path } : null;
    case "ArrowUp":
      return index > 0 ? { kind: "focus", path: rows[index - 1].path } : null;
    case "Home":
      return index === 0 ? null : { kind: "focus", path: rows[0].path };
    case "End":
      return index === rows.length - 1 ? null : { kind: "focus", path: rows[rows.length - 1].path };
    case "ArrowRight": {
      if (row.kind !== "folder") return null;
      if (!row.expanded) return { kind: "expand", path: row.path };
      const child = rows[index + 1];
      return child && child.parentPath === row.path ? { kind: "focus", path: child.path } : null;
    }
    case "ArrowLeft": {
      if (row.kind === "folder" && row.expanded) return { kind: "collapse", path: row.path };
      return row.parentPath ? { kind: "focus", path: row.parentPath } : null;
    }
    case "Enter":
      if (row.kind === "file") return { kind: "select", path: row.path };
      return row.expanded ? { kind: "collapse", path: row.path } : { kind: "expand", path: row.path };
    case "v":
    case "V":
      return row.kind === "file" ? { kind: "toggle-viewed", path: row.path } : null;
    default:
      return null;
  }
}
