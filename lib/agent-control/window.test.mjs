import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { answerAgentControlRequest } = await jiti.import("./window.ts");
const { selectSessionTerminal, terminalReadReply } = await jiti.import("./terminal-snapshot.ts");
const { TERMINAL_READ_CONTROL } = await jiti.import("./controls/terminal-read.ts");

function terminal(overrides) {
  return {
    tabId: "terminal:1",
    cwd: "/work/project",
    shell: "/bin/zsh",
    live: true,
    openedAt: 1000,
    ...overrides,
  };
}

function request(control) {
  return { type: "agent_control_request", id: "r1", sessionId: "session-a", control, params: {} };
}

test("the window reports the working directory and the shell of its Terminal", () => {
  const reply = terminalReadReply([terminal({})], "terminal:1");
  assert.deepEqual(reply, {
    ok: true,
    value: { attached: true, cwd: "/work/project", shell: "/bin/zsh" },
  });
});

test("the reply carries no shell identifier", () => {
  const reply = terminalReadReply([terminal({})], "terminal:1");
  assert.deepEqual(Object.keys(reply.value).sort(), ["attached", "cwd", "shell"]);
});

test("a window with several Terminals reads the one the human is looking at", () => {
  const terminals = [
    terminal({ tabId: "terminal:1", cwd: "/work/one", openedAt: 1000 }),
    terminal({ tabId: "terminal:2", cwd: "/work/two", openedAt: 2000 }),
  ];
  assert.equal(selectSessionTerminal(terminals, "terminal:1").cwd, "/work/one");
});

test("a window with no active Terminal reads the most recent one", () => {
  const terminals = [
    terminal({ tabId: "terminal:1", cwd: "/work/one", openedAt: 1000 }),
    terminal({ tabId: "terminal:2", cwd: "/work/two", openedAt: 2000 }),
  ];
  assert.equal(selectSessionTerminal(terminals, null).cwd, "/work/two");
  // A file Tab is active, so no Terminal is.
  assert.equal(selectSessionTerminal(terminals, "file:readme").cwd, "/work/two");
});

test("a shell that exited is not read", () => {
  const terminals = [
    terminal({ tabId: "terminal:1", cwd: "/work/one", live: false, openedAt: 2000 }),
    terminal({ tabId: "terminal:2", cwd: "/work/two", openedAt: 1000 }),
  ];
  assert.equal(selectSessionTerminal(terminals, "terminal:1").cwd, "/work/two");
});

test("a window with no Terminal answers absent", () => {
  assert.deepEqual(terminalReadReply([], null), { ok: false, reason: "absent" });
  assert.deepEqual(
    terminalReadReply([terminal({ live: false })], "terminal:1"),
    { ok: false, reason: "absent" },
  );
});

test("the window answers the Terminal read control", () => {
  const reply = answerAgentControlRequest(request(TERMINAL_READ_CONTROL), [terminal({})], "terminal:1");
  assert.equal(reply.ok, true);
  assert.equal(reply.value.shell, "/bin/zsh");
});

test("a control this window does not serve answers unavailable", () => {
  const reply = answerAgentControlRequest(request("open_tab"), [terminal({})], "terminal:1");
  assert.deepEqual(reply, { ok: false, reason: "unavailable" });
});

test("the Terminal view reports its shell, its directory and its live state", async () => {
  const source = await readFile(
    new URL("../../components/terminal/TerminalTabs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /onStateChange\?: \(tabId: string, state: TerminalTabState \| null\) => void/);
  // Reported when the shell starts, with the directory the shell really got.
  assert.match(source, /cwd: opened\.cwd/);
  assert.match(source, /shell: opened\.shell/);
  assert.match(source, /live: true/);
  // Withdrawn when the shell exits, and when the Tab closes.
  assert.equal(source.match(/stateRef\.current\?\.\(tab\.id, null\)/g).length, 2);
});

test("the shell supplies the control answer for the Session it shows", async () => {
  const source = await readFile(new URL("../../components/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /onStateChange=\{handleTerminalState\}/);
  assert.match(source, /onAgentControlRequest=\{handleAgentControlRequest\}/);
  assert.match(source, /answerAgentControlRequest\(/);
});
