import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

import { DomEvent, React, mount, settle } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { useGoalState } = await jiti.import("./useGoalState.ts");
const { useAgentSession } = await jiti.import("./useAgentSession.ts");
const h = React.createElement;

function response(goal = null, state = null) {
  return { ok: true, async json() { return { success: true, data: { goal, state } }; } };
}

function goal(status, updatedAt = 1_200, id = "goal-one", createdAt = 1_000) {
  return {
    id, objective: "Finish the work", status, tokenBudget: 2_000,
    tokensUsed: 700, timeUsedSeconds: 12, createdAt, updatedAt,
  };
}

test("pause sends one Goal command and keeps the confirmed Goal until OMP responds", async () => {
  const originalFetch = globalThis.fetch;
  const activeGoal = goal("active");
  const pausedGoal = goal("paused", 1_300);
  const commands = [];
  let resolvePause;
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    if (command.op === "pause") return new Promise((resolve) => { resolvePause = resolve; });
    return response(activeGoal, { enabled: true, mode: "active", goal: activeGoal });
  };
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    let first;
    await React.act(async () => {
      first = client.pause();
      void client.pause();
    });
    assert.deepEqual(commands, [{ type: "goal", op: "get" }, { type: "goal", op: "pause" }]);
    assert.equal(client.goal.status, "active");
    assert.equal(client.pendingAction, "pause");
    await React.act(async () => { resolvePause(response(pausedGoal, { enabled: false, mode: "active", goal: pausedGoal })); await first; });
    assert.equal(client.goal.status, "paused");
    assert.equal(client.pendingAction, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("resume keeps the Goal identity and usage and does not drain queued messages", async () => {
  const originalFetch = globalThis.fetch;
  const pausedGoal = goal("paused", 1_300);
  const resumedGoal = goal("active", 1_400);
  const commands = [];
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    return response(command.op === "resume" ? resumedGoal : pausedGoal);
  };
  function Harness() { client = useGoalState("session-one"); return h("div"); }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { await client.resume(); });
    assert.deepEqual(commands, [{ type: "goal", op: "get" }, { type: "goal", op: "resume" }]);
    assert.equal(client.goal.id, pausedGoal.id);
    assert.equal(client.goal.tokensUsed, pausedGoal.tokensUsed);
    assert.equal(client.goal.timeUsedSeconds, pausedGoal.timeUsedSeconds);
    assert.equal(client.goal.status, "active");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("budget changes send OMP the exact limit or Off and retain confirmed usage", async () => {
  const originalFetch = globalThis.fetch;
  const activeGoal = goal("active");
  const limitedGoal = { ...goal("budget-limited", 1_300), tokenBudget: 500, tokensUsed: 700 };
  const raisedGoal = { ...goal("active", 1_400), tokenBudget: 1_000, tokensUsed: 700 };
  const unboundedGoal = { ...goal("active", 1_500), tokenBudget: undefined, tokensUsed: 700 };
  const commands = [];
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    if (command.op === "set_budget") {
      const next = command.tokenBudget === 500 ? limitedGoal : command.tokenBudget === 1_000 ? raisedGoal : unboundedGoal;
      return response(next, { enabled: true, mode: "active", goal: next });
    }
    return response(activeGoal, { enabled: true, mode: "active", goal: activeGoal });
  };
  function Harness() { client = useGoalState("session-one"); return h("div"); }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { assert.equal(await client.setBudget(500), true); });
    assert.equal(client.goal.status, "budget-limited");
    assert.equal(client.goal.tokensUsed, 700);
    await React.act(async () => { assert.equal(await client.setBudget(1_000), true); });
    assert.equal(client.goal.status, "active");
    await React.act(async () => { assert.equal(await client.setBudget(null), true); });
    assert.equal(client.goal.tokenBudget, undefined);
    assert.equal(client.goal.tokensUsed, 700);
    assert.deepEqual(commands, [
      { type: "goal", op: "get" },
      { type: "goal", op: "set_budget", tokenBudget: 500 },
      { type: "goal", op: "set_budget", tokenBudget: 1_000 },
      { type: "goal", op: "set_budget", tokenBudget: null },
    ]);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a failed Goal action keeps the confirmed Goal and reports an action error", async () => {
  const originalFetch = globalThis.fetch;
  const activeGoal = goal("active");
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    if (command.op === "pause") return { ok: false, status: 503, async json() { return { error: "Unavailable" }; } };
    return response(activeGoal);
  };
  function Harness() { client = useGoalState("session-one"); return h("div"); }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { await client.pause(); });
    assert.equal(client.goal.status, "active");
    assert.deepEqual(client.actionError, { action: "pause", message: "Unavailable" });
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("clearing an idle Goal sends one drop and removes it only after OMP confirms", async () => {
  const originalFetch = globalThis.fetch;
  const activeGoal = goal("active");
  const droppedGoal = goal("dropped", 1_300);
  const commands = [];
  let resolveDrop;
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    if (command.op === "drop") return new Promise((resolve) => { resolveDrop = resolve; });
    return response(activeGoal);
  };
  function Harness() { client = useGoalState("session-one"); return h("div"); }
  const view = await mount(h(Harness));
  try {
    let pending;
    await React.act(async () => { pending = client.clear(); void client.clear(); });
    assert.deepEqual(commands, [{ type: "goal", op: "get" }, { type: "goal", op: "drop" }]);
    assert.equal(client.goal.status, "active");
    await React.act(async () => { resolveDrop(response(droppedGoal)); await pending; });
    assert.equal(client.goal, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("pausing active work uses an interrupted abort and reads flushed Goal usage", async () => {
  const originalFetch = globalThis.fetch;
  const activeGoal = goal("active");
  const pausedGoal = { ...goal("paused", 1_400), tokensUsed: 900, timeUsedSeconds: 16 };
  const commands = [];
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    return response(commands.length === 1 ? activeGoal : pausedGoal);
  };
  function Harness() { client = useGoalState("session-one"); return h("div"); }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { await client.pause(true); });
    assert.deepEqual(commands, [
      { type: "goal", op: "get" },
      { type: "abort", goalReason: "interrupted" },
      { type: "goal", op: "get" },
    ]);
    assert.equal(client.goal.status, "paused");
    assert.equal(client.goal.tokensUsed, 900);
    assert.equal(client.goal.timeUsedSeconds, 16);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("clearing active work aborts internally before dropping the Goal", async () => {
  const originalFetch = globalThis.fetch;
  const activeGoal = goal("active");
  const commands = [];
  let client;
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    return response(command.op === "drop" ? goal("dropped", 1_400) : activeGoal);
  };
  function Harness() { client = useGoalState("session-one"); return h("div"); }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { await client.clear(true); });
    assert.deepEqual(commands, [
      { type: "goal", op: "get" },
      { type: "abort", goalReason: "internal" },
      { type: "goal", op: "drop" },
    ]);
    assert.equal(client.goal, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("an initial Goal read distinguishes loading from no Goal", async () => {
  const originalFetch = globalThis.fetch;
  let resolveRead;
  let client;
  globalThis.fetch = () => new Promise((resolve) => { resolveRead = resolve; });
  function Harness() {
    client = useGoalState("session-one");
    return h("div", { "data-status": client.status });
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.status, "loading");
    assert.equal(client.goal, null);
    await React.act(async () => { resolveRead(response()); });
    assert.equal(client.status, "ready");
    assert.equal(client.goal, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a new Session without an id has no Goal and makes no request", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return response(); };
  function Harness() {
    client = useGoalState(null);
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.status, "ready");
    assert.equal(client.goal, null);
    assert.equal(requests, 0);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("an initial Goal read failure offers a read-only retry", async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  let client;
  let reads = 0;
  globalThis.fetch = async (_url, init) => {
    commands.push(JSON.parse(init.body));
    reads += 1;
    if (reads === 1) return { ok: false, status: 503, async json() { return { error: "Unavailable" }; } };
    return response();
  };
  function Harness() {
    client = useGoalState("session-one");
    return h("div", { "data-status": client.status });
  }
  const view = await mount(h(Harness));
  try {
    await settle();
    assert.equal(client.status, "error");
    assert.match(client.error, /Unavailable/);
    await React.act(async () => { await client.retry(); });
    assert.equal(client.status, "ready");
    assert.deepEqual(commands, [{ type: "goal", op: "get" }, { type: "goal", op: "get" }]);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a Goal event updates active, paused, limited, and complete states", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  globalThis.fetch = async () => response();
  function Harness() {
    client = useGoalState("session-one");
    return h("div", { "data-status": client.status });
  }
  const view = await mount(h(Harness));
  try {
    for (const [status, updatedAt] of [
      ["active", 1_200], ["paused", 1_300], ["budget-limited", 1_400], ["complete", 1_500],
    ]) {
      const currentGoal = goal(status, updatedAt);
      await React.act(async () => {
        client.onEvent({ type: "goal_updated", goal: currentGoal, state: { enabled: status === "active", mode: "active", goal: currentGoal } });
      });
      assert.equal(client.status, "ready");
      assert.equal(client.goal.status, status);
    }
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a stale read cannot replace a newer Goal event", async () => {
  const originalFetch = globalThis.fetch;
  let resolveRead;
  let client;
  globalThis.fetch = () => new Promise((resolve) => { resolveRead = resolve; });
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    const currentGoal = goal("active");
    await React.act(async () => {
      client.onEvent({ type: "goal_updated", goal: currentGoal, state: { enabled: true, mode: "active", goal: currentGoal } });
    });
    assert.equal(client.goal.id, "goal-one");
    await React.act(async () => { resolveRead(response()); });
    assert.equal(client.goal.id, "goal-one");
    assert.equal(client.status, "ready");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a late event from an older run cannot replace a newer Goal", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  const currentGoal = goal("active", 2_200, "goal-two", 2_000);
  globalThis.fetch = async () => response(currentGoal, { enabled: true, mode: "active", goal: currentGoal });
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.goal.id, "goal-two");
    const oldGoal = goal("paused", 1_800, "goal-one", 1_000);
    await React.act(async () => {
      client.onEvent({ type: "goal_updated", goal: oldGoal, state: { enabled: false, mode: "active", goal: oldGoal } });
    });
    assert.equal(client.goal.id, "goal-two");
    const oldSameGoal = goal("paused", 2_100, "goal-two", 2_000);
    await React.act(async () => {
      client.onEvent({ type: "goal_updated", goal: oldSameGoal, state: { enabled: false, mode: "active", goal: oldSameGoal } });
    });
    assert.equal(client.goal.status, "active");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("an unversioned clear event reconciles before it removes a newer Goal", async () => {
  const originalFetch = globalThis.fetch;
  let resolveRead;
  let client;
  let reads = 0;
  const currentGoal = goal("active", 2_200, "goal-two", 2_000);
  globalThis.fetch = () => {
    reads += 1;
    if (reads === 1) return Promise.resolve(response(currentGoal, { enabled: true, mode: "active", goal: currentGoal }));
    return new Promise((resolve) => { resolveRead = resolve; });
  };
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { client.onEvent({ type: "goal_updated", goal: null }); });
    assert.equal(client.goal.id, "goal-two");
    await React.act(async () => { resolveRead(response(currentGoal, { enabled: true, mode: "active", goal: currentGoal })); });
    assert.equal(client.goal.id, "goal-two");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a reconnect failure keeps the last Goal until the next successful read", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  let reads = 0;
  const activeGoal = goal("active");
  const pausedGoal = goal("paused", 1_300);
  globalThis.fetch = async () => {
    reads += 1;
    if (reads === 1) return response(activeGoal, { enabled: true, mode: "active", goal: activeGoal });
    if (reads === 2) return { ok: false, status: 503, async json() { return { error: "Connection lost" }; } };
    return response(pausedGoal, { enabled: false, mode: "active", goal: pausedGoal });
  };
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.goal.status, "active");
    await React.act(async () => { await client.refresh(); });
    assert.equal(client.status, "stale");
    assert.equal(client.goal.status, "active");
    assert.match(client.error, /Connection lost/);
    await React.act(async () => { await client.retry(); });
    assert.equal(client.status, "ready");
    assert.equal(client.goal.status, "paused");
    assert.equal(client.error, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a disconnected event stream marks the confirmed Goal stale", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  const activeGoal = goal("active");
  globalThis.fetch = async () => response(activeGoal, { enabled: true, mode: "active", goal: activeGoal });
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { client.markStale(); });
    assert.equal(client.status, "stale");
    assert.equal(client.goal.id, "goal-one");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("dropping a Goal clears its client state and rejects an older event", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  const activeGoal = goal("active");
  globalThis.fetch = async () => response(activeGoal, { enabled: true, mode: "active", goal: activeGoal });
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    const droppedGoal = goal("dropped", 1_500);
    await React.act(async () => {
      client.onEvent({ type: "goal_updated", goal: droppedGoal });
    });
    assert.equal(client.status, "ready");
    assert.equal(client.goal, null);
    assert.equal(client.modeState, null);
    await React.act(async () => {
      client.onEvent({ type: "goal_updated", goal: goal("active", 1_400) });
    });
    assert.equal(client.goal, null);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("reload restores a persisted Goal without a create command", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  const commands = [];
  const savedGoal = goal("paused", 1_600);
  globalThis.fetch = async (_url, init) => {
    commands.push(JSON.parse(init.body));
    return response(savedGoal, { enabled: false, mode: "active", goal: savedGoal });
  };
  function Harness() {
    client = useGoalState("session-one");
    return h("div");
  }
  let view;
  try {
    view = await mount(h(Harness));
    assert.equal(client.goal.status, "paused");
    await view.unmount();
    view = await mount(h(Harness));
    assert.equal(client.goal.id, "goal-one");
    assert.equal(client.status, "ready");
    assert.deepEqual(commands, [{ type: "goal", op: "get" }, { type: "goal", op: "get" }]);
  } finally {
    await view?.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("the Session hook receives Goal events from its event stream", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST" && JSON.parse(init.body).type === "goal") return response();
    if (String(url).startsWith("/api/sessions/session-one?")) {
      return { ok: true, async json() {
        return {
          sessionId: "session-one", filePath: "", totalActiveMs: 0, tree: [], leafId: null,
          context: { messages: [], entryIds: [], thinkingLevel: "off", model: null },
        };
      } };
    }
    if (String(url) === "/api/sessions/session-one/state") {
      return { ok: true, async json() { return { running: false }; } };
    }
    return { ok: true, async json() { return { models: {}, modelList: [], fields: [] }; } };
  };
  function Harness() {
    client = useAgentSession({ session: { id: "session-one", cwd: "/tmp" }, newSessionCwd: null });
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    const currentGoal = goal("active");
    await React.act(async () => {
      client.handleAgentEventRef.current({ type: "goal_updated", goal: currentGoal, state: { enabled: true, mode: "active", goal: currentGoal } });
    });
    assert.equal(client.goalState.goal.id, "goal-one");
    assert.equal(client.goalState.goal.status, "active");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("the shared Stop and Escape handler sends an interrupted abort reason", async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  let client;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") {
      const command = JSON.parse(init.body);
      commands.push(command);
      if (command.type === "goal") return response();
      return { ok: true, async json() { return { success: true, data: null }; } };
    }
    if (String(url).startsWith("/api/sessions/session-one?")) {
      return { ok: true, async json() { return {
        sessionId: "session-one", filePath: "", totalActiveMs: 0, tree: [], leafId: null,
        context: { messages: [], entryIds: [], thinkingLevel: "off", model: null },
      }; } };
    }
    if (String(url) === "/api/sessions/session-one/state") {
      return { ok: true, async json() { return { running: false }; } };
    }
    return { ok: true, async json() { return { models: {}, modelList: [], fields: [] }; } };
  };
  function Harness() {
    client = useAgentSession({ session: { id: "session-one", cwd: "/tmp" }, newSessionCwd: null });
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { await client.handleAbort(); });
    assert.deepEqual(commands.filter((command) => command.type === "abort"), [
      { type: "abort", goalReason: "interrupted" },
    ]);
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a Session reconnect and network return repair missed Goal updates", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  let goalReads = 0;
  const activeGoal = goal("active");
  const pausedGoal = goal("paused", 1_300);
  const completeGoal = goal("complete", 1_400);
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST" && JSON.parse(init.body).type === "goal") {
      goalReads += 1;
      const current = goalReads === 1 ? activeGoal : goalReads === 2 ? pausedGoal : completeGoal;
      return response(current, { enabled: current.status === "active", mode: "active", goal: current });
    }
    if (String(url).startsWith("/api/sessions/session-one?")) {
      return { ok: true, async json() {
        return {
          sessionId: "session-one", filePath: "", totalActiveMs: 0, tree: [], leafId: null,
          context: { messages: [], entryIds: [], thinkingLevel: "off", model: null },
        };
      } };
    }
    if (String(url) === "/api/sessions/session-one/state") {
      return { ok: true, async json() { return { running: false }; } };
    }
    return { ok: true, async json() { return { models: {}, modelList: [], fields: [] }; } };
  };
  function Harness() {
    client = useAgentSession({ session: { id: "session-one", cwd: "/tmp" }, newSessionCwd: null });
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.goalState.goal.status, "active");
    await React.act(async () => { client.handleAgentEventRef.current({ type: "connected" }); });
    assert.equal(goalReads, 2);
    assert.equal(client.goalState.goal.status, "paused");
    await React.act(async () => { window.dispatchEvent(new DomEvent("online")); });
    assert.equal(goalReads, 3);
    assert.equal(client.goalState.goal.status, "complete");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("an initial Goal read failure exposes a retry action in the Session", async () => {
  const originalFetch = globalThis.fetch;
  let client;
  let goalReads = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST" && JSON.parse(init.body).type === "goal") {
      goalReads += 1;
      if (goalReads === 1) return { ok: false, status: 503, async json() { return { error: "Goal unavailable" }; } };
      return response();
    }
    if (String(url).startsWith("/api/sessions/session-one?")) {
      return { ok: true, async json() {
        return {
          sessionId: "session-one", filePath: "", totalActiveMs: 0, tree: [], leafId: null,
          context: { messages: [], entryIds: [], thinkingLevel: "off", model: null },
        };
      } };
    }
    if (String(url) === "/api/sessions/session-one/state") {
      return { ok: true, async json() { return { running: false }; } };
    }
    return { ok: true, async json() { return { models: {}, modelList: [], fields: [] }; } };
  };
  function Harness() {
    client = useAgentSession({
      session: { id: "session-one", cwd: "/tmp" }, newSessionCwd: null,
      translate: (key) => key === "workspace.retry" ? "Retry" : key,
    });
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.goalState.status, "error");
    const retryNotice = client.notices.find((notice) => notice.actionLabel === "Retry");
    assert.ok(retryNotice);
    await React.act(async () => { retryNotice.onAction(); });
    assert.equal(goalReads, 2);
    assert.equal(client.goalState.status, "ready");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("an event stream failure marks the last confirmed Goal stale", async () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  const sources = [];
  let client;
  const activeGoal = goal("active");
  class FakeEventSource {
    static CLOSED = 2;
    static OPEN = 1;
    readyState = 0;
    constructor() { sources.push(this); }
    close() { this.readyState = FakeEventSource.CLOSED; }
  }
  globalThis.EventSource = FakeEventSource;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") {
      const command = JSON.parse(init.body);
      if (command.type === "goal") return response(activeGoal, { enabled: true, mode: "active", goal: activeGoal });
      return { ok: true, async json() { return { success: true, data: [] }; } };
    }
    if (String(url).startsWith("/api/sessions/session-one?")) {
      return { ok: true, async json() {
        return {
          sessionId: "session-one", filePath: "", totalActiveMs: 0, tree: [], leafId: null,
          context: { messages: [], entryIds: [], thinkingLevel: "off", model: null },
        };
      } };
    }
    if (String(url) === "/api/sessions/session-one/state") {
      return { ok: true, async json() { return { running: true, state: { isStreaming: true } }; } };
    }
    return { ok: true, async json() { return { models: {}, modelList: [], fields: [] }; } };
  };
  function Harness() {
    client = useAgentSession({ session: { id: "session-one", cwd: "/tmp" }, newSessionCwd: null });
    return h("div");
  }
  const view = await mount(h(Harness));
  try {
    assert.equal(client.goalState.status, "ready");
    assert.equal(sources.length, 1);
    await React.act(async () => {
      sources[0].readyState = FakeEventSource.CLOSED;
      sources[0].onerror();
    });
    assert.equal(client.goalState.status, "stale");
    assert.equal(client.goalState.goal.id, "goal-one");
  } finally {
    await view.unmount();
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
  }
});
