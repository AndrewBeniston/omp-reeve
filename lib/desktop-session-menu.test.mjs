import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { hasDesktopSessionMenu, showDesktopSessionMenu } = await createJiti(import.meta.url, {
  moduleCache: false,
  tryNative: false,
}).import("./desktop-session-menu.ts");

test("the desktop session menu validates bridge results", async (t) => {
  const previous = globalThis.ompDesktop;
  t.after(() => { globalThis.ompDesktop = previous; });
  const calls = [];
  globalThis.ompDesktop = {
    showSessionMenu(state) {
      calls.push(state);
      return Promise.resolve("toggle-pin");
    },
  };

  assert.equal(hasDesktopSessionMenu(), true);
  assert.equal(await showDesktopSessionMenu({ pinned: false, unread: true }), "toggle-pin");
  assert.deepEqual(calls, [{ pinned: false, unread: true }]);
  globalThis.ompDesktop.showSessionMenu = () => Promise.resolve("delete");
  assert.equal(await showDesktopSessionMenu({ pinned: false, unread: false }), null);
});

test("the browser has no native session menu", async (t) => {
  const previous = globalThis.ompDesktop;
  t.after(() => { globalThis.ompDesktop = previous; });
  globalThis.ompDesktop = undefined;

  assert.equal(hasDesktopSessionMenu(), false);
  assert.equal(await showDesktopSessionMenu({ pinned: false, unread: false }), null);
});
