import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

test("the preload exposes only the protected external-link command", async () => {
  let exposed;
  let onDomReady;
  const invocations = [];
  const listeners = [];
  const document = { documentElement: { dataset: {} } };
  const source = readFileSync(join(import.meta.dir, "preload.cjs"), "utf8");
  const electron = {
    contextBridge: {
      exposeInMainWorld(name, value) {
        exposed = { name, value };
      },
    },
    ipcRenderer: {
      invoke(...args) {
        invocations.push(args);
        return Promise.resolve();
      },
      on(channel, listener) { listeners.push(["on", channel, listener]); },
      removeListener(channel, listener) { listeners.push(["off", channel, listener]); },
    },
  };

  vm.runInNewContext(source, {
    document,
    Object,
    process: { platform: "darwin" },
    window: {
      addEventListener(name, callback, options) {
        assert.equal(name, "DOMContentLoaded");
        assert.equal(options.once, true);
        onDomReady = callback;
      },
    },
    require(name) {
      assert.equal(name, "electron");
      return electron;
    },
  });

  assert.equal(exposed.name, "ompDesktop");
  onDomReady();
  assert.equal(document.documentElement.dataset.ompDesktop, "darwin");
  assert.equal(document.documentElement.dataset.ompMenu, "native");
  assert.deepEqual(Object.keys(exposed.value), ["openExternal", "selectDirectory", "selectAttachments", "showProjectMenu", "showSessionMenu", "showApplicationMenu", "onMenuAction", "updater"]);
  assert.deepEqual(Object.keys(exposed.value.updater), ["getState", "check", "install", "onState"]);
  await exposed.value.openExternal("https://example.com/login");
  await exposed.value.selectDirectory();
  await exposed.value.selectAttachments();
  await exposed.value.showProjectMenu({ archiveEnabled: true, worktrees: [] });
  await exposed.value.showSessionMenu({ pinned: false, unread: true });
  await exposed.value.showApplicationMenu({ id: "file", x: 8, y: 36 });
  await exposed.value.updater.getState();
  await exposed.value.updater.check();
  await exposed.value.updater.install();
  const seen = [];
  const unsubscribe = exposed.value.updater.onState((state) => seen.push(state));
  listeners[0][2]({}, { phase: "ready" });
  unsubscribe();
  assert.deepEqual(seen, [{ phase: "ready" }]);
  const menuActions = [];
  const unsubscribeMenu = exposed.value.onMenuAction((action) => menuActions.push(action));
  listeners[2][2]({}, "toggle-sidebar");
  unsubscribeMenu();
  assert.deepEqual(menuActions, ["toggle-sidebar"]);
  assert.deepEqual(listeners.map(([kind, channel]) => [kind, channel]), [
    ["on", "omp-desktop:update-state"],
    ["off", "omp-desktop:update-state"],
    ["on", "omp-desktop:menu-action"],
    ["off", "omp-desktop:menu-action"],
  ]);
  assert.deepEqual(invocations, [
    ["omp-desktop:open-external", "https://example.com/login"],
    ["omp-desktop:select-directory"],
    ["omp-desktop:select-attachments"],
    ["omp-desktop:show-project-menu", { archiveEnabled: true, worktrees: [] }],
    ["omp-desktop:show-session-menu", { pinned: false, unread: true }],
    ["omp-desktop:show-application-menu", { id: "file", x: 8, y: 36 }],
    ["omp-desktop:update-get-state"],
    ["omp-desktop:update-check"],
    ["omp-desktop:update-install"],
  ]);
});
