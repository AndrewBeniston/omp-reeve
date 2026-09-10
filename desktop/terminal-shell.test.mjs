import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createTerminalRegistry } = require("./terminal-host.cjs");

/**
 * These exercise a real shell, so they need a runtime whose event loop node-pty
 * can deliver on. Under bun it loads and spawns, and then never fires onData:
 * verified by spawning a shell there and reading nothing at all. The suite runs
 * under bun, so these are skipped there and run under Electron:
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --test desktop/terminal-shell.test.mjs
 *
 * The pure decisions are covered in terminal-host.test.mjs, and the packaged
 * binding is proved by scripts/verify-desktop-package.mjs, so nothing here is
 * the only evidence for anything.
 */
const runsUnderBun = Boolean(globalThis.Bun);
let pty;
try {
  pty = runsUnderBun ? null : require("node-pty");
} catch {
  pty = null;
}
const skip = pty ? false : (runsUnderBun ? "node-pty does not deliver output under bun" : "node-pty is not loadable here");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function liveRegistry() {
  let counter = 0;
  let output = "";
  const exits = [];
  const registry = createTerminalRegistry({
    spawn: (shell, args, options) => pty.spawn(shell, args, options),
    mintId: () => `terminal-${++counter}`,
  });
  const opened = registry.open({
    cwd: tmpdir(),
    ownerId: 1,
    platform: process.platform,
    env: process.env,
    cols: 80,
    rows: 24,
    onData: (_id, data) => { output += data; },
    onExit: (id, code) => exits.push([id, code]),
  });
  return { registry, opened, exits, read: () => output };
}

test("Ctrl+C stops a running command and returns the prompt", { skip }, async () => {
  const { registry, opened, read } = liveRegistry();
  assert.equal(opened.ok, true);

  await wait(900);
  registry.write(opened.id, 1, "sleep 300\r");
  await wait(1200);

  // 0x03 is the byte a terminal sends for Ctrl+C. xterm produces it from the
  // chord, and this is the path it takes to the shell.
  registry.write(opened.id, 1, "\u0003");
  await wait(1200);

  registry.write(opened.id, 1, "echo PROMPT_CAME_BACK\r");
  await wait(1500);

  const output = read();
  assert.ok(output.includes("^C"), "the shell did not receive the interrupt");
  assert.ok(
    output.lastIndexOf("PROMPT_CAME_BACK") > output.lastIndexOf("sleep 300"),
    "the prompt did not come back, so sleep was never interrupted",
  );

  registry.closeAllFor(1);
  assert.equal(registry.size, 0);
});

test("a command runs in the Project directory", { skip }, async () => {
  const { registry, opened, read } = liveRegistry();
  await wait(900);
  registry.write(opened.id, 1, "pwd\r");
  await wait(1500);

  // The shell prints the directory it is actually in, which must be the one the
  // Tab was opened with. macOS resolves the temporary directory to a path under
  // /var/folders, so the expectation is read from the same source, never spelled
  // out here.
  assert.ok(
    read().includes(tmpdir()),
    `the shell did not start in the Project directory. It printed: ${read()}`,
  );
  registry.closeAllFor(1);
});

test("closing a Terminal ends its shell", { skip }, async () => {
  const { registry, opened, exits } = liveRegistry();
  await wait(900);

  assert.equal(registry.close(opened.id, 1), true);
  await wait(800);

  // The shell is gone: the registry has forgotten it, it reported its exit, and
  // it can no longer be written to. An orphaned login shell would otherwise sit
  // there holding the Project directory open.
  assert.equal(registry.size, 0);
  assert.equal(exits.length, 1, "the shell did not actually die");
  assert.equal(exits[0][0], opened.id);
  assert.equal(registry.write(opened.id, 1, "echo still-there\r"), false);
});
