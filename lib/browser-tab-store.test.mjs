import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { fromStoredBrowserTabs, toStoredBrowserTabs } = await jiti.import("./browser-tab-store.ts");

test("a round trip keeps the addresses and their order", () => {
  const open = [
    { id: "1", kind: "browser", label: "Docs", url: "https://one.example/a" },
    { id: "2", kind: "browser", label: "Issue", url: "https://two.example/b" },
    { id: "3", kind: "browser", label: "Third", url: "https://three.example/c" },
  ];

  const restored = fromStoredBrowserTabs(JSON.parse(JSON.stringify(toStoredBrowserTabs(open))));

  assert.deepEqual(restored.map((t) => t.url), [
    "https://one.example/a",
    "https://two.example/b",
    "https://three.example/c",
  ]);
});

test("a Terminal is never remembered", () => {
  const open = [
    { id: "1", kind: "browser", label: "Docs", url: "https://one.example/" },
    { id: "2", kind: "terminal", label: "Terminal", cwd: "/projects/mine" },
    { id: "3", kind: "browser", label: "Issue", url: "https://two.example/" },
  ];

  // A restored Terminal would be a dead shell wearing a live one's clothes,
  // and the human would find out by typing into it.
  const stored = toStoredBrowserTabs(open);

  assert.equal(stored.length, 2);
  assert.deepEqual(stored.map((t) => t.url), ["https://one.example/", "https://two.example/"]);
});

test("files and other kinds belong to a Session, not a Project", () => {
  const open = [
    { id: "f", kind: "file", label: "notes.md", filePath: "/notes.md" },
    { id: "s", kind: "sources", label: "Sources" },
    { id: "b", kind: "browser", label: "Docs", url: "https://one.example/" },
  ];

  assert.deepEqual(toStoredBrowserTabs(open), [{ url: "https://one.example/" }]);
});

test("a Tab that never went anywhere is not worth restoring", () => {
  const open = [
    { id: "1", kind: "browser", label: "New tab", url: "" },
    { id: "2", kind: "browser", label: "Docs", url: "https://one.example/" },
  ];

  assert.deepEqual(toStoredBrowserTabs(open), [{ url: "https://one.example/" }]);
});

test("only the address is kept, never the page's own details", () => {
  const stored = toStoredBrowserTabs([
    { id: "1", kind: "browser", label: "Yesterday's title", url: "https://one.example/", faviconUrl: "https://one.example/f.ico", titleLocked: true },
  ]);

  // The title and icon come from the page and may have changed since. Keeping
  // them would restore a snapshot of a page that no longer looks like that.
  assert.deepEqual(stored, [{ url: "https://one.example/" }]);
});

test("nothing unusable survives being read back", () => {
  // The file is on disk and can be edited or truncated by anything.
  assert.deepEqual(fromStoredBrowserTabs(null), []);
  assert.deepEqual(fromStoredBrowserTabs("nonsense"), []);
  assert.deepEqual(fromStoredBrowserTabs({}), []);
  assert.deepEqual(fromStoredBrowserTabs([1, "x", null, {}, { url: 5 }, { url: "" }]), []);
  assert.deepEqual(
    fromStoredBrowserTabs([{ url: "https://kept.example/" }, { url: "" }, { nope: true }]),
    [{ url: "https://kept.example/" }],
  );
});
