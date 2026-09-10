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
  }),
);
