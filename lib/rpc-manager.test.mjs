import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadSubject() {
  try {
    const { createJiti } = await import("jiti");
    return createJiti(import.meta.url).import("./rpc-manager.ts");
  } catch {
    return import("./rpc-manager.ts");
  }
}

const { AgentSessionWrapper, resolveForkEntryId } = await loadSubject();

function makeEventBus() {
  return { on: () => () => {} };
}

function makeInner(overrides = {}) {
  let queues = { steering: [], followUp: [] };
  const queueAgent = {
    state: {},
    peekSteeringQueue: () => queues.steering,
    peekFollowUpQueue: () => queues.followUp,
    replaceQueues: (steering, followUp) => {
      queues = { steering: [...steering], followUp: [...followUp] };
    },
  };
  const inner = Object.assign({
    sessionId: "old-session",
    sessionFile: "/tmp/omp-web-old-session.jsonl",
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    model: undefined,
    settings: {
      get: (path) => path === "tools.approvalMode" ? "yolo" : undefined,
      override() {},
    },
    agent: queueAgent,
    sessionManager: {
      getEntries: () => [],
    },
    extensionRunner: undefined,
    queuedMessageCount: 0,
    getContextUsage: () => undefined,
    configuredThinkingLevel: () => "off",
    isFastModeEnabled: () => false,
    setFastMode: () => true,
    getQueuedMessages: () => ({ steering: [], followUp: [] }),
    clearQueue: () => {
      const cleared = queues;
      queues = { steering: [], followUp: [] };
      return cleared;
    },
    followUp: async (text) => {
      queues.followUp.push({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    },
    maybeStartTitleGeneration: () => {},
    steer: async (text) => {
      queues.steering.push({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    },
    prompt: async (text, options) => {
      if (options?.streamingBehavior === "steer") {
        queues.steering.push({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
      }
      if (options?.streamingBehavior === "followUp") {
        queues.followUp.push({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
      }
      return true;
    },
    subscribe: () => () => {},
    abort: async () => {},
    abortBash: () => {},
    dispose: async () => {},
    handoff: async () => undefined,
  }, overrides);
  inner.agent = {
    ...queueAgent,
    ...(overrides.agent ?? {}),
    state: { ...queueAgent.state, ...(overrides.agent?.state ?? {}) },
  };
  return inner;
}

test("RPC session startup reuses the shared omp runtime instead of a per-session one", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));

  assert.match(startupSource, /getOmpRuntime\(\)/);
  assert.match(startupSource, /getSettingsForCwd\(sessionCwd\)/);
  assert.match(startupSource, /modelRegistry,/);
});

test("RPC session startup gates untrusted project code before creating the session", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));
  const discoverIndex = startupSource.indexOf("discoverSessionExtensionPaths(");
  const gateIndex = startupSource.indexOf("untrustedProjectSessionOptions(");
  const createIndex = startupSource.indexOf("createAgentSession(");

  assert.ok(discoverIndex >= 0);
  assert.ok(gateIndex > discoverIndex);
  assert.ok(createIndex > gateIndex);
  assert.match(startupSource, /discoverCustomToolPaths\(\[\], sessionCwd\)/);
  assert.match(startupSource, /\.\.\.\(untrusted \?\? \{\}\)/);
});

test("RPC session startup applies SYSTEM.md / APPEND_SYSTEM.md to the session options", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));
  const resolveIndex = startupSource.indexOf("resolveSessionSystemPrompts(sessionCwd)");
  const applyIndex = startupSource.indexOf("applyResolvedSystemPromptInputs(");
  const createIndex = startupSource.indexOf("createAgentSession(sessionOptions)");

  assert.ok(resolveIndex >= 0);
  assert.ok(applyIndex > resolveIndex);
  assert.ok(createIndex > applyIndex);
  assert.match(
    startupSource,
    /applyResolvedSystemPromptInputs\(sessionOptions, systemPrompts\.systemPrompt, systemPrompts\.appendPrompt\)/,
  );
});

test("RPC session startup resolves and passes the SDK-native enabled model scope", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));
  const resolveIndex = startupSource.indexOf("resolveVisibleModels(");
  const createIndex = startupSource.indexOf("createAgentSession(");

  assert.ok(resolveIndex >= 0);
  assert.ok(createIndex > resolveIndex);
  assert.match(startupSource, /selectInitialModelScope\(/);
  assert.match(startupSource, /scopedModels: initial\.scopedModels/);
  assert.match(startupSource, /model: initial\.model/);
  assert.match(startupSource, /thinkingLevel: initial\.thinkingLevel/);
});

test("RPC session startup treats only sessions with messages as continuing", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));

  assert.match(
    startupSource,
    /const hasExistingMessages = sessionManager\.buildSessionContext\(\)\.messages\.length > 0/,
  );
  assert.match(startupSource, /const initial = hasExistingMessages/);
  assert.doesNotMatch(startupSource, /const initial = sessionFile/);
  assert.doesNotMatch(startupSource, /const hasExistingMessages = sessionManager\.getBranch\(\)/);
});

test("RPC prompts start OMP automatic title generation before the model prompt", async () => {
  const order = [];
  const inner = makeInner({
    maybeStartTitleGeneration: (message) => order.push(`title:${message}`),
    prompt: async (message) => {
      order.push(`prompt:${message}`);
      return true;
    },
  });
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());

  await wrapper.send({ type: "prompt", message: "Investigate session naming" });
  await Promise.resolve();

  assert.deepEqual(order, [
    "title:Investigate session naming",
    "prompt:Investigate session naming",
  ]);
  wrapper.destroy();
});

test("RPC wrappers publish OMP title changes and remove the listener during teardown", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startSource = source.slice(
    source.indexOf("  start(): void"),
    source.indexOf("  setForceEmptySystemPrompt"),
  );
  const destroySource = source.slice(
    source.indexOf("  destroy(): void"),
    source.indexOf("  async shutdown(): Promise<void>"),
  );

  assert.match(startSource, /onSessionNameChanged/);
  assert.match(startSource, /type: "session_name_changed"/);
  assert.match(startSource, /name: this\.inner\.sessionManager\.getSessionName\(\)/);
  assert.match(destroySource, /this\.unsubscribeSessionName\?\.\(\)/);
});

test("RPC wrappers deliver the generated Session title event", () => {
  let nameListener = () => {};
  let listenerRemoved = false;
  const inner = makeInner({
    sessionManager: {
      getEntries: () => [],
      getSessionName: () => "Generated Session title",
      onSessionNameChanged: (listener) => {
        nameListener = listener;
        return () => { listenerRemoved = true; };
      },
    },
  });
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  const events = [];
  wrapper.onEvent((event) => events.push(event));
  wrapper.start();

  nameListener();

  assert.deepEqual(events.at(-1), {
    type: "session_name_changed",
    name: "Generated Session title",
  });
  wrapper.destroy();
  assert.equal(listenerRemoved, true);
});

test("RPC session startup opens an existing session file only once and trusts its cwd", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));
  const routeSource = await readFile(new URL("../app/api/agent/[id]/route.ts", import.meta.url), "utf8");
  const eventRouteSource = await readFile(new URL("../app/api/agent/[id]/events/route.ts", import.meta.url), "utf8");
  const autoNameRouteSource = await readFile(new URL("../app/api/sessions/[id]/auto-name/route.ts", import.meta.url), "utf8");

  assert.equal((startupSource.match(/SessionManager\.open\(/g) ?? []).length, 1);
  assert.match(startupSource, /const sessionCwd = sessionManager\.getCwd\(\)/);
  assert.match(startupSource, /untrustedProjectSessionOptions\(sessionCwd, agentDir, \{ extensionPaths, customToolPaths \}\)/);
  assert.match(startupSource, /cwd: sessionCwd/);
  for (const route of [routeSource, eventRouteSource, autoNameRouteSource]) {
    assert.doesNotMatch(route, /SessionManager\.open\(/);
  }
});

test("RPC wrapper avoids per-chunk idle and running-state maintenance", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startSource = source.slice(
    source.indexOf("  start(): void"),
    source.indexOf("  setForceEmptySystemPrompt"),
  );
  const notifySource = source.slice(
    source.indexOf("export function notifyRunningChange"),
    source.indexOf("export async function startRpcSession"),
  );

  assert.match(startSource, /IDLE_RESET_EVENT_TYPES\.has\(event\.type\)/);
  assert.match(startSource, /RUNNING_STATE_EVENT_TYPES\.has\(event\.type\)/);
  assert.doesNotMatch(startSource, /subscribe\(\(event: AgentEvent\) => \{\s*this\.resetIdleTimer\(\)/);
  assert.match(notifySource, /if \(listeners\.size === 0\)/);
  assert.match(notifySource, /lastRunningSnapshot = ""/);
});

test("normal session teardown paths use graceful extension shutdown", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const deleteRouteSource = await readFile(new URL("../app/api/sessions/[id]/route.ts", import.meta.url), "utf8");
  const trustRouteSource = await readFile(new URL("../app/api/project-trust/route.ts", import.meta.url), "utf8");
  const idleSource = source.slice(
    source.indexOf("  private resetIdleTimer"),
    source.indexOf("  private persistBashOnlySession"),
  );
  const forkSource = source.slice(
    source.indexOf('case "fork"'),
    source.indexOf('case "navigate_tree"'),
  );

  assert.match(idleSource, /this\.shutdown\(\)/);
  assert.match(forkSource, /await this\.shutdownAfterCommittedFork\(newSessionId\)/);
  assert.match(deleteRouteSource, /await getRpcSession\(id\)\?\.shutdown\(\)/);
  assert.match(trustRouteSource, /await destroyRpcSessionsForCwd\(result\.cwd\)/);
});

test("new-session route applies model scope during construction instead of follow-up commands", async () => {
  const source = await readFile(new URL("../app/api/agent/new/route.ts", import.meta.url), "utf8");

  assert.match(source, /initialModel: \{ provider, modelId \}/);
  assert.match(source, /thinkingLevel: explicitThinkingLevel/);
  assert.doesNotMatch(source, /session\.send\(\{ type: "set_model"/);
  assert.doesNotMatch(source, /session\.send\(\{ type: "set_thinking_level"/);
  assert.match(source, /model: state\.model/);
  assert.match(source, /thinkingLevel: state\.thinkingLevel/);
});

test("RPC session startup persists explicit preferences without replaying setters", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));

  assert.match(startupSource, /persistExplicitStartupPreferences\(\s*runtime\.settings/);
  assert.match(startupSource, /modelDefaultChanged\) invalidateModelsCache\(\)/);
});

test("custom extension UI receives the fixed headless terminal facade", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const customUiSource = source.slice(
    source.indexOf("private requestExtensionCustomUi"),
    source.indexOf("private requestExtensionUi"),
  );

  assert.match(customUiSource, /createHeadlessCustomUiTui\(/);
  assert.match(customUiSource, /width,/);
});

test("reloading a session invalidates the models cache", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const reloadSource = source.slice(
    source.indexOf('case "reload"'),
    source.indexOf('case "abort_compaction"'),
  );

  assert.match(reloadSource, /await this\.inner\.reload\(\)/);
  assert.match(reloadSource, /this\.applyForcedEmptySystemPrompt\(\);\s*invalidateModelsCache\(\)/);
});

test("RPC command bridge dispatches omp text-mode slash builtins", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const commandSource = source.slice(
    source.indexOf('case "execute_slash_command"'),
    source.indexOf('case "set_tools"'),
  );

  assert.match(commandSource, /executeAcpBuiltinSlashCommand\(/);
  assert.match(commandSource, /output\.push\(text\)/);
  assert.match(commandSource, /handled: true/);
  assert.match(commandSource, /prompt: result\.prompt/);
});

test("RPC collaboration uses one adapter for command, state, lifetime, and cleanup", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");

  assert.match(source, /private readonly collaboration: CollaborationAdapter/);
  assert.match(source, /case "collab"/);
  assert.match(source, /return this\.collaboration\.execute/);
  assert.match(source, /collaboration: this\.collaboration\.snapshot\(\)/);
  assert.match(source, /this\.collaboration\.isActive\(\)/);
  assert.match(source, /await this\.collaboration\.stop\("session closed"\)/);
});

test("RPC command discovery restores OMP icons and source fallbacks", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const discoverySource = source.slice(
    source.indexOf("function defaultSlashCommandIcon"),
    source.indexOf("export class AgentSessionWrapper"),
  );

  assert.match(discoverySource, /BUILTIN_SLASH_COMMAND_DEFS\.find/);
  assert.match(discoverySource, /icon: slashCommandIcon\(browserCommand\)/);
  assert.match(discoverySource, /source === "skill"\) return "skill"/);
  assert.match(discoverySource, /source === "extension"\) return "extension"/);
  assert.match(discoverySource, /source === "mcp_prompt"\) return "mcp"/);
  assert.match(discoverySource, /return "prompt"/);
});
test("RPC state retains completed subagent snapshots for history", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const stateSource = source.slice(
    source.indexOf('case "get_state"'),
    source.indexOf('case "get_subagent_messages"'),
  );

  assert.match(source, /private readonly subagentHistory = new Map<string, SubagentSnapshot>\(\)/);
  assert.match(source, /private getSubagentSnapshots\(\)/);
  assert.match(stateSource, /subagents: this\.getSubagentSnapshots\(\)/);
  assert.match(source, /this\.subagentHistory\.clear\(\)/);
  assert.match(source, /this\.subagents\.getSubagents\(\)\.length > 0/);
});

test("effort and fast-mode changes invalidate cached Session metadata", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const fastSource = source.slice(source.indexOf('case "set_fast_mode"'), source.indexOf('case "cycle_thinking_level"'));
  const cycleSource = source.slice(source.indexOf('case "cycle_thinking_level"'), source.indexOf('case "compact"'));

  assert.match(fastSource, /invalidateSessionListCache\(\)/);
  assert.match(cycleSource, /invalidateSessionListCache\(\)/);
});

test("AgentSessionLike declares the handoff member matching the SDK result", async () => {
  const ompTypesSource = await readFile(new URL("./omp-types.ts", import.meta.url), "utf8");
  const likeSource = ompTypesSource.slice(ompTypesSource.indexOf("export interface AgentSessionLike"));

  // The structural view mirrors the SDK's session.handoff(): custom instructions
  // in, a document/savedPath result out, undefined meaning cancelled.
  assert.match(
    likeSource,
    /handoff\(customInstructions\?: string\): Promise<\{ document: string; savedPath\?: string \} \| undefined>;/,
  );
});

test("latest-session fork resolution is atomic and preserves explicit tree targets", () => {
  const branch = [
    { id: "user-old", type: "message", message: { role: "user" } },
    { id: "assistant", type: "message", message: { role: "assistant" } },
    { id: "custom", type: "custom" },
    { id: "user-latest", type: "message", message: { role: "user" } },
  ];

  assert.equal(resolveForkEntryId(branch), "user-latest");
  assert.equal(resolveForkEntryId(branch, "explicit-entry"), "explicit-entry");
  assert.equal(resolveForkEntryId([{ id: "assistant", type: "message", message: { role: "assistant" } }]), undefined);
});

test("RPC handoff reports distinct running state and rejects concurrent mutations", async () => {
  let finishHandoff;
  const inner = makeInner({
    handoff: () => new Promise((resolve) => {
      finishHandoff = resolve;
    }),
  });
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  const handoff = wrapper.send({ type: "handoff", customInstructions: "focus" });
  await Promise.resolve();

  const state = await wrapper.send({ type: "get_state" });
  assert.equal(state.isHandoffRunning, true);
  assert.equal(state.isCompacting, false);
  await assert.rejects(
    wrapper.send({ type: "fork" }),
    /Cannot modify the session while a handoff is in progress/,
  );
  await assert.rejects(
    wrapper.send({ type: "handoff" }),
    /Cannot modify the session while a handoff is in progress/,
  );

  finishHandoff(undefined);
  assert.deepEqual(await handoff, { cancelled: true });
  assert.equal(wrapper.isAlive(), true);
  wrapper.destroy();
});

test("RPC state reports Auto instead of its effective effort", async () => {
  const inner = makeInner({
    agent: { state: { thinkingLevel: "medium" } },
    configuredThinkingLevel: () => "auto",
  });
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());

  const state = await wrapper.send({ type: "get_state" });

  assert.equal(state.thinkingLevel, "auto");
  assert.equal(state.approvalMode, "yolo");
  wrapper.destroy();
});

test("RPC state exposes stable queue items with Codex row actions", async () => {
  const inner = makeInner({ isStreaming: true });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "First" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Second" }], timestamp: 2 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());

  const initial = await wrapper.send({ type: "get_state" });
  const [first, second] = initial.queuedMessages.items;
  assert.deepEqual(initial.queuedMessages.items.map((item) => item.text), ["First", "Second"]);

  await wrapper.send({ type: "reorder_queue_items", ids: [second.id, first.id] });
  const reordered = await wrapper.send({ type: "get_state" });
  assert.deepEqual(reordered.queuedMessages.items.map((item) => item.text), ["Second", "First"]);

  const deleted = await wrapper.send({ type: "delete_queue_item", id: second.id });
  assert.ok(deleted.undoToken);
  assert.deepEqual((await wrapper.send({ type: "get_state" })).queuedMessages.items.map((item) => item.text), ["First"]);

  await wrapper.send({ type: "undo_delete_queue_item", undoToken: deleted.undoToken });
  assert.deepEqual((await wrapper.send({ type: "get_state" })).queuedMessages.items.map((item) => item.text), ["Second", "First"]);
  wrapper.destroy();
});

test("RPC queue editing removes the row and restores its position", async () => {
  const inner = makeInner({ isStreaming: true });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "First" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Second" }], timestamp: 2 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  const [first] = (await wrapper.send({ type: "get_state" })).queuedMessages.items;

  const draft = await wrapper.send({ type: "begin_queue_edit", id: first.id });
  assert.equal(draft.text, "First");
  assert.deepEqual((await wrapper.send({ type: "get_state" })).queuedMessages.items.map((item) => item.text), ["Second"]);

  await wrapper.send({ type: "complete_queue_edit", editToken: draft.editToken, message: "Edited" });
  assert.deepEqual((await wrapper.send({ type: "get_state" })).queuedMessages.items.map((item) => item.text), ["Edited", "Second"]);
  wrapper.destroy();
});

test("RPC Steer moves one follow-up without clearing the queue", async () => {
  const inner = makeInner({ isStreaming: true });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "First" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Second" }], timestamp: 2 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  const [, second] = (await wrapper.send({ type: "get_state" })).queuedMessages.items;

  await wrapper.send({ type: "send_queue_item_now", id: second.id });

  const state = await wrapper.send({ type: "get_state" });
  assert.deepEqual(state.queuedMessages.items.map(({ kind, text }) => ({ kind, text })), [
    { kind: "steer", text: "Second" },
    { kind: "followUp", text: "First" },
  ]);
  wrapper.destroy();
});

test("RPC Stop pauses steering and follow-up messages without auto-resume", async () => {
  let abortOptions;
  const inner = makeInner({
    isStreaming: true,
    abort: async (options) => {
      abortOptions = options;
      inner.isStreaming = false;
    },
  });
  inner.agent.replaceQueues(
    [{ role: "user", content: [{ type: "text", text: "Steering" }], timestamp: 1 }],
    [{ role: "user", content: [{ type: "text", text: "Later" }], timestamp: 2 }],
  );
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());

  await wrapper.send({ type: "abort" });

  assert.deepEqual(abortOptions, { reason: "Interrupted by user" });
  const state = await wrapper.send({ type: "get_state" });
  assert.equal(state.queuedMessages.paused, true);
  assert.deepEqual(state.queuedMessages.items.map(({ kind, text }) => ({ kind, text })), [
    { kind: "followUp", text: "Steering" },
    { kind: "followUp", text: "Later" },
  ]);
  wrapper.destroy();
});

test("RPC resolves a paused queue before a new message", async () => {
  const inner = makeInner();
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "First" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Second" }], timestamp: 2 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.queuePaused = true;

  const preserved = await wrapper.send({ type: "resolve_paused_queue_submission", clearQueue: false });
  assert.equal(preserved.paused, false);
  assert.deepEqual(preserved.items.map((item) => item.text), ["First", "Second"]);

  wrapper.queuePaused = true;
  const cleared = await wrapper.send({ type: "resolve_paused_queue_submission", clearQueue: true });
  assert.equal(cleared.paused, false);
  assert.deepEqual(cleared.items, []);
  wrapper.destroy();
});

test("RPC handoff compacts in place and keeps the session serving", async () => {
  let receivedInstructions;
  const inner = makeInner({
    handoff: async (instructions) => {
      receivedInstructions = instructions;
      return { document: "handoff context" };
    },
  });
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());

  // omp 18 commits the handoff document as this session's compaction entry
  // instead of minting a replacement, so there is no id to hand back and the
  // wrapper must survive to keep serving the same session.
  assert.deepEqual(
    await wrapper.send({ type: "handoff", customInstructions: "focus exactly here" }),
    { cancelled: false },
  );

  assert.equal(receivedInstructions, "focus exactly here");
  assert.equal(inner.sessionId, "old-session");
  assert.equal(inner.sessionFile, "/tmp/omp-web-old-session.jsonl");
  assert.equal(wrapper.isAlive(), true);
  wrapper.destroy();
});
