/* eslint-disable @typescript-eslint/no-require-imports */
const { closeSync, openSync, writeSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell } = require("electron");
const {
  DESKTOP_PORT,
  DESKTOP_CHALLENGE_HEADER,
  createExternalLinkHandler,
  createProjectMenuTemplate,
  createSessionMenuTemplate,
  createServerCommand,
  isExternalUrlAllowed,
  isExpectedServerResponse,
  isNavigationAllowed,
  isTrustedRendererUrl,
  prepareWritableNext,
} = require("./desktop-runtime.cjs");
const { STATE_CHANNEL: UPDATE_STATE_CHANNEL, createUpdateController } = require("./update-controller.cjs");

const DEFAULT_DEV_URL = "http://127.0.0.1:30141";
const LOG_PATH = path.join(os.tmpdir(), "omp-desktop.log");
const SERVER_READY_TIMEOUT_MS = 60_000;
let mainWindow;
let serverProcess;
let desktopUrl;
let updateController = null;
let shuttingDown = false;

function createMenuIcon(png) {
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${png}`).resize({ width: 16, height: 16 });
  image.setTemplateImage(true);
  return image;
}

const menuIcons = {
  archive: createMenuIcon("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAxUlEQVR4nO2WMQ7CMAxF31zUA8FSzlCJob0jDD1LVSkDS5l6hSygSBnCEJrQhADykyx1cOzv2m4DgvBMB0zANZNNNoeXEbhnNpPDi7JOOkP12sZWIQIU6VE/JUCXasFYegg7YHaclwSVL068eW0NDb1zwDxvJTpe/80CaqAFTh5rrU82AUPAkA1/LaAu3YJ3EAG9tAAZQuK26ugcOL/Y+VC7OPGaEAE74JbhHmB+xVXox+OQWIRJvieSyr6yrS1oYioX+DQPIvQwbGqqPCIAAAAASUVORK5CYII="),
  pin: createMenuIcon("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABSUlEQVR4nO2VPUsDQRCGH1Erk0pttBH/QIpgEZtYa2cnIgiCIb2NhahgLWm1tddgL4KtXbBVVLAQRQKm8utkYYph2YtF9gPhXhhYbod5H3aGGyj0TzQMLAHTqQB2gQx4BaopAPYEwEQXmI8NMAqcKYh3oJYCoq0gXoBKbIgtBZAE4toCMPEWazBngB8xvbBmIvhLlIArZbjhGMxgECXL/A4oy11wiDHgUhk8ALNWjoE4DTUTbVX4XubApWAvcauKngBDfXKDQNSBnip69AeEadmNBTE1KMSCBbHpyJkAjqX/9n9i0TdAD9hW95NAx2H8CBwAIz5bkKnYd5g/AYeyqPq1amDzTOJZnTsC5EX1HPNPoAV8WN+jmH8BK5KzrCC8mtdyzL+BNQfoDjCOR53nmK8TSatq5WZyNpsvqppibKJBIs1JFCpEaP0CVHSiNQXBiZEAAAAASUVORK5CYII="),
  remove: createMenuIcon("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAAl0lEQVR4nO2WQQ6AIAwE91F9kj0Q/f9N8YIJIUqgthBjN+G47ARoKeByueqitKb4CcCRVhD4Q+anNwBRABEKr/gUFgB7ttHW4OHCs0rDJRDq4T0QZuEtEObhNYhh4U8vXFopahBxdDiKY+8p0e9fAd88OEmzUgu/ZA7BDaVmBsEdda4OwYImowZBs79jmj2QTB/JXK5/6ATv6X1TjYvwRgAAAABJRU5ErkJggg=="),
  rename: createMenuIcon("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAA5klEQVR4nO3WPy5FQRTH8Y9CKcIK/GkoFXZCtJpX3CgkQiVeYgP2QKXUaaxBo7QHClqXTDKSkxciD/cozDeZ4s5J7vfMLzOToTEMqxjjAidYkcgunvEaRvneyZB36CfksYnlLHmPQyzgNDRxnCXvQm0xNHCeLS8cDZlA94U81p+w9Ffyvp6OX2OEl/DzvSnrTf4tRi12bcMlHrWNKS+ZyfqPGYf7+yBbXriughLxvKTY35nBQ5Xc1blZ7GesvLAe4r/FJR7D3KDywvYnT6oUeWHrA/E9zrApgTlc4aa+ZtYypI3G/+UNm6ahdrIxmGgAAAAASUVORK5CYII="),
  unread: createMenuIcon("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABWklEQVR4nO2WP0sDQRDFf2gXyHWejZ1NPkOapNE2YKs2FrZ2d+BZ2ClptbVIb5NvYmdrvoAWQiJoogzMwbBuLsnlYiTsg4Fj7715c/tn9iAgIKAcdoEWcKQhzzErxh5wATwB31PiGbgG9qs0joEHYFJg7MZENTvLmp8Ar07yIfAIpMCZRqpjQ4cr2uMyxttA10n2omZRgS5SzsDRdjXnXNgCekY8Bm6AmsesreEWVVPN2OTpae6ZuDeid6DjKVCm/MPw5DnxGHQ0R867m2V+7pg3PZykYPPJOxdNpwjx8KIBjJT0CRx4OJH5ckmaaeQGoq97dIfAl+GI1y/0TZUyxT60DefSjGdmXJqSD6nh9KsoIDPjV1UU0JhzCUarWoK1b8JFjmFiZiL/qkqO4SKNqK7r3fJMu3Bvyzaiaa148Fet2OIUeFvyMpILbW3Xccwm/JD8m1+ygIDNxA/NYtcntIwegAAAAABJRU5ErkJggg=="),
  worktrees: createMenuIcon("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABRUlEQVR4nO2WMU7DMBSGvxVGMlLnFKxwAjyyeGKnvRU0F+hButDOUA7AwFyQJVt6skLi2s9ISH3Sk6I4yv/bfxx/UF8dMADfSW8Ao/D+WfH3EfHYB+CKhjUIsVfgCVgCW3F/XSNwE3qseuAoxC/EmL/ehTH/zKJU/Bh6zIQVs/QzT2spxu9LDDjxAldgYNXagBERbJMILoF9bQRuxgBhq8Vn9mHWKyHu+6VEPNeAX4WPiW34VrMNXYaB+C9Yizjisj/X/gNcpoFYi/Cx+b6uES41oF7ubIBzBPyfj7APZ4PVhBCXYaApDdmZ0645DZmJ0+5PaKgXVCNPuwfgUZj7Am41aaj7JdepTqmpmIa6mVxzDRTT0JCR6y6J4BO406Ch/kTKVacheyLlqtOQLaBcVRoyFZSrRkOblpSbU6Yl5eZWM8odqx+lVgIS/YDo2QAAAABJRU5ErkJggg=="),
};

function appendDesktopLog(message) {
  const line = `${new Date().toISOString()} ${message}${os.EOL}`;
  const descriptor = openSync(LOG_PATH, "a");
  try {
    writeSync(descriptor, line);
  } finally {
    closeSync(descriptor);
  }
}

function requestHttpResponse(url, timeoutMs, challenge) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, {
      headers: { [DESKTOP_CHALLENGE_HEADER]: challenge },
    }, (response) => {
      response.resume();
      resolve(response);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("The HTTP readiness request timed out."));
    });
    request.once("error", reject);
  });
}

async function waitForHttpResponse(url, launchToken) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  const challenge = randomUUID();
  let lastError = new Error("The server did not answer an HTTP request.");

  while (Date.now() < deadline) {
    try {
      const response = await requestHttpResponse(
        url,
        Math.min(2_000, deadline - Date.now()),
        challenge,
      );
      if (isExpectedServerResponse(response, launchToken, challenge)) return;
      lastError = new Error("The HTTP response did not come from the bundled server.");
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`The bundled server did not respond within 60 seconds: ${lastError.message}`);
}

function terminateServerTree() {
  const child = serverProcess;
  serverProcess = undefined;
  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") appendDesktopLog(`[omp-desktop] server termination failed: ${error.message}`);
  }
}

function startBundledServer(port, launchToken) {
  const writableNext = prepareWritableNext({
    platform: process.platform,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
    version: app.getVersion(),
  });
  const command = createServerCommand({
    arch: process.arch,
    homePath: app.getPath("home"),
    launchToken,
    platform: process.platform,
    port,
    resourcesPath: process.resourcesPath,
    writableDistDir: writableNext.distDir,
  });
  const logDescriptor = openSync(LOG_PATH, "a");

  try {
    serverProcess = spawn(command.executable, command.args, {
      cwd: command.cwd,
      detached: process.platform !== "win32",
      env: command.env,
      stdio: ["ignore", logDescriptor, logDescriptor],
      windowsHide: true,
    });
  } finally {
    closeSync(logDescriptor);
  }

  const child = serverProcess;
  child.once("error", (error) => {
    appendDesktopLog(`[omp-desktop] bundled server error: ${error.message}`);
  });
  child.once("exit", (code, signal) => {
    appendDesktopLog(`[omp-desktop] bundled server exited with code ${code} and signal ${signal}.`);
    if (serverProcess === child) serverProcess = undefined;
    if (!shuttingDown) app.exit(code || 1);
  });

  appendDesktopLog(`[omp-desktop] bundled server starting on http://127.0.0.1:${port}`);
}

function createMainWindow() {
  const windowOptions = {
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  };
  if (process.platform === "darwin") {
    windowOptions.titleBarStyle = "hiddenInset";
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
    windowOptions.vibrancy = "menu";
    windowOptions.acceptFirstMouse = true;
  }

  const window = new BrowserWindow(windowOptions);
  const guardNavigation = (event, legacyUrl) => {
    const url = event.url || legacyUrl;
    if (desktopUrl && isNavigationAllowed(url, desktopUrl, true)) return;
    event.preventDefault();
    if (isExternalUrlAllowed(url)) {
      void shell.openExternal(url).catch((error) => {
        appendDesktopLog(`[omp-desktop] external navigation failed: ${error.message}`);
      });
    }
  };
  const guardFrameNavigation = (event, legacyUrl) => {
    const url = event.url || legacyUrl;
    if (desktopUrl && isNavigationAllowed(url, desktopUrl, event.isMainFrame !== false)) return;
    event.preventDefault();
    if (event.isMainFrame === true && isExternalUrlAllowed(url)) {
      void shell.openExternal(url).catch((error) => {
        appendDesktopLog(`[omp-desktop] external navigation failed: ${error.message}`);
      });
    }
  };
  window.webContents.on("will-navigate", guardNavigation);
  window.webContents.on("will-redirect", guardFrameNavigation);
  window.webContents.on("will-frame-navigate", guardFrameNavigation);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrlAllowed(url)) {
      void shell.openExternal(url).catch((error) => {
        appendDesktopLog(`[omp-desktop] external URL failed: ${error.message}`);
      });
    }
    return { action: "deny" };
  });
  window.once("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  return window;
}

function registerExternalLinkHandler() {
  ipcMain.handle("omp-desktop:open-external", createExternalLinkHandler({
    getApplicationUrl: () => desktopUrl,
    openExternal: (url) => shell.openExternal(url),
  }));
}

function registerDirectoryPickerHandler() {
  ipcMain.handle("omp-desktop:select-directory", async (event) => {
    if (!event.senderFrame || !desktopUrl || !isTrustedRendererUrl(event.senderFrame.url, desktopUrl)) {
      throw new Error("The directory-picker request did not come from the application.");
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("The directory-picker request has no application window.");

    const result = await dialog.showOpenDialog(window, {
      title: "Select project folder",
      buttonLabel: "Select",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}

function registerAttachmentPickerHandler() {
  ipcMain.handle("omp-desktop:select-attachments", async (event) => {
    if (!event.senderFrame || !desktopUrl || !isTrustedRendererUrl(event.senderFrame.url, desktopUrl)) {
      throw new Error("The attachment-picker request did not come from the application.");
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("The attachment-picker request has no application window.");
    const result = await dialog.showOpenDialog(window, {
      title: process.platform === "darwin" ? "Add files and folders" : "Add files",
      buttonLabel: "Add",
      properties: process.platform === "darwin"
        ? ["openFile", "openDirectory", "multiSelections"]
        : ["openFile", "multiSelections"],
    });
    return result.canceled ? [] : result.filePaths;
  });
}

function registerSessionMenuHandler() {
  ipcMain.handle("omp-desktop:show-session-menu", (event, state) => {
    if (!event.senderFrame || !desktopUrl || !isTrustedRendererUrl(event.senderFrame.url, desktopUrl)) {
      throw new Error("The session-menu request did not come from the application.");
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("The session-menu request has no application window.");

    return new Promise((resolve) => {
      let selectedAction = null;
      const menu = Menu.buildFromTemplate(createSessionMenuTemplate({
        icons: menuIcons,
        pinned: state?.pinned === true,
        unread: state?.unread === true,
        onAction: (action) => { selectedAction = action; },
      }));
      menu.popup({ window, callback: () => resolve(selectedAction) });
    });
  });
}

function registerProjectMenuHandler() {
  ipcMain.handle("omp-desktop:show-project-menu", (event, state) => {
    if (!event.senderFrame || !desktopUrl || !isTrustedRendererUrl(event.senderFrame.url, desktopUrl)) {
      throw new Error("The project-menu request did not come from the application.");
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("The project-menu request has no application window.");

    return new Promise((resolve) => {
      let selectedAction = null;
      const menu = Menu.buildFromTemplate(createProjectMenuTemplate({
        archiveEnabled: state?.archiveEnabled === true,
        icons: menuIcons,
        worktrees: state?.worktrees,
        onAction: (action) => { selectedAction = action; },
      }));
      menu.popup({ window, callback: () => resolve(selectedAction) });
    });
  });
}

function registerUpdateHandlers() {
  const trusted = (event) =>
    Boolean(event.senderFrame && desktopUrl && isTrustedRendererUrl(event.senderFrame.url, desktopUrl));
  ipcMain.handle("omp-desktop:update-get-state", (event) => {
    if (!trusted(event) || !updateController) return null;
    return updateController.getState();
  });
  ipcMain.handle("omp-desktop:update-check", async (event) => {
    if (!trusted(event) || !updateController) return null;
    return updateController.check();
  });
  ipcMain.handle("omp-desktop:update-install", (event) => {
    if (!trusted(event) || !updateController) return false;
    return updateController.install();
  });
}

function startUpdater() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    appendDesktopLog(`[omp-desktop] electron-updater unavailable: ${error.message}`);
    return;
  }
  autoUpdater.logger = { info: appendDesktopLog, warn: appendDesktopLog, error: appendDesktopLog, debug: () => {} };
  updateController = createUpdateController({
    autoUpdater,
    currentVersion: app.getVersion(),
    log: appendDesktopLog,
    publish: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(UPDATE_STATE_CHANNEL, state);
    },
  });
  updateController.start();
}

function registerPermissionHandler() {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", path.join(app.getPath("appData"), "omp-desktop"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.show();
  });
  app.on("before-quit", () => {
    shuttingDown = true;
    terminateServerTree();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      if (desktopUrl) void mainWindow.loadURL(desktopUrl).then(() => mainWindow?.show());
    }
  });

  app.whenReady()
    .then(async () => {
      registerExternalLinkHandler();
      registerDirectoryPickerHandler();
      registerAttachmentPickerHandler();
      registerProjectMenuHandler();
      registerSessionMenuHandler();
      registerUpdateHandlers();
      registerPermissionHandler();
      mainWindow = createMainWindow();

      desktopUrl = process.env.OMP_WEB_DESKTOP_DEV_URL || DEFAULT_DEV_URL;
      if (app.isPackaged) {
        const launchToken = randomUUID();
        desktopUrl = `http://127.0.0.1:${DESKTOP_PORT}`;
        startBundledServer(DESKTOP_PORT, launchToken);
        await waitForHttpResponse(`${desktopUrl}/api/desktop-health`, launchToken);
        appendDesktopLog(`[omp-desktop] bundled server ready on ${desktopUrl}`);
      }

      await mainWindow.loadURL(desktopUrl);
      appendDesktopLog(`[omp-desktop] window loaded ${desktopUrl}`);
      mainWindow.show();
      startUpdater();
    })
    .catch((error) => {
      appendDesktopLog(`[omp-desktop] startup failed: ${error.stack || error.message}`);
      terminateServerTree();
      app.exit(1);
    });
}
