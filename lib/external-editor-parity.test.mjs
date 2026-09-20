import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadRegistry() {
  return import("./external-editor-registry.ts");
}

async function loadDiscovery() {
  return import("./external-editor-discovery.ts");
}

async function loadDetect() {
  return import("./external-editor-detect.ts");
}

test("Devin Desktop is offered on macOS and resolves its own launcher", async (t) => {
  const { findExternalEditorTarget, buildLaunchArguments } = await loadRegistry();
  const { resolveTarget } = await loadDetect();
  const target = findExternalEditorTarget("devin");
  assert.ok(target, "the registry carries a devin target");
  assert.equal(target.label, "Devin Desktop");
  assert.equal(target.kind, "editor");
  assert.deepEqual(Object.keys(target.platforms), ["darwin"]);

  const base = fs.mkdtempSync(path.join(os.tmpdir(), "omp-web-devin-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const launcher = path.join(base, "Applications/Devin.app/Contents/Resources/app/bin/devin-desktop");
  fs.mkdirSync(path.dirname(launcher), { recursive: true });
  fs.writeFileSync(launcher, "");

  assert.deepEqual(resolveTarget(target, "darwin", { HOME: base }), { command: launcher, bundle: false });
  assert.equal(resolveTarget(target, "darwin", { HOME: path.join(base, "empty") }), null);
  assert.deepEqual(buildLaunchArguments(target, "darwin", { path: "/tmp/a.ts", line: 12 }), ["--goto", "/tmp/a.ts:12"]);
});

test("Devin Desktop never probes the unrelated devin command on PATH", async (t) => {
  const { findExternalEditorTarget } = await loadRegistry();
  const { resolveTarget } = await loadDetect();
  const target = findExternalEditorTarget("devin");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "omp-web-devin-path-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const agent = path.join(base, "devin");
  fs.writeFileSync(agent, "");
  fs.chmodSync(agent, 0o755);

  assert.equal(resolveTarget(target, "darwin", { PATH: base, HOME: base }), null);
});

test("the offered labels match the reference, and the file manager takes the platform's name", async () => {
  const { EXTERNAL_EDITOR_TARGETS, findExternalEditorTarget, labelForPlatform } = await loadRegistry();
  const labels = new Map(EXTERNAL_EDITOR_TARGETS.map((target) => [target.id, target.label]));
  assert.equal(labels.get("vscode"), "VS Code");
  assert.equal(labels.get("vscodeInsiders"), "VS Code Insiders");
  assert.equal(labels.get("iterm2"), "iTerm2");
  assert.equal(labels.get("kitty"), "Kitty");
  assert.equal(labels.get("systemDefault"), "Default app");

  const fileManager = findExternalEditorTarget("fileManager");
  assert.equal(labelForPlatform(fileManager, "darwin"), "Finder");
  assert.equal(labelForPlatform(fileManager, "win32"), "File Explorer");
  assert.equal(labelForPlatform(fileManager, "linux"), "File manager");
  assert.equal(labelForPlatform(findExternalEditorTarget("vscode"), "win32"), "VS Code");
});

test("every target id a preference can already name is still in the registry", async () => {
  const { EXTERNAL_EDITOR_TARGETS } = await loadRegistry();
  const ids = new Set(EXTERNAL_EDITOR_TARGETS.map((target) => target.id));
  const saved = [
    "vscode", "vscodeInsiders", "cursor", "windsurf", "antigravity", "positron", "zed", "sublimeText",
    "textmate", "bbedit", "emacs", "neovim", "xcode", "visualStudio", "androidStudio", "intellij",
    "pycharm", "webstorm", "phpstorm", "goland", "rider", "rustrover", "clion", "githubDesktop",
    "systemDefault", "fileManager", "terminal", "iterm2", "kitty", "ghostty", "warp", "gitBash",
    "cmder", "wsl",
  ];
  for (const id of saved) assert.ok(ids.has(id), `${id} is still offered`);
  assert.equal(ids.size, saved.length + 1, "devin is the only addition");
});

test("a page leads with the platform's own applications on every platform", async () => {
  const { discoveryMode, isWebPage } = await loadDiscovery();
  assert.equal(isWebPage("/tmp/report.html"), true);
  assert.equal(isWebPage("/tmp/report.htm"), true);
  assert.equal(isWebPage("/tmp/report.ts"), false);

  // The mode no longer depends on the platform, and the page does not have to
  // exist. A source file never flips it.
  assert.equal(discoveryMode("/tmp/absent-page.html"), "native");
  assert.equal(discoveryMode("/tmp/absent-page.htm"), "native");
  assert.equal(discoveryMode("/tmp/absent-source.ts"), "editor");
});

test("Windows appends no discovered application, and never throws", async (t) => {
  const { discoverApplications } = await loadDiscovery();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "omp-web-discovery-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const page = path.join(base, "report.html");
  const source = path.join(base, "main.ts");
  fs.writeFileSync(page, "<p>a</p>");
  fs.writeFileSync(source, "export {};");

  assert.deepEqual(await discoverApplications(page, "win32"), []);
  assert.deepEqual(await discoverApplications(source, "win32"), []);
  assert.deepEqual(await discoverApplications(source, "darwin"), []);
});
