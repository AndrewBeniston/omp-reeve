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
  ]);

  stop();
  delete globalThis.ompDesktop;
});

test("a browser with no desktop bridge subscribes to nothing", async () => {
  delete globalThis.ompDesktop;
  const { subscribeApplicationMenuAction } = await jiti.import("./desktop-application-menu.ts", {
    cache: false,
  });
  const stop = subscribeApplicationMenuAction(() => assert.fail("no action can arrive"));
  stop();
});
