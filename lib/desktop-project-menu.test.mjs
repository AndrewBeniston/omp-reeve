import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { hasDesktopProjectMenu, showDesktopProjectMenu } = await createJiti(import.meta.url, {
  moduleCache: false,
  tryNative: false,
}).import("./desktop-project-menu.ts");

test("the desktop project menu validates bridge results", async (t) => {
  const previous = globalThis.ompDesktop;
  t.after(() => { globalThis.ompDesktop = previous; });
  const calls = [];
  globalThis.ompDesktop = {
    showProjectMenu(state) {
      calls.push(state);
      return Promise.resolve({ type: "archive-chats" });
    },
  };

  const state = { archiveEnabled: true, worktrees: [{ label: "main", current: true }] };
  assert.equal(hasDesktopProjectMenu(), true);
  assert.deepEqual(await showDesktopProjectMenu(state), { type: "archive-chats" });
  assert.deepEqual(calls, [state]);
  globalThis.ompDesktop.showProjectMenu = () => Promise.resolve({ type: "select-worktree", index: 0 });
  assert.deepEqual(await showDesktopProjectMenu(state), { type: "select-worktree", index: 0 });
  globalThis.ompDesktop.showProjectMenu = () => Promise.resolve({ type: "select-worktree", index: 4 });
  assert.equal(await showDesktopProjectMenu(state), null);
  globalThis.ompDesktop.showProjectMenu = () => Promise.resolve({ type: "delete-project" });
  assert.equal(await showDesktopProjectMenu(state), null);
});

test("the browser has no native project menu", async (t) => {
  const previous = globalThis.ompDesktop;
  t.after(() => { globalThis.ompDesktop = previous; });
  globalThis.ompDesktop = undefined;

  assert.equal(hasDesktopProjectMenu(), false);
  assert.equal(await showDesktopProjectMenu({ archiveEnabled: false, worktrees: [] }), null);
});
