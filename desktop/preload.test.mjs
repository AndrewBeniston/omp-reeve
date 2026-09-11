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
  assert.deepEqual(Object.keys(exposed.value), ["openExternal", "selectDirectory", "selectAttachments", "showProjectMenu", "showSessionMenu", "showApplicationMenu", "onMenuAction", "updater", "browser", "terminal"]);
  assert.deepEqual(Object.keys(exposed.value.updater), ["getState", "check", "install", "onState"]);
  assert.deepEqual(Object.keys(exposed.value.terminal), ["open", "write", "resize", "close", "onData", "onExit"]);
  assert.deepEqual(Object.keys(exposed.value.browser), ["open", "setBounds", "setVisible", "navigate", "command", "close", "onNavigated", "onTitle", "onFavicon"]);
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

test("the preload's terminal speaks only to its own Terminal", async () => {
  let exposed;
  const invocations = [];
  const listeners = [];
  const source = readFileSync(join(import.meta.dir, "preload.cjs"), "utf8");
  const electron = {
    contextBridge: { exposeInMainWorld(name, value) { exposed = { name, value }; } },
    ipcRenderer: {
      invoke(...args) { invocations.push(args); return Promise.resolve(); },
      on(channel, listener) { listeners.push({ channel, listener }); },
      removeListener(channel) { listeners.push({ channel, removed: true }); },
    },
  };

  vm.runInNewContext(source, {
    document: { documentElement: { dataset: {} } },
    Object,
    process: { platform: "darwin" },
    window: { addEventListener() {} },
    require: () => electron,
  });

  const { terminal } = exposed.value;
  await terminal.open({ cwd: "/projects/mine", cols: 100, rows: 30 });
  await terminal.write("terminal-1", "ls\r");
  await terminal.resize("terminal-1", 120, 40);
  await terminal.close("terminal-1");

  // The payloads are built inside the preload's own realm, so their prototypes
  // are not this realm's. Compare by value.
  assert.deepEqual(JSON.parse(JSON.stringify(invocations)), [
    ["omp-desktop:terminal-open", { cwd: "/projects/mine", cols: 100, rows: 30 }],
    ["omp-desktop:terminal-write", { id: "terminal-1", data: "ls\r" }],
    ["omp-desktop:terminal-resize", { id: "terminal-1", cols: 120, rows: 40 }],
    ["omp-desktop:terminal-close", { id: "terminal-1" }],
  ]);

  // Two Terminals share one channel, so each listener must ignore the other's
  // output. Without the id filter every Tab would echo every shell.
  const mine = [];
  const stop = terminal.onData("terminal-1", (data) => mine.push(data));
  const deliver = listeners.find((entry) => entry.channel === "omp-desktop:terminal-data").listener;
  deliver({}, { id: "terminal-1", data: "mine" });
  deliver({}, { id: "terminal-2", data: "someone else's" });
  assert.deepEqual(mine, ["mine"]);

  const ended = [];
  const stopExit = terminal.onExit("terminal-1", (code) => ended.push(code));
  const deliverExit = listeners.find((entry) => entry.channel === "omp-desktop:terminal-exit").listener;
  deliverExit({}, { id: "terminal-2", exitCode: 1 });
  deliverExit({}, { id: "terminal-1", exitCode: 0 });
  assert.deepEqual(ended, [0]);

  stop();
  stopExit();
  assert.equal(listeners.filter((entry) => entry.removed).length, 2);
});
