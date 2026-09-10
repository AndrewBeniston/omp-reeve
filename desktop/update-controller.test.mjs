import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { CHECK_INTERVAL_MS, createUpdateController } = require("./update-controller.cjs");

function fakeUpdater() {
  const handlers = {};
  return {
    handlers,
    calls: [],
    on(name, handler) { handlers[name] = handler; },
    emit(name, payload) { handlers[name]?.(payload); },
    async checkForUpdates() { this.calls.push("check"); },
    quitAndInstall(...args) { this.calls.push(["install", ...args]); },
  };
}

function harness() {
  const autoUpdater = fakeUpdater();
  const published = [];
  const scheduled = [];
  const controller = createUpdateController({
    autoUpdater,
    currentVersion: "0.5.0",
    now: () => 1000,
    publish: (state) => published.push(state),
    setInterval: (fn, ms) => { scheduled.push({ fn, ms }); return { unref() {} }; },
  });
  return { autoUpdater, controller, published, scheduled };
}

test("the controller configures background download without automatic install", () => {
  const { autoUpdater } = harness();
  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  assert.equal(autoUpdater.allowPrerelease, false);
});

test("start checks once and schedules a four-hour recheck", async () => {
  const { autoUpdater, controller, scheduled } = harness();
  controller.start();
  await Promise.resolve();
  assert.deepEqual(autoUpdater.calls, ["check"]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, CHECK_INTERVAL_MS);
  assert.equal(CHECK_INTERVAL_MS, 4 * 60 * 60 * 1000);
});

test("the state walks idle, checking, downloading, ready and publishes each step", () => {
  const { autoUpdater, controller, published } = harness();
  assert.equal(controller.getState().phase, "idle");
  autoUpdater.emit("checking-for-update");
  autoUpdater.emit("update-available", { version: "0.5.1", releaseNotes: "Fixes" });
  autoUpdater.emit("download-progress", { percent: 42.6 });
  autoUpdater.emit("update-downloaded", { version: "0.5.1" });
  assert.deepEqual(published.map((state) => state.phase), ["checking", "downloading", "downloading", "ready"]);
  const final = controller.getState();
  assert.equal(final.availableVersion, "0.5.1");
  assert.equal(final.releaseNotes, "Fixes");
  assert.equal(final.percent, 100);
  assert.equal(final.currentVersion, "0.5.0");
});

test("install runs only once an update is ready", () => {
  const { autoUpdater, controller } = harness();
  assert.equal(controller.install(), false);
  autoUpdater.emit("update-downloaded", { version: "0.5.1" });
  assert.equal(controller.install(), true);
  assert.deepEqual(autoUpdater.calls, [["install", false, true]]);
});

test("a check is skipped while a download is in flight", async () => {
  const { autoUpdater, controller } = harness();
  autoUpdater.emit("update-available", { version: "0.5.1" });
  await controller.check();
  assert.deepEqual(autoUpdater.calls, []);
});

test("errors are recorded and do not throw", async () => {
  const { autoUpdater, controller } = harness();
  autoUpdater.checkForUpdates = async () => { throw new Error("offline"); };
  const state = await controller.check();
  assert.equal(state.phase, "error");
  assert.equal(state.error, "offline");
  assert.equal(state.checkedAt, 1000);
});
