import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { applyPageTitle, insertTabAfter, renameBrowserTab } = await jiti.import("./browser-tabs.ts");

const browser = (id, label, extra = {}) => ({ id, kind: "browser", label, url: "https://example.com/", ...extra });

test("a new Tab lands immediately after the one it came from", () => {
  const tabs = [browser("a", "A"), browser("b", "B"), browser("c", "C")];

  const next = insertTabAfter(tabs, browser("new", "New"), "a");

  assert.deepEqual(next.map((t) => t.id), ["a", "new", "b", "c"]);
});

test("a Tab with no neighbour named goes to the end, as it always did", () => {
  const tabs = [browser("a", "A"), browser("b", "B")];

  assert.deepEqual(insertTabAfter(tabs, browser("new", "New")).map((t) => t.id), ["a", "b", "new"]);
  // A neighbour that has since been closed appends rather than vanishing.
  assert.deepEqual(insertTabAfter(tabs, browser("new", "New"), "gone").map((t) => t.id), ["a", "b", "new"]);
});

test("inserting after the last Tab is still the end", () => {
  const tabs = [browser("a", "A"), browser("b", "B")];
  assert.deepEqual(insertTabAfter(tabs, browser("new", "New"), "b").map((t) => t.id), ["a", "b", "new"]);
});

test("a page names its own Tab", () => {
  const tabs = [browser("a", "New tab")];

  assert.equal(applyPageTitle(tabs, "a", "Example Domain")[0].label, "Example Domain");
});

test("a Tab the human named is not renamed by the page again", () => {
  const renamed = renameBrowserTab([browser("a", "New tab")], "a", "Docs");
  assert.equal(renamed[0].label, "Docs");
  assert.equal(renamed[0].titleLocked, true);

  // This is the whole point of the rename. Navigating announces a new title,
  // and the Tab must keep the name it was given.
  const afterNavigating = applyPageTitle(renamed, "a", "Some Other Page");
  assert.equal(afterNavigating[0].label, "Docs");

  // And again, because a page can announce a title more than once.
  assert.equal(applyPageTitle(afterNavigating, "a", "Third Title")[0].label, "Docs");
});

test("renaming one Tab leaves its neighbours alone", () => {
  const tabs = [browser("a", "A"), browser("b", "B")];

  const next = renameBrowserTab(tabs, "a", "Renamed");

  assert.equal(next[1].label, "B");
  assert.equal(next[1].titleLocked, undefined);
  assert.equal(applyPageTitle(next, "b", "B Page")[1].label, "B Page");
});

test("a title only reaches a Browser tab", () => {
  const tabs = [{ id: "f", kind: "file", label: "notes.md", filePath: "/notes.md" }];
  assert.deepEqual(applyPageTitle(tabs, "f", "Hijacked"), tabs);
});
