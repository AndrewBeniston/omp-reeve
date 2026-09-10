/* eslint-disable @typescript-eslint/no-require-imports */
const {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { createHmac, timingSafeEqual } = require("node:crypto");
const path = require("node:path");
const TARGETS = require("./targets.json");

const DESKTOP_PORT = 30142;
const DESKTOP_CHALLENGE_HEADER = "x-omp-desktop-challenge";
const DESKTOP_PROOF_HEADER = "x-omp-desktop-proof";
const HOST = "127.0.0.1";
const NEXT_ENTRY = "node_modules/next/dist/bin/next";

function bunBinaryName(platform, arch) {
  const target = Object.values(TARGETS).find(
    (plan) => !plan.universal && plan.platform === platform && plan.arch === arch,
  );
  if (!target?.bunBinary) {
    throw new Error(`Unsupported desktop platform: ${platform}/${arch}`);
  }
  return target.bunBinary;
}

function createServerCommand({
  arch,
  homePath,
  launchToken,
  platform,
  port,
  resourcesPath,
  writableDistDir,
}) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const cwd = paths.join(resourcesPath, "server");

  return {
    executable: paths.join(cwd, bunBinaryName(platform, arch)),
    cwd,
    args: ["--bun", NEXT_ENTRY, "start", "-H", HOST, "-p", String(port)],
    env: {
      ...process.env,
      OMP_WEB_DESKTOP_TOKEN: launchToken,
      OMP_WEB_DIST_DIR: writableDistDir,
      OMP_WEB_LAUNCH_CWD: homePath,
    },
  };
}

function isExpectedServerResponse(response, launchToken, challenge) {
  const headers = response?.headers;
  const value = typeof headers?.get === "function"
    ? headers.get(DESKTOP_PROOF_HEADER)
    : headers?.[DESKTOP_PROOF_HEADER];
  if (!launchToken || !challenge || !/^[0-9a-f]{64}$/i.test(value ?? "")) return false;

  const actual = Buffer.from(value, "hex");
  const expected = Buffer.from(
    createHmac("sha256", launchToken).update(challenge).digest("hex"),
    "hex",
  );
  return timingSafeEqual(actual, expected);
}

function readBuildId(directory) {
  const buildIdPath = path.join(directory, "BUILD_ID");
  return existsSync(buildIdPath) ? readFileSync(buildIdPath, "utf8") : undefined;
}

function prepareWritableNext({ platform, resourcesPath, userDataPath, version }) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const sourceDirectory = paths.join(resourcesPath, "server", ".next");
  const sourceNodeModules = paths.join(resourcesPath, "server", "node_modules");
  const runtimeDirectory = paths.join(userDataPath, "runtime", version, "server");
  const directory = paths.join(runtimeDirectory, ".next");
  const sourceBuildId = readBuildId(sourceDirectory);
  if (!sourceBuildId) {
    throw new Error(`Packaged Next build is missing from ${sourceDirectory}`);
  }
  if (!existsSync(sourceNodeModules)) {
    throw new Error(`Packaged dependencies are missing from ${sourceNodeModules}`);
  }
  const readyPath = paths.join(directory, ".omp-runtime-ready");
  const readyBuildId = existsSync(readyPath) ? readFileSync(readyPath, "utf8") : undefined;

  if (readBuildId(directory) !== sourceBuildId || readyBuildId !== sourceBuildId) {
    const temporaryDirectory = `${directory}.${process.pid}.tmp`;
    rmSync(temporaryDirectory, { recursive: true, force: true });
    mkdirSync(paths.dirname(temporaryDirectory), { recursive: true });
    cpSync(sourceDirectory, temporaryDirectory, { recursive: true });
    writeFileSync(paths.join(temporaryDirectory, ".omp-runtime-ready"), sourceBuildId);
    rmSync(directory, { recursive: true, force: true });
    renameSync(temporaryDirectory, directory);
  }

  const nodeModulesLink = paths.join(runtimeDirectory, "node_modules");
  let linkMatches = false;
  try {
    linkMatches = realpathSync(nodeModulesLink) === realpathSync(sourceNodeModules);
  } catch {}
  if (!linkMatches) {
    rmSync(nodeModulesLink, { recursive: true, force: true });
    symlinkSync(sourceNodeModules, nodeModulesLink, platform === "win32" ? "junction" : "dir");
  }

  return {
    directory,
    distDir: paths.relative(paths.join(resourcesPath, "server"), directory),
  };
}

function isExternalUrlAllowed(value) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isTrustedRendererUrl(value, applicationUrl) {
  if (typeof value !== "string" || typeof applicationUrl !== "string") return false;

  try {
    return new URL(value).origin === new URL(applicationUrl).origin;
  } catch {
    return false;
  }
}

function isNavigationAllowed(value, applicationUrl, isMainFrame) {
  if (isTrustedRendererUrl(value, applicationUrl)) return true;
  return !isMainFrame && (value === "about:blank" || value === "about:srcdoc");
}

function createExternalLinkHandler({ getApplicationUrl, openExternal }) {
  return async (event, url) => {
    if (!event.senderFrame) {
      throw new Error("The external-link request did not come from the application.");
    }
    const senderUrl = event.senderFrame.url;
    if (!isTrustedRendererUrl(senderUrl, getApplicationUrl())) {
      throw new Error("The external-link request did not come from the application.");
    }
    if (!isExternalUrlAllowed(url)) {
      throw new Error("Only HTTP and HTTPS URLs, plus mailto URLs, can open externally.");
    }
    await openExternal(url);
  };
}

function createSessionMenuTemplate({ icons, pinned, unread, onAction }) {
  return [
    {
      label: "Rename",
      icon: icons?.rename,
      accelerator: "Alt+CommandOrControl+R",
      click: () => onAction("rename"),
    },
    {
      label: pinned ? "Unpin" : "Pin",
      icon: icons?.pin,
      accelerator: "Alt+CommandOrControl+P",
      click: () => onAction("toggle-pin"),
    },
    {
      label: unread ? "Mark as read" : "Mark as unread",
      icon: icons?.unread,
      accelerator: "Shift+CommandOrControl+U",
      click: () => onAction("toggle-unread"),
    },
    {
      label: "Archive",
      icon: icons?.archive,
      accelerator: "Shift+CommandOrControl+A",
      click: () => onAction("archive"),
    },
  ];
}

function createProjectMenuTemplate({ archiveEnabled, icons, worktrees, onAction }) {
  const safeWorktrees = Array.isArray(worktrees)
    ? worktrees.slice(0, 100).filter((worktree) => typeof worktree?.label === "string")
    : [];
  const template = [];

  if (safeWorktrees.length > 0) {
    template.push({
      label: "Worktrees",
      icon: icons?.worktrees,
      submenu: safeWorktrees.map((worktree, index) => ({
        label: worktree.label.slice(0, 200),
        type: "checkbox",
        checked: worktree.current === true,
        click: () => onAction({ type: "select-worktree", index }),
      })),
    });
    template.push({ type: "separator" });
  }

  template.push({
    label: "Archive chats",
    icon: icons?.archive,
    enabled: archiveEnabled === true,
    click: () => onAction({ type: "archive-chats" }),
  });
  template.push({ type: "separator" });
  template.push({
    label: "Remove project",
    icon: icons?.remove,
    click: () => onAction({ type: "remove-project" }),
  });
  return template;
}

// The four menus the renderer draws on Windows and Linux. The identifier is
// what the renderer sends back when a person clicks one of its buttons, and
// the main process pops the matching submenu. ADR-0008.
const APPLICATION_MENU_IDS = ["file", "edit", "view", "help"];

// Chromium reports an aborted load whenever a navigation replaces another one.
// It is normal, and it must not replace the window with an error page.
const ERR_ABORTED = -3;

// Reports whether a failed load must replace the window with Reeve's own page.
// A sub-frame failure stays inside its frame. The failure page is a data URL,
// and replacing it with itself would loop. Issue 7.
function shouldReportLoadFailure({ errorCode, isMainFrame, validatedUrl }) {
  if (isMainFrame === false) return false;
  if (typeof validatedUrl === "string" && validatedUrl.startsWith("data:")) return false;
  return errorCode !== ERR_ABORTED;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Builds the page the window shows when it cannot load the application. The
// page runs no script, so the retry control is a link back to the application
// URL. The navigation guard allows that URL, because it is the application
// origin. Issue 7.
function createLoadFailurePage({ errorCode, errorDescription, retryUrl }) {
  const description = escapeHtml(errorDescription || "The server did not answer.");
  const code = escapeHtml(errorCode);
  const url = escapeHtml(retryUrl);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Reeve cannot open</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: #16181c;
    color: #e6e8ea;
    font-family: system-ui, sans-serif;
  }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.125rem; font-weight: 600; margin: 0 0 0.75rem; }
  p { margin: 0 0 1.25rem; line-height: 1.5; color: #a8adb4; font-size: 0.875rem; }
  code { color: #8f959d; font-size: 0.75rem; }
  a {
    display: inline-block;
    padding: 0.5rem 1.125rem;
    border: 1px solid #3a3f46;
    border-radius: 0.5rem;
    background: #23262b;
    color: #e6e8ea;
    text-decoration: none;
    font-size: 0.875rem;
  }
</style>
</head>
<body>
<main>
<h1>Reeve cannot reach its own server</h1>
<p>The window could not load the application. Select Try again. If the problem stays, restart Reeve.</p>
<p><code>${description} (${code})</code></p>
<a href="${url}">Try again</a>
</main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

const REEVE_DOCUMENTATION_URL = "https://github.com/AndrewBeniston/omp-reeve#readme";
const REEVE_ISSUE_URL = "https://github.com/AndrewBeniston/omp-reeve/issues/new";

/**
 * The one application menu, registered on every platform.
 *
 * macOS draws it as the system menu bar. Windows and Linux hide the bar and
 * the renderer draws the same four names itself. The menu is never removed,
 * because it carries the keyboard shortcuts.
 */
function createApplicationMenuTemplate({ platform, onAction, onOpenExternal } = {}) {
  const isMac = platform === "darwin";
  const send = (action) => () => { if (onAction) onAction(action); };
  const open = (url) => () => { if (onOpenExternal) onOpenExternal(url); };
  const template = [];

  if (isMac) template.push({ role: "appMenu" });

  template.push({
    id: "file",
    label: "File",
    submenu: [
      { id: "file-new-chat", label: "New chat", accelerator: "CmdOrCtrl+N", click: send("new-chat") },
      { type: "separator" },
      { role: "close" },
      ...(isMac ? [] : [{ role: "quit" }]),
    ],
  });

  template.push({
    id: "edit",
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  });

  template.push({
    id: "view",
    label: "View",
    submenu: [
      { id: "view-sidebar", label: "Toggle sidebar", accelerator: "CmdOrCtrl+B", click: send("toggle-sidebar") },
      { type: "separator" },
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  template.push({
    id: "help",
    label: "Help",
    submenu: [
      { id: "help-documentation", label: "Documentation", click: open(REEVE_DOCUMENTATION_URL) },
      { id: "help-report-issue", label: "Report an issue", click: open(REEVE_ISSUE_URL) },
    ],
  });

  return template;
}

module.exports = {
  APPLICATION_MENU_IDS,
  DESKTOP_PORT,
  DESKTOP_CHALLENGE_HEADER,
  DESKTOP_PROOF_HEADER,
  createApplicationMenuTemplate,
  createExternalLinkHandler,
  createLoadFailurePage,
  createProjectMenuTemplate,
  createSessionMenuTemplate,
  createServerCommand,
  isExternalUrlAllowed,
  isExpectedServerResponse,
  isNavigationAllowed,
  isTrustedRendererUrl,
  prepareWritableNext,
  shouldReportLoadFailure,
};
