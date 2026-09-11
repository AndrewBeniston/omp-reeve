/* eslint-disable @typescript-eslint/no-require-imports */
const { closeSync, openSync, writeSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, webContents, WebContentsView } = require("electron");
const {
  DESKTOP_PORT,
  DESKTOP_CHALLENGE_HEADER,
  createExternalLinkHandler,
  createProjectMenuTemplate,
  createBrowserTabMenuTemplate,
  createSessionMenuTemplate,
  createServerCommand,
  isExternalUrlAllowed,
  isExpectedServerResponse,
  isNavigationAllowed,
  isTrustedRendererUrl,
  prepareWritableNext,
} = require("./desktop-runtime.cjs");
const { STATE_CHANNEL: UPDATE_STATE_CHANNEL, createUpdateController } = require("./update-controller.cjs");
const { createTerminalRegistry, loadPty } = require("./terminal-host.cjs");
const { createBrowserViewRegistry } = require("./browser-views.cjs");
const { BROWSER_PARTITION } = require("./desktop-runtime.cjs");
const {
  cdpDiscoveryUrl,
  planAgentBrowserAccess,
  readActivePort,
  readAgentBrowserGrant,
  removeStalePortFile,
  writeAgentBrowserGrant,
} = require("./agent-browser-access.cjs");

const DEFAULT_DEV_URL = "http://127.0.0.1:30141";
const LOG_PATH = path.join(os.tmpdir(), "omp-desktop.log");
const SERVER_READY_TIMEOUT_MS = 60_000;
let mainWindow;
let serverProcess;
let desktopUrl;
let updateController = null;
let shuttingDown = false;
let terminalRegistry = null;
let browserViewRegistry = null;

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
      // Permission to create a <webview> guest for a Browser tab. It does not
      // change this window: the three guarantees above are unchanged. Every
      // No guest is ever created. A Browser tab is a WebContentsView the main
      // process owns, so the renderer has no reason to be able to make one, and
      // refusing outright is stronger than containing a guest after the fact.
      webviewTag: false,
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
  // A guest cannot be created at all, so there is nothing to contain on
  // attach. This handler refuses the attach outright rather than negotiating
  // with preferences that should never arrive.
  window.webContents.on("will-attach-webview", (event) => {
    appendDesktopLog("[omp-desktop] refused a webview attach; Browser tabs are not guests");
    event.preventDefault();
  });
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

/**
 * The Terminal tab's shells.
 *
 * Every handler checks that the request came from the application's own
 * renderer, exactly as the pickers and menus do, and then hands the decision to
 * terminal-host.cjs, which reads the Project's trust from disk. The renderer
 * names a directory; it never grants itself one.
 *
 * The owner of a Terminal is the webContents that opened it, so its output is
 * sent back only there and no window can reach another window's shell.
 */
function registerTerminalHandlers() {
  const trusted = (event) =>
    Boolean(event.senderFrame && desktopUrl && isTrustedRendererUrl(event.senderFrame.url, desktopUrl));

  const send = (contents, channel, payload) => {
    if (!contents.isDestroyed()) contents.send(channel, payload);
  };

  /**
   * Windows whose shells are already bound to their own destruction.
   *
   * The binding belongs to the window, not to the Terminal, so it is made once.
   * Registering it per Terminal instead stacked a listener for every Tab a human
   * opened, and Node warns about a leak at eleven.
   *
   * Weak, so a closed window is collectable rather than held here forever.
   */
  const boundToWindow = new WeakSet();

  const endShellsWithWindow = (contents) => {
    if (boundToWindow.has(contents)) return;
    boundToWindow.add(contents);
    // A pty outlives the process that spawned it unless it is killed, so an
    // orphaned login shell would sit there holding the Project directory open.
    contents.once("destroyed", () => terminalRegistry?.closeAllFor(contents.id));
  };

  ipcMain.handle("omp-desktop:terminal-open", (event, request) => {
    if (!trusted(event)) return { ok: false, reason: "untrusted-sender" };

    const binding = loadPty();
    if (!binding.ok) {
      // A native binding built for the wrong ABI. The human gets a message in
      // the Tab rather than a dead panel, and the reason reaches the log.
      appendDesktopLog("[omp-desktop] node-pty unavailable: " + binding.error);
      return { ok: false, reason: "pty-unavailable" };
    }

    const contents = event.sender;
    if (!terminalRegistry) {
      terminalRegistry = createTerminalRegistry({
        spawn: (shell, args, options) => binding.pty.spawn(shell, args, options),
        mintId: () => randomUUID(),
      });
    }

    const opened = terminalRegistry.open({
      cwd: typeof request?.cwd === "string" ? request.cwd : "",
      ownerId: contents.id,
      platform: process.platform,
      env: process.env,
      cols: Number.isInteger(request?.cols) ? request.cols : undefined,
      rows: Number.isInteger(request?.rows) ? request.rows : undefined,
      onData: (id, data) => send(contents, "omp-desktop:terminal-data", { id, data }),
      onExit: (id, exitCode) => send(contents, "omp-desktop:terminal-exit", { id, exitCode }),
    });

    if (opened.ok) endShellsWithWindow(contents);
    return opened;
  });

  ipcMain.handle("omp-desktop:terminal-write", (event, request) => {
    if (!trusted(event) || !terminalRegistry) return false;
    return terminalRegistry.write(request?.id, event.sender.id, request?.data);
  });

  ipcMain.handle("omp-desktop:terminal-resize", (event, request) => {
    if (!trusted(event) || !terminalRegistry) return false;
    return terminalRegistry.resize(request?.id, event.sender.id, request?.cols, request?.rows);
  });

  ipcMain.handle("omp-desktop:terminal-close", (event, request) => {
    if (!trusted(event) || !terminalRegistry) return false;
    return terminalRegistry.close(request?.id, event.sender.id);
  });
}

/**
 * The control that grants, or withdraws, the agent's access to the browser.
 *
 * Reading is harmless. Writing records a decision that takes effect at the next
 * launch, and the renderer is told so, because a control that appeared to do
 * nothing would be worse than one that explains itself.
 */
function registerAgentBrowserHandlers() {
  const trusted = (event) =>
    Boolean(event.senderFrame && desktopUrl && isTrustedRendererUrl(event.senderFrame.url, desktopUrl));

  const state = () => {
    const granted = readAgentBrowserGrant(agentBrowserAccess.userDataDir);
    // Open only when this launch actually carries the switch. A grant made
    // since startup is recorded but not yet in effect, and saying otherwise
    // would send the agent at a port nothing is listening on.
    const port = agentBrowserAccess.open ? readActivePort(agentBrowserAccess.userDataDir) : null;
    return {
      granted,
      openThisLaunch: agentBrowserAccess.open,
      restartRequired: granted !== agentBrowserAccess.open,
      cdpUrl: cdpDiscoveryUrl(port),
    };
  };

  ipcMain.handle("omp-desktop:agent-browser-get", (event) => {
    if (!trusted(event)) return null;
    return state();
  });

  ipcMain.handle("omp-desktop:agent-browser-set", (event, granted) => {
    if (!trusted(event)) return null;
    writeAgentBrowserGrant(agentBrowserAccess.userDataDir, granted === true);
    return state();
  });
}


/**
 * Browser tabs, drawn by the main process.
 *
 * A page is a WebContentsView rather than a guest so the agent can see it:
 * Chromium reports a guest as a webview target and OMP browser tool keeps only
 * page targets. See browser-views.cjs.
 *
 * The renderer owns the layout question and answers it by measurement: it
 * reports the rectangle its placeholder occupies, and the page is drawn there.
 */
function registerBrowserViewHandlers() {
  const trusted = (event) =>
    Boolean(event.senderFrame && desktopUrl && isTrustedRendererUrl(event.senderFrame.url, desktopUrl));

  const windowFor = (ownerId) => {
    const contents = webContents.fromId(ownerId);
    return contents ? BrowserWindow.fromWebContents(contents) : null;
  };

  browserViewRegistry = createBrowserViewRegistry({
    createView: (webPreferences) => new WebContentsView({ webPreferences }),
    attach: (view, ownerId) => {
      const window = windowFor(ownerId);
      if (window) window.contentView.addChildView(view);
    },
    detach: (view, ownerId) => {
      const window = windowFor(ownerId);
      if (window) window.contentView.removeChildView(view);
      // The page is a live process. Removing the view from the tree does not
      // end it, and a page nobody can see is still running scripts.
      view.webContents.close();
    },
  });

  /**
   * Wire one page events back to the renderer that owns it.
   *
   * The renderer draws the tab strip and the address bar, so it needs to know
   * where the page went and what it calls itself. This is the same set the
   * guest reported.
   */
  const wirePage = (contents, sender, tabId) => {
    const send = (channel, payload) => {
      if (!sender.isDestroyed()) sender.send(channel, Object.assign({ tabId }, payload));
    };
    const navigated = () => send('omp-desktop:browser-navigated', {
      url: contents.getURL(),
      canGoBack: contents.canGoBack(),
      canGoForward: contents.canGoForward(),
    });
    contents.on('did-navigate', navigated);
    contents.on('did-navigate-in-page', navigated);
    contents.on('page-title-updated', (_event, title) => send('omp-desktop:browser-title', { title }));
    contents.on('page-favicon-updated', (_event, favicons) => {
      // Largest last, as the guest reported them.
      const faviconUrl = favicons[favicons.length - 1];
      if (faviconUrl) send('omp-desktop:browser-favicon', { faviconUrl });
    });
    // A page is a plain web page: it navigates freely inside itself, and its
    // popups leave for the system browser rather than opening a window here.
    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalUrlAllowed(url)) {
        void shell.openExternal(url).catch((error) => {
          appendDesktopLog('[omp-desktop] page external URL failed: ' + error.message);
        });
      }
      return { action: 'deny' };
    });
  };

  const boundToWindow = new WeakSet();
  const endPagesWithWindow = (contents) => {
    if (boundToWindow.has(contents)) return;
    boundToWindow.add(contents);
    contents.once('destroyed', () => browserViewRegistry?.closeAllFor(contents.id));
  };

  ipcMain.handle('omp-desktop:browser-open', (event, request) => {
    if (!trusted(event)) return { ok: false, reason: 'untrusted-sender' };
    const sender = event.sender;
    const tabId = typeof request?.tabId === 'string' ? request.tabId : '';
    if (!tabId) return { ok: false, reason: 'no-tab' };

    const opened = browserViewRegistry.open({
      ownerId: sender.id,
      tabId,
      url: typeof request?.url === 'string' ? request.url : '',
      bounds: request?.bounds,
    });
    if (opened.ok && !opened.reused) {
      wirePage(browserViewRegistry.contentsFor(sender.id, tabId), sender, tabId);
      endPagesWithWindow(sender);
    }
    return opened;
  });

  ipcMain.handle('omp-desktop:browser-bounds', (event, request) => {
    if (!trusted(event) || !browserViewRegistry) return false;
    return browserViewRegistry.setBounds(event.sender.id, request?.tabId, request?.bounds);
  });

  ipcMain.handle('omp-desktop:browser-visible', (event, request) => {
    if (!trusted(event) || !browserViewRegistry) return false;
    return browserViewRegistry.setVisible(event.sender.id, request?.tabId, request?.visible);
  });

  ipcMain.handle('omp-desktop:browser-navigate', (event, request) => {
    if (!trusted(event) || !browserViewRegistry) return false;
    return browserViewRegistry.navigate(event.sender.id, request?.tabId, request?.url);
  });

  ipcMain.handle('omp-desktop:browser-command', (event, request) => {
    if (!trusted(event) || !browserViewRegistry) return false;
    return browserViewRegistry.command(event.sender.id, request?.tabId, request?.name);
  });

  ipcMain.handle('omp-desktop:browser-close', (event, request) => {
    if (!trusted(event) || !browserViewRegistry) return false;
    return browserViewRegistry.close(event.sender.id, request?.tabId);
  });
}

function registerBrowserTabMenuHandler() {
  ipcMain.handle('omp-desktop:show-browser-tab-menu', (event, state) => {
    if (!event.senderFrame || !desktopUrl || !isTrustedRendererUrl(event.senderFrame.url, desktopUrl)) {
      throw new Error('The browser-tab-menu request did not come from the application.');
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('The browser-tab-menu request has no application window.');

    return new Promise((resolve) => {
      let selectedAction = null;
      const menu = Menu.buildFromTemplate(createBrowserTabMenuTemplate({
        hasUrl: state?.hasUrl === true,
        onAction: (action) => { selectedAction = action; },
      }));
      menu.popup({ window, callback: () => resolve(selectedAction) });
    });
  });
}

/**
 * Clear everything the built-in browser has stored.
 *
 * Every Browser tab shares one partition, so there is no smaller honest unit
 * than all of it: clearing one site's cookies is not something Reeve can offer
 * without a per-site surface it does not have. The human is told that plainly
 * rather than given a control that looks more precise than it is.
 */
function registerBrowsingDataHandler() {
  ipcMain.handle('omp-desktop:clear-browsing-data', async (event) => {
    if (!event.senderFrame || !desktopUrl || !isTrustedRendererUrl(event.senderFrame.url, desktopUrl)) {
      throw new Error('The clear-browsing-data request did not come from the application.');
    }
    const browsing = session.fromPartition(BROWSER_PARTITION);
    // Storage is the part that signs somebody in. The cache is cleared with it
    // so a page cannot be served from disk as though nothing had happened.
    await browsing.clearStorageData();
    await browsing.clearCache();
    // A page already on screen keeps its own memory of being signed in until it
    // reloads, so every open Browser tab is reloaded rather than left looking
    // signed in against a store that no longer says so.
    const reloaded = browserViewRegistry ? browserViewRegistry.reloadAll() : 0;
    return { ok: true, reloaded };
  });
}

function registerPermissionHandler() {
  // Every session, not only the default one. A Browser tab runs in its own
  // partition, and a session with no handler grants whatever a page asks for,
  // so an ordinary web page could have taken the camera or the microphone
  // without anybody being asked. Reeve has no surface for granting these, so
  // the honest answer is no rather than a silent yes.
  for (const target of [session.defaultSession, session.fromPartition(BROWSER_PARTITION)]) {
    target.setPermissionCheckHandler(() => false);
    target.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
  }
}

if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", path.join(app.getPath("appData"), "omp-desktop"));
}

/**
 * Decide the agent's browser access before Chromium reads its switches.
 *
 * This runs at module scope, ahead of app-ready, because that is the only
 * moment the debugging switch can still be added. The grant itself was made in
 * an earlier launch by a human, which is exactly the point: nothing running now
 * can open this door.
 */
const agentBrowserAccess = (() => {
  const userDataDir = app.getPath("userData");
  const granted = readAgentBrowserGrant(userDataDir);
  const plan = planAgentBrowserAccess(granted);

  for (const [name, value] of plan.switches) {
    app.commandLine.appendSwitch(name, value);
  }
  if (plan.removeStalePortFile) removeStalePortFile(userDataDir);

  // Whether a debugging port is open is asked of the command line, not
  // inferred from the grant. A port opened any other way, by a developer flag
  // or a wrapper script, is still a port, and a panel that reported it as shut
  // would be reassuring at exactly the wrong moment.
  const open = app.commandLine.hasSwitch("remote-debugging-port");
  return { userDataDir, open };
})();

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
    if (mainWindow && !mainWindow.isDestroyed()) terminalRegistry?.closeAllFor(mainWindow.webContents.id);
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
      registerTerminalHandlers();
      registerBrowserViewHandlers();
      registerBrowserTabMenuHandler();
      registerBrowsingDataHandler();
      registerAgentBrowserHandlers();
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
