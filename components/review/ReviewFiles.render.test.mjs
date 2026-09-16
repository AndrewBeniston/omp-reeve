import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ReviewFiles } = await jiti.import("./ReviewFiles.tsx");

const hunk = (path) => "diff --git a/" + path + " b/" + path + "\n--- a/" + path + "\n+++ b/" + path + "\n@@ -1,1 +1,2 @@\n line\n+added\n";
const PATHS = ["lib/a.ts", "lib/b.ts", "README.md"];
const PATCH = PATHS.map(hunk).join("");
const REVISIONS = Object.fromEntries(PATHS.map((path) => [path, "rev-1"]));

const render = (props = {}) => renderToStaticMarkup(React.createElement(ReviewFiles, {
  context: { tabId: "tab", owner: { projectRoot: "/repo", worktreePath: "/repo", sessionId: null } },
  scope: { kind: "uncommitted" },
  patch: PATCH,
  repositoryRoot: "/repo",
  reviewCwd: "/repo",
  onOpenFile() {},
  wrapLines: false,
  diffMode: "unified",
  onToggleWrap() {},
  fileRevisions: REVISIONS,
  fileView: { filter: "", showFiles: true, selectedPath: "lib/b.ts" },
  onFileViewChange() {},
  fileOperations: [],
  hunkOperations: [],
  operationBusy: false,
  onOperate() {},
  comments: [],
  canAddToChat: false,
  onSaveComment() {},
  onRemoveComment() {},
  onAddCommentToChat() {},
  ...props,
}));

const treeRows = (markup) => [...markup.matchAll(/role="treeitem"[^>]*/g)].map((match) => match[0]);
const sections = (markup) => [...markup.matchAll(/<section aria-label="([^"]+)"/g)].map((match) => match[1]);

test("the tree is a tree, with one stop on the Tab key", () => {
  const markup = render();
  assert.match(markup, /role="tree"/);
  const rows = treeRows(markup);
  // One folder row for lib, two files under it, and README.md at the root.
  assert.equal(rows.length, 4);
  assert.equal(rows.filter((row) => row.includes('tabindex="0"')).length, 1);
  // The selected file is the row a walk starts from.
  assert.equal(rows.filter((row) => row.includes('aria-selected="true"')).length, 1);
  assert.match(markup, /aria-expanded="true"/);
});

test("filtering narrows the tree and leaves the diffs where they were", () => {
  const unfiltered = render();
  const filtered = render({ fileView: { filter: "a.ts", showFiles: true, selectedPath: "lib/b.ts" } });
  assert.deepEqual(sections(unfiltered), PATHS);
  // The diffs are the same diffs, in the same order: nothing to scroll away.
  assert.deepEqual(sections(filtered), PATHS);
  assert.equal(treeRows(filtered).length, 2);
});

test("a viewed file says so and folds its diff away, and a changed one does not", () => {
  const viewed = render({ viewedRevisions: { "lib/b.ts": "rev-1" }, onViewedChange() {} });
  assert.match(viewed, /aria-label="Viewed"/);
  assert.match(viewed, /Mark as unviewed/);
  // The file changed underneath the mark, so it is unviewed again.
  const stale = render({ viewedRevisions: { "lib/b.ts": "rev-0" }, onViewedChange() {} });
  assert.doesNotMatch(stale, /aria-label="Viewed"/);
  assert.doesNotMatch(stale, /Mark as unviewed/);
});

test("with the file list hidden, the walk is still two steps and a place in the change", () => {
  const hidden = render({ fileView: { filter: "", showFiles: false, selectedPath: "lib/b.ts" } });
  assert.match(hidden, /Previous file/);
  assert.match(hidden, /Next file/);
  assert.match(hidden.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "), / 2 of 3 /);
  assert.doesNotMatch(hidden, /role="tree"/);
  // The list on screen is the walk, so the steps are not drawn twice.
  assert.doesNotMatch(render(), /Next file/);
});

/*
 * The keeper draws nothing, and this harness renders on the server, so no
 * effect in it runs here. These two say the only things a server render can
 * say: the list still renders with the keeper in it, and the markup is the
 * markup it was before. Its restore and its write are not proven by this file.
 */
test("the scroll keeper changes nothing a reader sees", () => {
  const without = render();
  const with_ = render({
    ownerKey: "session-a::/repo",
    fileView: { filter: "", showFiles: true, selectedPath: "lib/b.ts", scrollAnchor: { owner: "session-a::/repo", path: "lib/b.ts", offset: 120 } },
  });
  assert.equal(with_, without);
});

test("the pull-request reading renders without an owner", () => {
  const markup = render({ ownerKey: undefined });
  assert.deepEqual(sections(markup), PATHS);
});
