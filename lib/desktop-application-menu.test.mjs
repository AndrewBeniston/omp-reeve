import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("only a known menu action reaches the renderer", async () => {
  let deliver;
  globalThis.ompDesktop = {
    showApplicationMenu: async () => true,
    onMenuAction: (callback) => {
      deliver = callback;
      return () => {};
    },
  };

  const { subscribeApplicationMenuAction } = await jiti.import("./desktop-application-menu.ts");
  const seen = [];
  const stop = subscribeApplicationMenuAction((action) => seen.push(action));

  for (const action of [
    "new-chat",
    "toggle-sidebar",
    "open-terminal-tab",
    "open-browser-tab",
    "open-files",
    "next-tab",
    "previous-tab",
    "focus-tab-1",
    "focus-tab-9",
  ]) deliver(action);

  // The channel carries a string. A name the menu never sends is dropped here
  // rather than reaching a switch that cannot answer it.
  deliver("open-a-shell");
  deliver("");

  assert.deepEqual(seen, [
    "new-chat",
    "toggle-sidebar",
    "open-terminal-tab",
    "open-browser-tab",
    "open-files",
    "next-tab",
    "previous-tab",
    "focus-tab-1",
    "focus-tab-9",
  ]);

  stop();
  delete globalThis.ompDesktop;
});

test("only the numbered actions name a Tab position", async () => {
  const { isTabFocusAction, TAB_FOCUS_POSITIONS } = await jiti.import("./desktop-application-menu.ts");

  assert.deepEqual(Object.values(TAB_FOCUS_POSITIONS), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(isTabFocusAction("focus-tab-4"), true);
  assert.equal(isTabFocusAction("next-tab"), false);
  assert.equal(isTabFocusAction("open-browser-tab"), false);
});

test("a browser with no desktop bridge subscribes to nothing", async () => {
  delete globalThis.ompDesktop;
  const { subscribeApplicationMenuAction } = await jiti.import("./desktop-application-menu.ts", {
    cache: false,
  });
  const stop = subscribeApplicationMenuAction(() => assert.fail("no action can arrive"));
  stop();
});
