import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");
const { readSessionQueueFailures, clearSessionQueueFailures } = await jiti.import("./queue-failure-store.ts");

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
    sessionId: "test-session-414",
    sessionFile: "/tmp/omp-web-test-session-414.jsonl",
    isStreaming: false,
    isBashRunning: false,
    isCompacting: false,
    autoCompactionEnabled: false,
    autoRetryEnabled: false,
    model: undefined,
    settings: {
      get: () => undefined,
      override() {},
    },
    agent: queueAgent,
    sessionManager: {
      getEntries: () => [],
    },
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
    prompt: async () => true,
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

test("queue failure persists item identity, failed status, safe error summary, and queue position", async () => {
  const inner = makeInner({
    steer: async () => {
      throw new Error("Connection failed to /Users/secret/host with Bearer token-xyz");
    },
  });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "First queued message" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Second queued message" }], timestamp: 2 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.queuePaused = true;

  const stateBefore = await wrapper.send({ type: "get_state" });
  const [firstItem] = stateBefore.queuedMessages.items;

  await assert.rejects(
    () => wrapper.send({ type: "send_queue_item_now", id: firstItem.id }),
    /Connection failed/,
  );

  const stateAfter = await wrapper.send({ type: "get_state" });
  assert.equal(stateAfter.queuedMessages.paused, true);
  assert.equal(stateAfter.queuedMessages.items.length, 2);

  const failedItem = stateAfter.queuedMessages.items[0];
  assert.equal(failedItem.id, firstItem.id);
  assert.equal(failedItem.status, "failed");
  assert.ok(failedItem.errorSummary);
  assert.doesNotMatch(failedItem.errorSummary, /token-xyz/);

  const stored = readSessionQueueFailures("test-session-414");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, firstItem.id);
  assert.equal(stored[0].status, "failed");
  assert.equal(stored[0].position, 0);

  wrapper.destroy();
  clearSessionQueueFailures("test-session-414");
});

test("reload restores the failed item and its queue position", async () => {
  const sessionId = "reload-test-session";
  const inner1 = makeInner({
    sessionId,
    steer: async () => {
      throw new Error("Network unreachable");
    },
  });
  inner1.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "Unfailed item" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Failing item" }], timestamp: 2 },
  ]);
  const wrapper1 = new AgentSessionWrapper(inner1, makeEventBus());
  wrapper1.queuePaused = true;
  const items = (await wrapper1.send({ type: "get_state" })).queuedMessages.items;

  await assert.rejects(() => wrapper1.send({ type: "send_queue_item_now", id: items[1].id }));
  wrapper1.destroy();

  // Simulate reload with empty in-memory agent queues
  const inner2 = makeInner({ sessionId });
  const wrapper2 = new AgentSessionWrapper(inner2, makeEventBus());
  await wrapper2.start();

  const reloadedState = await wrapper2.send({ type: "get_state" });
  assert.equal(reloadedState.queuedMessages.items.length, 1);
  assert.equal(reloadedState.queuedMessages.items[0].id, items[1].id);
  assert.equal(reloadedState.queuedMessages.items[0].status, "failed");
  assert.equal(reloadedState.queuedMessages.items[0].text, "Failing item");
  assert.equal(reloadedState.queuedMessages.paused, true);

  wrapper2.destroy();
  clearSessionQueueFailures(sessionId);
});

test("reconnect reconciles a failure without duplicating the item", async () => {
  const sessionId = "reconnect-test-session";
  const inner = makeInner({
    sessionId,
    steer: async () => {
      throw new Error("Temporary outage");
    },
  });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "Item to fail" }], timestamp: 1 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.queuePaused = true;
  const items = (await wrapper.send({ type: "get_state" })).queuedMessages.items;

  await assert.rejects(() => wrapper.send({ type: "send_queue_item_now", id: items[0].id }));

  // Call start/reconcile again to simulate reconnect
  await wrapper.start();

  const reconnectedState = await wrapper.send({ type: "get_state" });
  assert.equal(reconnectedState.queuedMessages.items.length, 1);
  assert.equal(reconnectedState.queuedMessages.items[0].id, items[0].id);
  assert.equal(reconnectedState.queuedMessages.items[0].status, "failed");

  wrapper.destroy();
  clearSessionQueueFailures(sessionId);
});

test("repeated activation cannot send the same Retry twice", async () => {
  let steerResolve;
  const steerPromise = new Promise((resolve) => {
    steerResolve = resolve;
  });
  const inner = makeInner({
    steer: async () => steerPromise,
  });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "Retry candidate" }], timestamp: 1 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.queuePaused = true;
  const [item] = (await wrapper.send({ type: "get_state" })).queuedMessages.items;

  // First retry activation runs asynchronously
  const firstRetry = wrapper.send({ type: "retry_queue_item", id: item.id });

  // Second activation while first is pending must be rejected
  await assert.rejects(
    () => wrapper.send({ type: "retry_queue_item", id: item.id }),
    /Cannot send the same Retry twice/,
  );

  steerResolve();
  await firstRetry;
  wrapper.destroy();
});

test("a successful Retry clears the failed state through authoritative queue update", async () => {
  let shouldFail = true;
  const inner = makeInner({
    sessionId: "retry-success-session",
    steer: async () => {
      if (shouldFail) throw new Error("First attempt failed");
      return true;
    },
  });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "Retryable item" }], timestamp: 1 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.queuePaused = true;
  const [item] = (await wrapper.send({ type: "get_state" })).queuedMessages.items;

  await assert.rejects(() => wrapper.send({ type: "send_queue_item_now", id: item.id }));
  assert.equal((await wrapper.send({ type: "get_state" })).queuedMessages.items[0].status, "failed");

  // Now retry with success
  shouldFail = false;
  const update = await wrapper.send({ type: "retry_queue_item", id: item.id });
  assert.ok(update);
  const state = await wrapper.send({ type: "get_state" });
  const failedRemaining = state.queuedMessages.items.filter((i) => i.status === "failed");
  assert.equal(failedRemaining.length, 0);
  assert.equal(readSessionQueueFailures("retry-success-session").length, 0);

  wrapper.destroy();
  clearSessionQueueFailures("retry-success-session");
});

test("a failed Retry preserves the item, order, and controls", async () => {
  const sessionId = "second-failure-session";
  let failureCount = 0;
  const inner = makeInner({
    sessionId,
    steer: async () => {
      failureCount++;
      throw new Error(`Attempt ${failureCount} failed`);
    },
  });
  inner.agent.replaceQueues([], [
    { role: "user", content: [{ type: "text", text: "Item A" }], timestamp: 1 },
    { role: "user", content: [{ type: "text", text: "Item B" }], timestamp: 2 },
  ]);
  const wrapper = new AgentSessionWrapper(inner, makeEventBus());
  wrapper.queuePaused = true;
  const [itemA, itemB] = (await wrapper.send({ type: "get_state" })).queuedMessages.items;

  // First failure on Item A
  await assert.rejects(() => wrapper.send({ type: "send_queue_item_now", id: itemA.id }));

  // Second failure via retry_queue_item
  await assert.rejects(() => wrapper.send({ type: "retry_queue_item", id: itemA.id }));

  const state = await wrapper.send({ type: "get_state" });
  assert.equal(state.queuedMessages.items.length, 2);
  assert.equal(state.queuedMessages.items[0].id, itemA.id);
  assert.equal(state.queuedMessages.items[0].status, "failed");
  assert.match(state.queuedMessages.items[0].errorSummary, /Attempt 2 failed/);
  assert.equal(state.queuedMessages.items[1].id, itemB.id);

  // Controls still work: item can be deleted
  const deleted = await wrapper.send({ type: "delete_queue_item", id: itemA.id });
  assert.ok(deleted.undoToken);
  const afterDelete = await wrapper.send({ type: "get_state" });
  assert.equal(afterDelete.queuedMessages.items.length, 1);
  assert.equal(afterDelete.queuedMessages.items[0].id, itemB.id);

  wrapper.destroy();
  clearSessionQueueFailures(sessionId);
});
