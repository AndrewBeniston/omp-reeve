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

/**
 * The one session partition every Browser tab shares.
 *
 * It is persistent, so a login survives a restart, and it is deliberately not
 * the application's own session: the renderer holds the desktop launch token
 * and talks to the local server, and no web page may share a cookie jar with
 * that. A partition per tab was rejected because it logs the human out of
 * everything every time they open a tab.
 */
const BROWSER_PARTITION = "persist:omp-browser";


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

module.exports = {
  DESKTOP_PORT,
  DESKTOP_CHALLENGE_HEADER,
  DESKTOP_PROOF_HEADER,
  BROWSER_PARTITION,
  createExternalLinkHandler,
  createProjectMenuTemplate,
  createSessionMenuTemplate,
  createServerCommand,
  isExternalUrlAllowed,
  isExpectedServerResponse,
  isNavigationAllowed,
  isTrustedRendererUrl,
  prepareWritableNext,
};
