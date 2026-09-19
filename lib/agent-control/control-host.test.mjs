import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { createAgentControlHost, startSessionControlHost } = await jiti.import("./host.ts");
const { AGENT_CONTROL_REPLY_TIMEOUT_MS, createAgentControlChannel } = await jiti.import("./channel.ts");
const { TERMINAL_READ_DESCRIPTION, TERMINAL_READ_TOOL_NAME } = await jiti.import("./controls/terminal-read.ts");
const { AgentSessionWrapper } = await jiti.import("../rpc-manager.ts");

const DESKTOP_ENV = { OMP_WEB_DESKTOP_TOKEN: "a-desktop-launch-token" };

/**
 * Bind one control host the way OMP's extension loader binds it, and return
 * the tools it registered. That list is the Session tool schema for the test.
 */
function bindHost(extensions) {
  const registered = [];
  const handlers = new Map();
  const api = {
    registerTool: (tool) => registered.push(tool),
    on: (event, handler) => handlers.set(event, handler),
  };
  for (const factory of extensions) factory(api);
  return { registered, handlers };
}

function makeEventBus() {
  return { on: () => () => {} };
}

/** The smallest AgentSession the Wrapper accepts. */
function makeInner() {
  const agent = {
    state: {},
    peekSteeringQueue: () => [],
    peekFollowUpQueue: () => [],
    replaceQueues: () => {},
  };
  return {
    sessionId: "session-a",
    sessionFile: "/tmp/omp-web-session-a.jsonl",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    settings: { get: () => undefined, override() {} },
    agent,
    sessionManager: { getEntries: () => [] },
    queuedMessageCount: 0,
    getContextUsage: () => undefined,
    configuredThinkingLevel: () => "off",
    isFastModeEnabled: () => false,
    getQueuedMessages: () => ({ steering: [], followUp: [] }),
    subscribe: () => () => {},
    abort: async () => {},
    abortBash: () => {},
    dispose: async () => {},
  };
}

/**
 * One Session with its control host bound, plus the window's side of the
 * event stream. The window answers with the reply the test supplies.
 */
function startSession(t, options = {}) {
  const channel = createAgentControlChannel({
    surfacePresent: true,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const { registered } = bindHost([createAgentControlHost(channel)]);
  const wrapper = new AgentSessionWrapper(makeInner(), makeEventBus(), ["session-a"]);
  wrapper.attachControlChannel(channel, "session-a");
  const requests = [];
  wrapper.onEvent((event) => {
    if (event.type !== "agent_control_request") return;
    requests.push(event);
    if (!options.answer) return;
    void wrapper.send({ type: "agent_control_response", id: event.id, ...options.answer(event) });
  });
  t.after(() => wrapper.destroy());
  return { channel, requests, tools: registered, wrapper };
}

/** Call one control the way the agent loop calls a registered tool. */
function callControl(tools, name, params = {}) {
  const tool = tools.find((entry) => entry.name === name);
  assert.ok(tool, "the Session tool schema holds " + name);
  return tool.execute("tool-call-1", params, undefined, undefined, {});
}

test("the browser build registers no control", () => {
  assert.equal(startSessionControlHost({}), null);
  assert.equal(startSessionControlHost({ OMP_WEB_DESKTOP_TOKEN: "" }), null);
});

test("the desktop build registers the Terminal read control on the Session", () => {
  const host = startSessionControlHost(DESKTOP_ENV);
  assert.ok(host);
  const { registered } = bindHost(host.extensions);
  assert.deepEqual(registered.map((tool) => tool.name), [TERMINAL_READ_TOOL_NAME]);
  const control = registered[0];
  // Eager, so the control is in the tool schema from the first turn.
  assert.equal(control.loadMode, "essential");
  // A read needs no approval, and the control sends nothing to a shell.
  assert.equal(control.approval, "read");
});

test("the control description fits the instruction budget", () => {
  // One control description holds at most 400 characters.
  assert.ok(
    TERMINAL_READ_DESCRIPTION.length <= 400,
    "the description is " + TERMINAL_READ_DESCRIPTION.length + " characters",
  );
  // It names every value the control can return, so the model guesses none.
  for (const reason of ["absent", "no_window", "unavailable"]) {
    assert.ok(TERMINAL_READ_DESCRIPTION.includes(reason), "the description names " + reason);
  }
});

test("a Session lists the control, calls it, and reads the Terminal", async (t) => {
  const session = startSession(t, {
    answer: () => ({ ok: true, value: { attached: true, cwd: "/work/project", shell: "/bin/zsh" } }),
  });
  const result = await callControl(session.tools, TERMINAL_READ_TOOL_NAME);
  assert.equal(result.content[0].text, "attached=true cwd=/work/project shell=/bin/zsh");
  assert.equal(result.details.attached, true);
  assert.equal(session.requests.length, 1);
});

test("the control returns no shell identifier", async (t) => {
  const session = startSession(t, {
    answer: () => ({
      ok: true,
      value: { attached: true, cwd: "/work/project", shell: "/bin/zsh", id: "pty-7" },
    }),
  });
  const result = await callControl(session.tools, TERMINAL_READ_TOOL_NAME);
  assert.ok(!result.content[0].text.includes("pty-7"));
  assert.deepEqual(Object.keys(result.details), ["attached"]);
});

test("a Session with no Terminal returns the absent value", async (t) => {
  const session = startSession(t, { answer: () => ({ ok: false, reason: "absent" }) });
  const result = await callControl(session.tools, TERMINAL_READ_TOOL_NAME);
  assert.equal(result.content[0].text, "attached=false reason=absent");
  assert.equal(result.details.reason, "absent");
});

test("a build without the surface returns unavailable and emits nothing", async (t) => {
  const channel = createAgentControlChannel({ surfacePresent: false });
  const { registered } = bindHost([createAgentControlHost(channel)]);
  const wrapper = new AgentSessionWrapper(makeInner(), makeEventBus(), ["session-a"]);
  wrapper.attachControlChannel(channel, "session-a");
  const requests = [];
  wrapper.onEvent((event) => requests.push(event));
  t.after(() => wrapper.destroy());

  const result = await callControl(registered, TERMINAL_READ_TOOL_NAME);
  assert.equal(result.content[0].text, "attached=false reason=unavailable");
  assert.equal(requests.length, 0);
});

test("a call that names another Session returns unavailable and changes nothing", async (t) => {
  const session = startSession(t, {
    answer: () => ({ ok: true, value: { attached: true, cwd: "/work/project", shell: "/bin/zsh" } }),
  });
  const result = await callControl(session.tools, TERMINAL_READ_TOOL_NAME, { session: "session-b" });
  assert.equal(result.content[0].text, "attached=false reason=unavailable");
  assert.equal(session.requests.length, 0);
});

test("a call that names its own Session is answered", async (t) => {
  const session = startSession(t, {
    answer: () => ({ ok: true, value: { attached: true, cwd: "/work/project", shell: "/bin/zsh" } }),
  });
  const result = await callControl(session.tools, TERMINAL_READ_TOOL_NAME, { session: "session-a" });
  assert.equal(result.content[0].text, "attached=true cwd=/work/project shell=/bin/zsh");
});

test("a reply that never arrives returns no_window inside the bound", async (t) => {
  assert.equal(AGENT_CONTROL_REPLY_TIMEOUT_MS, 5000);
  const session = startSession(t, { timeoutMs: 60 });
  const startedAt = Date.now();
  const result = await callControl(session.tools, TERMINAL_READ_TOOL_NAME);
  assert.equal(result.content[0].text, "attached=false reason=no_window");
  assert.ok(Date.now() - startedAt < AGENT_CONTROL_REPLY_TIMEOUT_MS);
  assert.equal(session.requests.length, 1);
});

test("a channel with no override waits the 5 second bound", async () => {
  // The behaviour above runs on a short bound, so this holds the default to
  // the same constant rather than making every run wait 5 seconds.
  const source = await readFile(new URL("./channel.ts", import.meta.url), "utf8");
  assert.match(source, /this\.timeoutMs = options\.timeoutMs \?\? AGENT_CONTROL_REPLY_TIMEOUT_MS;/);
});

test("a Session that no window shows returns no_window", async (t) => {
  const channel = createAgentControlChannel({ surfacePresent: true });
  const { registered } = bindHost([createAgentControlHost(channel)]);
  t.after(() => channel.close());
  // Nothing attached an event stream, so no window can ever see the request.
  const result = await callControl(registered, TERMINAL_READ_TOOL_NAME);
  assert.equal(result.content[0].text, "attached=false reason=no_window");
});

test("the host blocks a control call once its Session ends", () => {
  const channel = createAgentControlChannel({ surfacePresent: true });
  const { handlers } = bindHost([createAgentControlHost(channel)]);
  const gate = handlers.get("tool_call");
  assert.ok(gate);
  assert.equal(gate({ toolName: TERMINAL_READ_TOOL_NAME }), undefined);
  channel.close();
  const blocked = gate({ toolName: TERMINAL_READ_TOOL_NAME });
  assert.equal(blocked.block, true);
  assert.ok(blocked.reason.length > 0);
  // A tool that is not a control is never this host's business.
  assert.equal(gate({ toolName: "bash" }), undefined);
});

test("a waiting control call is answered when the Session ends", async (t) => {
  const session = startSession(t, { timeoutMs: 60000 });
  const pending = callControl(session.tools, TERMINAL_READ_TOOL_NAME);
  session.wrapper.destroy();
  const result = await pending;
  assert.equal(result.content[0].text, "attached=false reason=unavailable");
});
