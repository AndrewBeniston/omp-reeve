import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  createTerminalRegistry,
  planTerminalSpawn,
  resolveLoginShell,
  scrubTerminalEnvironment,
} = require("./terminal-host.cjs");

/** A pty that records what it was told, so the registry can be tested alone. */
function fakePty() {
  const pty = {
    written: [],
    resized: [],
    killed: false,
    dataListener: null,
    exitListener: null,
    onData(listener) { pty.dataListener = listener; },
    onExit(listener) { pty.exitListener = listener; },
    write(data) { pty.written.push(data); },
    resize(cols, rows) { pty.resized.push([cols, rows]); },
    kill() { pty.killed = true; },
  };
  return pty;
}

function registryWithFakePty() {
  const spawned = [];
  let next = 0;
  const registry = createTerminalRegistry({
    spawn: (shell, args, options) => {
      const pty = fakePty();
      spawned.push({ shell, args, options, pty });
      return pty;
    },
    mintId: () => `terminal-${++next}`,
  });
  return { registry, spawned };
}

/** A directory with nothing in it requires no trust, so it is a clean subject. */
function openInTemporaryProject(registry, ownerId, overrides = {}) {
  return registry.open({
    cwd: tmpdir(),
    ownerId,
    platform: "darwin",
    env: { SHELL: "/bin/zsh", HOME: tmpdir() },
    cols: 100,
    rows: 30,
    onData: () => {},
    onExit: () => {},
    ...overrides,
  });
}

test("the scrubber does not leak the desktop token into a human's shell", () => {
  const env = scrubTerminalEnvironment({
    PATH: "/usr/bin",
    HOME: "/home/someone",
    OMP_WEB_DESKTOP_TOKEN: "a-secret-nobody-should-see",
    OMP_WEB_DIST_DIR: "/tmp/staged-next",
    OMP_WEB_LAUNCH_CWD: "/home/someone",
    ELECTRON_RUN_AS_NODE: "1",
    NODE_OPTIONS: "--require /tmp/inject.js",
  });

  assert.equal(env.OMP_WEB_DESKTOP_TOKEN, undefined);
  assert.equal(env.OMP_WEB_DIST_DIR, undefined);
  assert.equal(env.OMP_WEB_LAUNCH_CWD, undefined);
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  // The secret must not survive under any name.
  assert.equal(
    Object.values(env).includes("a-secret-nobody-should-see"),
    false,
    "the desktop token survived the scrub under some other name",
  );
  // What a shell genuinely needs is kept, and a pty is declared as one.
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.HOME, "/home/someone");
  assert.equal(env.TERM, "xterm-256color");
});

test("a launch variable added later is scrubbed by the prefix rule", () => {
  const env = scrubTerminalEnvironment({ OMP_WEB_SOMETHING_NEW: "x", PATH: "/usr/bin" });
  assert.equal(env.OMP_WEB_SOMETHING_NEW, undefined);
});

test("an untrusted Project is refused a shell", () => {
  const plan = planTerminalSpawn({
    cwd: "/projects/someone-elses-repository",
    trust: { requiresTrust: true, trusted: false },
    platform: "darwin",
    env: { SHELL: "/bin/zsh" },
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.reason, "untrusted-project");
  assert.equal(plan.shell, undefined, "a refusal must not describe a shell to spawn");
});

test("a trusted Project gets the human's own login shell in the Project directory", () => {
  const plan = planTerminalSpawn({
    cwd: "/projects/mine",
    trust: { requiresTrust: true, trusted: true },
    platform: "darwin",
    env: { SHELL: "/bin/fish", OMP_WEB_DESKTOP_TOKEN: "secret" },
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.shell, "/bin/fish");
  assert.deepEqual(plan.args, ["-l"]);
  assert.equal(plan.cwd, "/projects/mine");
  assert.equal(plan.env.OMP_WEB_DESKTOP_TOKEN, undefined);
});

test("a Project that requires no trust is not gated", () => {
  const plan = planTerminalSpawn({
    cwd: "/projects/plain",
    trust: { requiresTrust: false, trusted: true },
    platform: "linux",
    env: { SHELL: "/bin/bash" },
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.shell, "/bin/bash");
});

test("without a Project there is nowhere to open a shell", () => {
  const plan = planTerminalSpawn({
    cwd: "",
    trust: { requiresTrust: false, trusted: true },
    platform: "darwin",
    env: {},
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.reason, "no-project");
});

test("Windows uses the shell Windows programs read, not SHELL", () => {
  assert.deepEqual(
    resolveLoginShell("win32", { COMSPEC: "C:\\Windows\\system32\\cmd.exe", SHELL: "/bin/zsh" }),
    { shell: "C:\\Windows\\system32\\cmd.exe", args: [] },
  );
});

test("a Terminal belongs to the window that opened it", () => {
  const { registry } = registryWithFakePty();
  const opened = openInTemporaryProject(registry, "window-a");
  assert.equal(opened.ok, true);

  // Another window knows the id but does not own the shell.
  assert.equal(registry.write(opened.id, "window-b", "whoami\r"), false);
  assert.equal(registry.resize(opened.id, "window-b", 80, 24), false);
  assert.equal(registry.close(opened.id, "window-b"), false);

  assert.equal(registry.write(opened.id, "window-a", "whoami\r"), true);
});

test("the renderer's measured size reaches the shell, and a nonsense size does not", () => {
  const { registry, spawned } = registryWithFakePty();
  const opened = openInTemporaryProject(registry, "window-a");

  assert.equal(spawned[0].options.cols, 100);
  assert.equal(spawned[0].options.rows, 30);

  assert.equal(registry.resize(opened.id, "window-a", 120, 40), true);
  assert.deepEqual(spawned[0].pty.resized, [[120, 40]]);

  assert.equal(registry.resize(opened.id, "window-a", 0, 40), false);
  assert.equal(registry.resize(opened.id, "window-a", 90.5, 40), false);
  assert.deepEqual(spawned[0].pty.resized, [[120, 40]], "an unusable size must not reach the shell");
});

test("closing the Tab ends the shell, and so does closing the window", () => {
  const { registry, spawned } = registryWithFakePty();
  const first = openInTemporaryProject(registry, "window-a");
  openInTemporaryProject(registry, "window-a");
  const other = openInTemporaryProject(registry, "window-b");
  assert.equal(registry.size, 3);

  registry.close(first.id, "window-a");
  assert.equal(spawned[0].pty.killed, true);
  assert.equal(registry.size, 2);

  registry.closeAllFor("window-a");
  assert.equal(spawned[1].pty.killed, true);
  assert.equal(registry.size, 1, "another window's shell must survive");
  assert.equal(spawned[2].pty.killed, false);

  registry.closeAllFor("window-b");
  assert.equal(registry.size, 0);
  assert.equal(other.ok, true);
});

test("a shell that exits on its own is forgotten", () => {
  const { registry, spawned } = registryWithFakePty();
  const exits = [];
  const opened = openInTemporaryProject(registry, "window-a", {
    onExit: (id, code) => exits.push([id, code]),
  });

  spawned[0].pty.exitListener({ exitCode: 0 });

  assert.deepEqual(exits, [[opened.id, 0]]);
  assert.equal(registry.size, 0);
  assert.equal(registry.write(opened.id, "window-a", "x"), false);
});

test("an untrusted Project never reaches the spawn", () => {
  const { registry, spawned } = registryWithFakePty();
  // A Project that ships an MCP manifest is one omp would spawn processes
  // from, so it requires trust. With the store pointed at an empty directory
  // there is no grant to find, and the shell must be refused.
  const project = mkdtempSync(join(tmpdir(), "reeve-untrusted-"));
  writeFileSync(join(project, ".mcp.json"), "{}");

  const refused = registry.open({
    cwd: project,
    ownerId: "window-a",
    platform: "darwin",
    env: { SHELL: "/bin/zsh", PI_CODING_AGENT_DIR: join(tmpdir(), "reeve-absent-trust-store") },
    cols: 80,
    rows: 24,
    onData: () => {},
    onExit: () => {},
  });

  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "untrusted-project");
  assert.equal(spawned.length, 0, "a refused Project must not spawn anything");

  rmSync(project, { recursive: true, force: true });
});
