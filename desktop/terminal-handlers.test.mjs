import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

/**
 * Run the real terminal handlers against fakes.
 *
 * main.cjs requires Electron at its top level and cannot be imported here, so
 * the one function under test is lifted out of the source and evaluated with
 * its dependencies supplied. That is uglier than an import, and it is worth it:
 * it tests what the file actually does rather than what it appears to say.
 */
function loadTerminalHandlers() {
  const source = readFileSync(join(import.meta.dir, "main.cjs"), "utf8");
  const start = source.indexOf("function registerTerminalHandlers()");
  assert.ok(start >= 0, "registerTerminalHandlers is gone from main.cjs");
  const end = source.indexOf("\n}", source.indexOf("omp-desktop:terminal-close", start));
  const body = source.slice(start, end + 2);

  const handlers = new Map();
  const logged = [];
  const context = {
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    isTrustedRendererUrl: () => true,
    desktopUrl: "http://127.0.0.1:30142/",
    appendDesktopLog: (line) => logged.push(line),
    randomUUID: (() => { let n = 0; return () => `id-${++n}`; })(),
    loadPty: () => ({ ok: true, pty: { spawn: () => fakePty() } }),
    createTerminalRegistry: null,
    terminalRegistry: null,
    process: { platform: "darwin", env: {} },
    Number,
    Boolean,
    WeakSet,
    console,
  };
  context.globalThis = context;
  vm.createContext(context);
  return { context, handlers, logged, body };
}

function fakePty() {
  const pty = {
    onData() {},
    onExit() {},
    write() {},
    resize() {},
    kill() {},
  };
  return pty;
}

/** A window, as far as these handlers are concerned. */
function fakeContents(id) {
  const contents = new EventEmitter();
  contents.id = id;
  contents.isDestroyed = () => false;
  contents.send = () => {};
  return contents;
}

test("a window binds its shell cleanup once, however many Terminals it opens", () => {
  const { context, handlers, body } = loadTerminalHandlers();
  // The registry is supplied whole: this test is about the handlers, not it.
  const closed = [];
  context.createTerminalRegistry = () => ({
    open: () => ({ ok: true, id: "terminal", shell: "/bin/zsh", cwd: "/projects/mine" }),
    write: () => true,
    resize: () => true,
    close: () => true,
    closeAllFor: (ownerId) => closed.push(ownerId),
  });
  vm.runInContext(`${body}\nregisterTerminalHandlers();`, context);

  const open = handlers.get("omp-desktop:terminal-open");
  const contents = fakeContents(7);
  for (let i = 0; i < 12; i += 1) {
    open({ sender: contents, senderFrame: { url: "http://127.0.0.1:30142/" } }, { cwd: "/projects/mine" });
  }

  // Node warns about a leak at eleven listeners on one emitter. Before this was
  // bound once per window, twelve Tabs meant twelve listeners and a warning.
  assert.equal(
    contents.listenerCount("destroyed"),
    1,
    "each Terminal added its own window listener instead of sharing one",
  );

  contents.emit("destroyed");
  assert.deepEqual(closed, [7], "the window did not end the shells it owned");
});

test("a request that did not come from the application is refused a shell", () => {
  const { context, handlers, body } = loadTerminalHandlers();
  let spawned = 0;
  context.isTrustedRendererUrl = () => false;
  context.createTerminalRegistry = () => ({
    open: () => { spawned += 1; return { ok: true, id: "terminal" }; },
    write: () => true, resize: () => true, close: () => true, closeAllFor: () => {},
  });
  vm.runInContext(`${body}\nregisterTerminalHandlers();`, context);

  const event = { sender: fakeContents(1), senderFrame: { url: "https://example.com/" } };
  // The refusal is built inside the handlers' own realm, so compare by value.
  assert.deepEqual(
    { ...handlers.get("omp-desktop:terminal-open")(event, { cwd: "/projects/mine" }) },
    { ok: false, reason: "untrusted-sender" },
  );
  assert.equal(spawned, 0, "an untrusted sender reached the registry");
  assert.equal(handlers.get("omp-desktop:terminal-write")(event, { id: "terminal", data: "x" }), false);
  assert.equal(handlers.get("omp-desktop:terminal-resize")(event, { id: "terminal", cols: 80, rows: 24 }), false);
  assert.equal(handlers.get("omp-desktop:terminal-close")(event, { id: "terminal" }), false);
});

test("a binding that will not load costs a Terminal, not the application", () => {
  const { context, handlers, logged, body } = loadTerminalHandlers();
  context.loadPty = () => ({ ok: false, error: "wrong ABI" });
  context.createTerminalRegistry = () => { throw new Error("the registry must not be built without a binding"); };
  vm.runInContext(`${body}\nregisterTerminalHandlers();`, context);

  const event = { sender: fakeContents(1), senderFrame: { url: "http://127.0.0.1:30142/" } };
  assert.deepEqual(
    { ...handlers.get("omp-desktop:terminal-open")(event, { cwd: "/projects/mine" }) },
    { ok: false, reason: "pty-unavailable" },
  );
  assert.ok(logged.some((line) => line.includes("wrong ABI")), "the reason never reached the log");
});

test("one window cannot reach another window's shell", () => {
  const { context, handlers, body } = loadTerminalHandlers();
  const writes = [];
  context.createTerminalRegistry = () => ({
    open: () => ({ ok: true, id: "terminal" }),
    write: (id, ownerId) => { writes.push(ownerId); return true; },
    resize: () => true, close: () => true, closeAllFor: () => {},
  });
  vm.runInContext(`${body}\nregisterTerminalHandlers();`, context);

  const first = { sender: fakeContents(1), senderFrame: { url: "http://127.0.0.1:30142/" } };
  const second = { sender: fakeContents(2), senderFrame: { url: "http://127.0.0.1:30142/" } };
  handlers.get("omp-desktop:terminal-open")(first, { cwd: "/projects/mine" });
  handlers.get("omp-desktop:terminal-write")(second, { id: "terminal", data: "whoami\r" });

  // The owner the registry is asked about is always the sender, never anything
  // the renderer supplied. The registry does the refusing.
  assert.deepEqual(writes, [2]);
});
