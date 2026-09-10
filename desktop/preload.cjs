/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.ompDesktop = process.platform;
  // Which side owns the menu. macOS has a system menu bar, so the renderer
  // draws none. Windows and Linux have no such bar, so the renderer draws
  // File, Edit, View and Help itself. Every component reads this attribute
  // rather than the platform name. ADR-0008.
  document.documentElement.dataset.ompMenu =
    process.platform === "darwin" ? "native" : "application-menu";
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
    showApplicationMenu(state) {
      return ipcRenderer.invoke("omp-desktop:show-application-menu", state);
    },
    onMenuAction(callback) {
      const listener = (_event, action) => callback(action);
      ipcRenderer.on("omp-desktop:menu-action", listener);
      return () => ipcRenderer.removeListener("omp-desktop:menu-action", listener);
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
  }),
);
