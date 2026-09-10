"use strict";

/**
 * In-app updates for the packaged desktop application (ADR-0006).
 *
 * The updater checks GitHub Releases on launch and every four hours,
 * downloads a newer version in the background, and never installs until the
 * user presses "Restart now". State is pushed to the renderer over one
 * channel so the sidebar card can follow it.
 */

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const STATE_CHANNEL = "omp-desktop:update-state";

function initialState(currentVersion) {
  return {
    currentVersion,
    phase: "idle",
    availableVersion: null,
    releaseNotes: null,
    percent: 0,
    error: null,
    checkedAt: null,
  };
}

/**
 * createUpdateController wires electron-updater to a state object and a
 * publish function. It is pure over its inputs so the state machine is
 * testable without Electron.
 */
function createUpdateController({
  autoUpdater,
  currentVersion,
  log = () => {},
  now = () => Date.now(),
  publish,
  setInterval: schedule = globalThis.setInterval,
}) {
  let state = initialState(currentVersion);
  let checking = false;
  let timer = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    publish(state);
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => set({ phase: "checking", error: null }));
  autoUpdater.on("update-not-available", () => {
    set({ phase: "up-to-date", availableVersion: null, checkedAt: now() });
  });
  autoUpdater.on("update-available", (info) => {
    set({
      phase: "downloading",
      availableVersion: info.version,
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
      percent: 0,
      checkedAt: now(),
    });
  });
  autoUpdater.on("download-progress", (progress) => {
    set({ phase: "downloading", percent: Math.round(progress.percent || 0) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    set({ phase: "ready", availableVersion: info.version, percent: 100 });
  });
  autoUpdater.on("error", (error) => {
    log(`[omp-desktop] update error: ${error?.message || error}`);
    set({ phase: "error", error: error?.message || String(error), checkedAt: now() });
  });

  async function check() {
    if (checking || state.phase === "downloading" || state.phase === "ready") return state;
    checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log(`[omp-desktop] update check failed: ${error?.message || error}`);
      set({ phase: "error", error: error?.message || String(error), checkedAt: now() });
    } finally {
      checking = false;
    }
    return state;
  }

  function start() {
    void check();
    timer = schedule(() => { void check(); }, CHECK_INTERVAL_MS);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function install() {
    if (state.phase !== "ready") return false;
    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  return {
    check,
    getState: () => state,
    install,
    start,
  };
}

module.exports = { CHECK_INTERVAL_MS, STATE_CHANNEL, createUpdateController, initialState };
