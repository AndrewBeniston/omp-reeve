/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.ompDesktop = process.platform;
}, { once: true });

contextBridge.exposeInMainWorld(
  "ompDesktop",
  Object.freeze({
    openExternal(url) {
      return ipcRenderer.invoke("omp-desktop:open-external", url);
    },
    selectDirectory() {
      return ipcRenderer.invoke("omp-desktop:select-directory");
    },
    selectAttachments() {
      return ipcRenderer.invoke("omp-desktop:select-attachments");
    },
    showProjectMenu(state) {
      return ipcRenderer.invoke("omp-desktop:show-project-menu", state);
    },
    showSessionMenu(state) {
      return ipcRenderer.invoke("omp-desktop:show-session-menu", state);
    },
    updater: Object.freeze({
      getState() {
        return ipcRenderer.invoke("omp-desktop:update-get-state");
      },
      check() {
        return ipcRenderer.invoke("omp-desktop:update-check");
      },
      install() {
        return ipcRenderer.invoke("omp-desktop:update-install");
      },
      onState(callback) {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on("omp-desktop:update-state", listener);
        return () => ipcRenderer.removeListener("omp-desktop:update-state", listener);
      },
    }),
    /**
     * The Terminal tab.
     *
     * The renderer asks for a shell in a directory and is answered with an id
     * or a refusal. It cannot name the id itself, and the main process checks
     * the Project's trust and this window's ownership on every call, so nothing
     * here is a permission — it is a request.
     */
    terminal: Object.freeze({
      open(request) {
        return ipcRenderer.invoke("omp-desktop:terminal-open", request);
      },
      write(id, data) {
        return ipcRenderer.invoke("omp-desktop:terminal-write", { id, data });
      },
      resize(id, cols, rows) {
        return ipcRenderer.invoke("omp-desktop:terminal-resize", { id, cols, rows });
      },
      close(id) {
        return ipcRenderer.invoke("omp-desktop:terminal-close", { id });
      },
      /** Output for one Terminal. Returns the function that stops listening. */
      onData(id, callback) {
        const listener = (_event, payload) => {
          if (payload?.id === id) callback(payload.data);
        };
        ipcRenderer.on("omp-desktop:terminal-data", listener);
        return () => ipcRenderer.removeListener("omp-desktop:terminal-data", listener);
      },
      /** The shell ended, by its own exit or because the Tab closed. */
      onExit(id, callback) {
        const listener = (_event, payload) => {
          if (payload?.id === id) callback(payload.exitCode);
        };
        ipcRenderer.on("omp-desktop:terminal-exit", listener);
        return () => ipcRenderer.removeListener("omp-desktop:terminal-exit", listener);
      },
    }),
  }),
);
