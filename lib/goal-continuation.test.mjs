import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = await mkdtemp(join("/tmp", "reeve-goal-continuation-"));
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { GoalContinuationCoordinator, isGoalContinuationBrowserReady } = await jiti.import("./goal-continuation.ts");
const { getRpcSession, startRpcSession } = await jiti.import("./rpc-manager.ts");
const { DELETE: deleteSession } = await jiti.import("../app/api/sessions/[id]/route.ts");
const { clearDraft, setDraft, setDraftPending, subscribeDraft } = await jiti.import("./draft-store.ts");

class FakeAgentSession {
  constructor(id, settings = { get: () => ["interactive"] }) {
    this.id = id;
    this.settings = settings;
    this.goalRuntime = { buildContinuationPrompt: () => `continue ${id}` };
    this.isStreaming = false;
    this.isCompacting = false;
    this.hasPostPromptWork = false;
    this.prompts = [];
    this.planModeEnabled = false;
    this.goalState = { enabled: true, goal: { status: "active" } };
  }

  getGoalModeState() {
    return this.goalState;
  }

  getPlanModeState() {
    return this.planModeEnabled ? { enabled: true } : undefined;
  }

  async promptCustomMessage(message) {
    this.prompts.push(message);
    return true;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("two Sessions keep independent pending continuations", { timeout: 5_000 }, async () => {
  const first = new FakeAgentSession("first");
  const second = new FakeAgentSession("second");
  const firstCoordinator = new GoalContinuationCoordinator(first, { delayMs: 10 });
  const secondCoordinator = new GoalContinuationCoordinator(second, { delayMs: 10 });
  try {
    firstCoordinator.setBrowserReady(true);
    secondCoordinator.setBrowserReady(true);
    firstCoordinator.schedule();
    secondCoordinator.schedule();
    firstCoordinator.schedule();

    assert.equal(firstCoordinator.pending, true);
    assert.equal(secondCoordinator.pending, true);
    firstCoordinator.setBrowserReady(false);
    assert.equal(firstCoordinator.pending, false);
    firstCoordinator.setBrowserReady(true);
    await wait(30);
    assert.deepEqual(first.prompts, [{ customType: "goal-continuation", content: "continue first", display: false }]);
    assert.deepEqual(second.prompts, [{ customType: "goal-continuation", content: "continue second", display: false }]);
  } finally {
    firstCoordinator.dispose();
    secondCoordinator.dispose();
  }
});

test("draft text or attachments blocks the browser lease", () => {
  assert.equal(isGoalContinuationBrowserReady({ hasText: false, hasAttachments: false }, true), true);
  assert.equal(isGoalContinuationBrowserReady({ hasText: true, hasAttachments: false }, true), false);
  assert.equal(isGoalContinuationBrowserReady({ hasText: false, hasAttachments: true }, true), false);
  assert.equal(isGoalContinuationBrowserReady({ hasText: false, hasAttachments: false }, false), false);
});

test("a busy Turn settles before one continuation is submitted", { timeout: 5_000 }, async () => {
  const session = new FakeAgentSession("busy");
  const coordinator = new GoalContinuationCoordinator(session, { delayMs: 5, isPromptRunning: () => session.promptRunning });
  session.promptRunning = true;
  try {
    coordinator.setBrowserReady(true);
    coordinator.observe({ type: "agent_end", messages: [] });
    await wait(20);
    assert.deepEqual(session.prompts, []);
    assert.equal(coordinator.pending, true);

    session.promptRunning = false;
    session.hasPostPromptWork = true;
    coordinator.observe({ type: "agent_settled" });
    await wait(20);
    assert.deepEqual(session.prompts, []);
    assert.equal(coordinator.pending, true);

    session.hasPostPromptWork = false;
    coordinator.observe({ type: "agent_settled" });
    await wait(20);
    assert.equal(session.prompts.length, 1);
  } finally {
    coordinator.dispose();
  }
});

test("Goal terminal states and disposal cancel a pending continuation", { timeout: 5_000 }, async () => {
  for (const status of ["paused", "dropped", "complete", "budget-limited"]) {
    const session = new FakeAgentSession(status);
    session.goalState = { enabled: status === "budget-limited", goal: { status } };
    const coordinator = new GoalContinuationCoordinator(session, { delayMs: 5 });
    coordinator.setBrowserReady(true);
    session.goalState = { enabled: true, goal: { status: "active" } };
    coordinator.schedule();
    coordinator.observe({ type: "goal_updated", state: session.goalState });
    session.goalState = { enabled: status === "budget-limited", goal: { status } };
    coordinator.observe({ type: "goal_updated", state: session.goalState });
    assert.equal(coordinator.pending, false);
    await wait(10);
    assert.deepEqual(session.prompts, []);
    coordinator.dispose();
  }

  const deleted = new FakeAgentSession("deleted");
  const deletionCoordinator = new GoalContinuationCoordinator(deleted, { delayMs: 20 });
  deletionCoordinator.setBrowserReady(true);
  deletionCoordinator.dispose();
  assert.equal(deletionCoordinator.pending, false);
  await wait(30);
  assert.deepEqual(deleted.prompts, []);
});

test("Plan mode, disabled continuation settings, and a hidden Composer cancel the timer", { timeout: 5_000 }, async () => {
  const planSession = new FakeAgentSession("plan");
  planSession.planModeEnabled = true;
  const planCoordinator = new GoalContinuationCoordinator(planSession, { delayMs: 5 });
  planCoordinator.setBrowserReady(true);
  assert.equal(planCoordinator.pending, false);
  planCoordinator.dispose();

  const disabledSession = new FakeAgentSession("disabled", { get: () => ["rpc"] });
  const disabledCoordinator = new GoalContinuationCoordinator(disabledSession, { delayMs: 5 });
  disabledCoordinator.setBrowserReady(true);
  assert.equal(disabledCoordinator.pending, false);
  disabledCoordinator.dispose();

  const hiddenSession = new FakeAgentSession("hidden");
  const hiddenCoordinator = new GoalContinuationCoordinator(hiddenSession, { delayMs: 20 });
  hiddenCoordinator.setBrowserReady(true);
  hiddenCoordinator.setBrowserReady(false);
  assert.equal(hiddenCoordinator.pending, false);
  await wait(30);
  assert.deepEqual(hiddenSession.prompts, []);
  hiddenCoordinator.dispose();
});

test("a repeated inactive continuation does not start another Turn", { timeout: 5_000 }, async () => {
  const session = new FakeAgentSession("repeat");
  const coordinator = new GoalContinuationCoordinator(session, { delayMs: 5 });
  try {
    coordinator.setBrowserReady(true);
    await wait(10);
    assert.equal(session.prompts.length, 1);
    coordinator.observe({ type: "agent_end", messages: [] });
    coordinator.observe({ type: "agent_settled" });
    await wait(20);
    assert.equal(session.prompts.length, 1);
  } finally {
    coordinator.dispose();
  }
});

test("the draft store reports text and attachment changes by Session", () => {
  const first = [];
  const second = [];
  const unsubscribeFirst = subscribeDraft("first", (state) => first.push(state));
  const unsubscribeSecond = subscribeDraft("second", (state) => second.push(state));
  try {
    setDraft("first", { value: "hold this", images: [] });
    setDraft("second", { value: "", images: [{ data: "data", mimeType: "image/png" }] });
    setDraftPending("first", true);
    setDraftPending("first", false);
    clearDraft("first");
    assert.deepEqual(first.at(-1), { hasText: false, hasAttachments: false });
    assert.deepEqual(first.slice(0, 2), [
      { hasText: false, hasAttachments: false },
      { hasText: true, hasAttachments: false },
    ]);
    assert.deepEqual(second.at(-1), { hasText: false, hasAttachments: true });
  } finally {
    unsubscribeFirst();
    unsubscribeSecond();
    clearDraft("first");
    clearDraft("second");
  }
});

test("a plain OMP AgentSession builds and submits a hidden continuation", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "plain-session-"));
  const { session: wrapper } = await startRpcSession("new", "", cwd);
  const prompts = [];
  const originalPromptCustomMessage = wrapper.inner.promptCustomMessage.bind(wrapper.inner);
  wrapper.inner.promptCustomMessage = async (message) => {
    prompts.push(message);
    return true;
  };
  const coordinator = new GoalContinuationCoordinator(wrapper.inner, { delayMs: 5 });
  try {
    await wrapper.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 500 });
    coordinator.setBrowserReady(true);
    await wait(15);
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].customType, "goal-continuation");
    assert.equal(prompts[0].display, false);
    assert.match(prompts[0].content, /Finish/);
  } finally {
    wrapper.inner.promptCustomMessage = originalPromptCustomMessage;
    coordinator.dispose();
    await wrapper.shutdown();
  }
});

test("deleting one live Session cancels only its pending continuation", { timeout: 60_000 }, async () => {
  const firstCwd = await mkdtemp(join(root, "first-project-"));
  const secondCwd = await mkdtemp(join(root, "second-project-"));
  const first = await startRpcSession("new", "", firstCwd);
  const second = await startRpcSession("new", "", secondCwd);
  const originalDispose = GoalContinuationCoordinator.prototype.dispose;
  let pendingAtDispose;
  GoalContinuationCoordinator.prototype.dispose = function patchedDispose() {
    pendingAtDispose = this.pending;
    return originalDispose.call(this);
  };
  try {
    await first.session.send({ type: "goal", op: "create", objective: "First" });
    await second.session.send({ type: "goal", op: "create", objective: "Second" });
    await first.session.send({ type: "goal_continuation_ready", ready: true });
    await second.session.send({ type: "goal_continuation_ready", ready: true });
    assert.equal((await first.session.send({ type: "get_state" })).goalContinuationPending, true);
    assert.equal((await second.session.send({ type: "get_state" })).goalContinuationPending, true);

    const response = await deleteSession(new Request(`http://localhost/api/sessions/${first.realSessionId}`, {
      method: "DELETE", headers: { host: "localhost" },
    }), { params: Promise.resolve({ id: first.realSessionId }) });

    assert.equal(response.status, 200);
    assert.equal(pendingAtDispose, true);
    assert.equal(getRpcSession(first.realSessionId), undefined);
    assert.equal(getRpcSession(second.realSessionId)?.isAlive(), true);
    assert.equal((await second.session.send({ type: "get_state" })).goalContinuationPending, true);
  } finally {
    GoalContinuationCoordinator.prototype.dispose = originalDispose;
    await first.session.shutdown();
    await second.session.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
