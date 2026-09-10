import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createJiti } from "jiti";

const { PANEL_ACTION_IDS, subscribeToPanelActions } = await createJiti(import.meta.url, {
  moduleCache: false,
  tryNative: false,
}).import("./desktop-panel-actions.ts");

const require = createRequire(import.meta.url);
const { PANEL_ACCELERATORS } = require("../desktop/desktop-runtime.cjs");

test("the page knows every action the desktop process can send", () => {
  assert.deepEqual(
    [...PANEL_ACTION_IDS].sort(),
    [...new Set(Object.values(PANEL_ACCELERATORS))].sort(),
  );
});

test("a matched accelerator reaches the handler", (t) => {
  const previous = globalThis.ompDesktop;
  t.after(() => { globalThis.ompDesktop = previous; });
  let send;
  let removed = false;
  globalThis.ompDesktop = {
    onPanelAction(callback) {
      send = callback;
      return () => { removed = true; };
    },
  };

  const seen = [];
  const unsubscribe = subscribeToPanelActions((action) => seen.push(action));
  send("browser");
  send("terminal");
  send("teleport");
  send(undefined);
  assert.deepEqual(seen, ["browser", "terminal"]);

  unsubscribe();
  assert.equal(removed, true);
});

test("a browser has no accelerators and unsubscribing is still safe", (t) => {
  const previous = globalThis.ompDesktop;
  t.after(() => { globalThis.ompDesktop = previous; });
  globalThis.ompDesktop = undefined;

  const unsubscribe = subscribeToPanelActions(() => {
    throw new Error("a browser must not receive a panel action");
  });
  assert.doesNotThrow(unsubscribe);
});
