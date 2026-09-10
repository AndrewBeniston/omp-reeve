import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const {
  DESKTOP_PORT,
  DESKTOP_PROOF_HEADER,
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

test("the packaged desktop uses one stable browser origin", () => {
  assert.equal(DESKTOP_PORT, 30142);
});

test("packaged macOS starts Next with the bundled Bun runtime", () => {
  const command = createServerCommand({
    arch: "arm64",
    homePath: "/Users/omp",
    launchToken: "launch-secret",
    platform: "darwin",
    port: 43123,
    resourcesPath: "/Applications/OMP Desktop.app/Contents/Resources",
    writableDistDir: "../../../../Application Support/OMP Desktop/runtime/0.4.1/.next",
  });

  assert.equal(
    command.executable,
    "/Applications/OMP Desktop.app/Contents/Resources/server/bun-darwin-aarch64",
  );
  assert.equal(command.cwd, "/Applications/OMP Desktop.app/Contents/Resources/server");
  assert.deepEqual(command.args, [
    "--bun",
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    "43123",
  ]);
  assert.equal(command.env.OMP_WEB_LAUNCH_CWD, "/Users/omp");
  assert.equal(
    command.env.OMP_WEB_DIST_DIR,
    "../../../../Application Support/OMP Desktop/runtime/0.4.1/.next",
  );
  assert.equal(command.env.OMP_WEB_DESKTOP_TOKEN, "launch-secret");
});

test("the server command rejects platforms without packaged Bun runtimes", () => {
  assert.throws(
    () => createServerCommand({
      arch: "arm64",
      homePath: "/home/omp",
      launchToken: "launch-secret",
      platform: "linux",
      port: 43123,
      resourcesPath: "/opt/omp-desktop/resources",
      writableDistDir: "../../runtime/.next",
    }),
    /Unsupported desktop platform/,
  );
});

test("packaged Windows starts Next with the bundled Bun runtime", () => {
  const command = createServerCommand({
    arch: "x64",
    homePath: "C:\\Users\\omp",
    launchToken: "launch-secret",
    platform: "win32",
    port: 43123,
    resourcesPath: "C:\\Program Files\\OMP Desktop\\resources",
    writableDistDir: "..\\..\\AppData\\OMP Desktop\\runtime\\0.4.1\\.next",
  });

  assert.equal(
    command.executable,
    "C:\\Program Files\\OMP Desktop\\resources\\server\\bun-windows-x64.exe",
  );
  assert.equal(command.cwd, "C:\\Program Files\\OMP Desktop\\resources\\server");
  assert.equal(command.env.OMP_WEB_LAUNCH_CWD, "C:\\Users\\omp");
  assert.equal(
    command.env.OMP_WEB_DIST_DIR,
    "..\\..\\AppData\\OMP Desktop\\runtime\\0.4.1\\.next",
  );
});

test("server readiness requires a keyed challenge response", () => {
  const challenge = "5d57f7c5-42c8-42e1-b386-fc72002dd366";
  const proof = createHmac("sha256", "launch-secret").update(challenge).digest("hex");
  const response = (value) => ({
    headers: { get: (name) => name === DESKTOP_PROOF_HEADER ? value : null },
  });

  assert.equal(DESKTOP_PROOF_HEADER, "x-omp-desktop-proof");
  assert.equal(isExpectedServerResponse(response(proof), "launch-secret", challenge), true);
  assert.equal(isExpectedServerResponse(response(challenge), "launch-secret", challenge), false);
  assert.equal(isExpectedServerResponse(response(null), "launch-secret", challenge), false);
});

test("the packaged build copies Next into writable application data", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resourcesPath = join(root, "OMP Desktop.app", "Contents", "Resources");
  const sourceNext = join(resourcesPath, "server", ".next");
  const sourceNodeModules = join(resourcesPath, "server", "node_modules");
  const userDataPath = join(root, "Application Support", "OMP Desktop");
  await mkdir(sourceNext, { recursive: true });
  await mkdir(sourceNodeModules, { recursive: true });
  await writeFile(join(sourceNext, "BUILD_ID"), "build-one");
  await writeFile(join(sourceNext, "server-file"), "sealed source");
  await writeFile(join(sourceNodeModules, "dependency"), "sealed dependency");

  const result = prepareWritableNext({
    platform: "darwin",
    resourcesPath,
    userDataPath,
    version: "0.4.1",
  });

  assert.equal(await readFile(join(result.directory, "BUILD_ID"), "utf8"), "build-one");
  assert.equal(await readFile(join(result.directory, "server-file"), "utf8"), "sealed source");
  assert.equal(await readFile(join(result.directory, ".omp-runtime-ready"), "utf8"), "build-one");
  assert.equal(
    await realpath(join(result.directory, "..", "node_modules")),
    await realpath(sourceNodeModules),
  );
  assert.equal(result.distDir.startsWith(".."), true);
  assert.equal(result.distDir.endsWith("runtime/0.4.1/server/.next"), true);
});

test("the writable build rejects a missing packaged source", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "omp-desktop-runtime-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.throws(
    () => prepareWritableNext({
      platform: "darwin",
      resourcesPath: join(root, "Resources"),
      userDataPath: join(root, "Application Support"),
      version: "0.4.1",
    }),
    /Packaged Next build is missing/,
  );
});

test("the desktop shell opens only HTTP links externally", () => {
  assert.equal(isExternalUrlAllowed("https://example.com/login"), true);
  assert.equal(isExternalUrlAllowed("http://127.0.0.1:30141/help"), true);
  assert.equal(isExternalUrlAllowed("mailto:person@example.com"), true);
  assert.equal(isExternalUrlAllowed("tel:+441234567890"), false);
  assert.equal(isExternalUrlAllowed("file:///Users/omp/private"), false);
  assert.equal(isExternalUrlAllowed("javascript:alert(1)"), false);
  assert.equal(isExternalUrlAllowed("invalid"), false);
});

test("the native session menu contains only recoverable session actions", () => {
  const actions = [];
  const icons = {
    archive: { name: "archive" },
    pin: { name: "pin" },
    rename: { name: "rename" },
    unread: { name: "unread" },
  };
  const menu = createSessionMenuTemplate({
    icons,
    pinned: false,
    unread: false,
    onAction: (action) => actions.push(action),
  });

  assert.deepEqual(menu.map((item) => item.label), ["Rename", "Pin", "Mark as unread", "Archive"]);
  assert.equal(menu.some((item) => item.label === "Delete"), false);
  assert.deepEqual(menu.map((item) => item.icon), [icons.rename, icons.pin, icons.unread, icons.archive]);
  menu.forEach((item) => item.click());
  assert.deepEqual(actions, ["rename", "toggle-pin", "toggle-unread", "archive"]);
  assert.deepEqual(
    createSessionMenuTemplate({ pinned: true, unread: true, onAction() {} }).map((item) => item.label),
    ["Rename", "Unpin", "Mark as read", "Archive"],
  );
});

test("the native project menu follows the Codex action groups", () => {
  const actions = [];
  const icons = {
    archive: { name: "archive" },
    remove: { name: "remove" },
    worktrees: { name: "worktrees" },
  };
  const menu = createProjectMenuTemplate({
    archiveEnabled: true,
    icons,
    worktrees: [
      { label: "main", current: true },
      { label: "codex/menu", current: false },
    ],
    onAction: (action) => actions.push(action),
  });

  assert.deepEqual(menu.map((item) => item.label ?? item.type), [
    "Worktrees",
    "separator",
    "Archive chats",
    "separator",
    "Remove project",
  ]);
  assert.deepEqual(menu[0].submenu.map((item) => item.label), ["main", "codex/menu"]);
  assert.equal(menu[0].submenu[0].checked, true);
  assert.equal(menu[0].icon, icons.worktrees);
  assert.equal(menu[2].icon, icons.archive);
  assert.equal(menu[4].icon, icons.remove);
  menu[0].submenu[1].click();
  menu[2].click();
  menu[4].click();
  assert.deepEqual(actions, [
    { type: "select-worktree", index: 1 },
    { type: "archive-chats" },
    { type: "remove-project" },
  ]);

  const disabled = createProjectMenuTemplate({
    archiveEnabled: false,
    worktrees: [],
    onAction() {},
  });
  assert.equal(disabled[0].label, "Archive chats");
  assert.equal(disabled[0].enabled, false);
});

test("desktop privileges accept only the active application origin", () => {
  const applicationUrl = "http://127.0.0.1:43123";

  assert.equal(isTrustedRendererUrl("http://127.0.0.1:43123/settings", applicationUrl), true);
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:43123.evil.test", applicationUrl), false);
  assert.equal(isTrustedRendererUrl("http://127.0.0.1:43124", applicationUrl), false);
  assert.equal(isTrustedRendererUrl("https://example.com", applicationUrl), false);
  assert.equal(isTrustedRendererUrl("invalid", applicationUrl), false);
});

test("navigation stays on the application origin with safe embedded documents", () => {
  const applicationUrl = "http://127.0.0.1:43123";

  assert.equal(isNavigationAllowed("http://127.0.0.1:43123/settings", applicationUrl, true), true);
  assert.equal(isNavigationAllowed("https://example.com", applicationUrl, true), false);
  assert.equal(isNavigationAllowed("about:srcdoc", applicationUrl, false), true);
  assert.equal(isNavigationAllowed("about:blank", applicationUrl, false), true);
  assert.equal(isNavigationAllowed("about:srcdoc", applicationUrl, true), false);
});

test("the IPC handler validates its sender and its external URL", async () => {
  const opened = [];
  const handler = createExternalLinkHandler({
    getApplicationUrl: () => "http://127.0.0.1:43123",
    openExternal: async (url) => opened.push(url),
  });

  await handler(
    { sender: { getURL: () => "" }, senderFrame: { url: "http://127.0.0.1:43123/settings" } },
    "https://example.com/login",
  );
  assert.deepEqual(opened, ["https://example.com/login"]);

  await assert.rejects(
    handler(
      { sender: { getURL: () => "http://127.0.0.1:43123" }, senderFrame: null },
      "https://example.com/login",
    ),
    /did not come from the application/,
  );
  await assert.rejects(
    handler(
      { sender: { getURL: () => "" }, senderFrame: { url: "http://127.0.0.1:43123" } },
      "file:///Users/omp/private",
    ),
    /Only HTTP and HTTPS URLs/,
  );
});
