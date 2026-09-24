import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = await mkdtemp(join(tmpdir(), "reeve-goal-route-"));
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { getRpcSession, startRpcSession } = await jiti.import("../../../../lib/rpc-manager.ts");
const { GET, POST } = await jiti.import("./route.ts");

async function request(id, body) {
  const response = await POST(new Request(`http://localhost:30141/api/agent/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:30141", origin: "http://localhost:30141" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
}

test("a disposable Session has no Goal before creation", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    const response = await request(realSessionId, { type: "goal", op: "get" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { goal: null, state: null });
    const state = await request(realSessionId, { type: "get_state" });
    assert.equal(state.body.data.goal, null);
    assert.equal(state.body.data.goalState, null);
  } finally {
    session.destroy();
  }
});

test("a cold Goal read uses the session file without starting an AgentSession", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  const created = await request(realSessionId, { type: "goal", op: "create", objective: "Read from disk" });
  await session.inner.sessionManager.flush();
  const sessionFile = session.inner.sessionFile;
  await session.shutdown();

  const response = await GET(new Request(`http://localhost:30141/api/agent/${realSessionId}`, {
    headers: { host: "localhost:30141" },
  }), { params: Promise.resolve({ id: realSessionId }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.running, false);
  assert.equal(body.goal.id, created.body.data.goal.id);
  assert.equal(body.goalState.enabled, true);
  assert.equal(getRpcSession(realSessionId), undefined);
  assert.ok(sessionFile);
});

test("creation returns OMP's Goal and persists its optional budget", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    const created = await request(realSessionId, {
      type: "goal", op: "create", objective: "Ship a clear result", tokenBudget: 1200,
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.goal.objective, "Ship a clear result");
    assert.equal(created.body.data.goal.status, "active");
    assert.equal(created.body.data.goal.tokenBudget, 1200);
    assert.equal(created.body.data.goal.tokensUsed, 0);
    assert.equal(created.body.data.state.enabled, true);

    const fetched = await request(realSessionId, { type: "goal", op: "get" });
    assert.deepEqual(fetched.body.data, created.body.data);
    const state = await request(realSessionId, { type: "get_state" });
    assert.deepEqual(state.body.data.goal, created.body.data.goal);
    assert.deepEqual(state.body.data.goalState, created.body.data.state);
    const context = session.inner.sessionManager.buildSessionContext();
    assert.equal(context.mode, "goal");
    assert.deepEqual(context.modeData.goal, created.body.data.goal);
  } finally {
    session.destroy();
  }
});

test("invalid budgets and duplicate creation return typed errors", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    for (const tokenBudget of [0, -2, 1.5, "12", null]) {
      const response = await request(realSessionId, {
        type: "goal", op: "create", objective: "Finish", tokenBudget,
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.code, "goal_invalid_input");
    }
    assert.equal(session.inner.getGoalModeState(), undefined);
    const created = await request(realSessionId, { type: "goal", op: "create", objective: "Finish" });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.goal.tokenBudget, undefined);
    const duplicate = await request(realSessionId, { type: "goal", op: "create", objective: "Again" });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, "goal_invalid_transition");
    assert.equal(session.inner.getGoalModeState().goal.id, created.body.data.goal.id);
  } finally {
    session.destroy();
  }
});

test("pause, resume, and drop use OMP state and events", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  const events = [];
  const unsubscribe = session.onEvent((event) => {
    if (event.type === "goal_updated") events.push(event);
  });
  try {
    const created = await request(realSessionId, { type: "goal", op: "create", objective: "Finish" });
    const paused = await request(realSessionId, { type: "goal", op: "pause" });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.data.goal.status, "paused");
    assert.equal(paused.body.data.state.enabled, false);
    assert.equal(session.inner.sessionManager.buildSessionContext().mode, "goal_paused");

    const resumed = await request(realSessionId, { type: "goal", op: "resume" });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.data.goal.status, "active");
    assert.equal(resumed.body.data.goal.id, created.body.data.goal.id);

    const dropped = await request(realSessionId, { type: "goal", op: "drop" });
    assert.equal(dropped.status, 200);
    assert.equal(dropped.body.data.goal.status, "dropped");
    assert.equal(dropped.body.data.state, null);
    assert.equal(session.inner.sessionManager.buildSessionContext().mode, "none");
    assert.deepEqual((await request(realSessionId, { type: "goal", op: "get" })).body.data, { goal: null, state: null });
    assert.deepEqual(events.map((event) => event.goal?.status), ["active", "paused", "active", "dropped"]);
  } finally {
    unsubscribe();
    session.destroy();
  }
});

test("replacement, budget mutation, and completion keep OMP as the source", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    const first = await request(realSessionId, {
      type: "goal", op: "create", objective: "First", tokenBudget: 1000,
    });
    const replacement = await request(realSessionId, {
      type: "goal", op: "replace", objective: "Second", tokenBudget: 500,
    });
    assert.equal(replacement.status, 200);
    assert.notEqual(replacement.body.data.goal.id, first.body.data.goal.id);
    assert.equal(replacement.body.data.goal.objective, "Second");
    assert.equal(replacement.body.data.goal.tokenBudget, 500);
    assert.equal(replacement.body.data.goal.tokensUsed, 0);

    const changed = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: 250 });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.goal.tokenBudget, 250);
    const cleared = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.goal.tokenBudget, undefined);

    const completed = await request(realSessionId, { type: "goal", op: "complete" });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.data.goal.status, "complete");
    assert.equal(completed.body.data.goal.id, replacement.body.data.goal.id);
    assert.equal(completed.body.data.state.enabled, false);
    assert.equal(session.inner.sessionManager.buildSessionContext().mode, "none");
    assert.equal(session.inner.sessionManager.getEntries().filter((entry) => (
      entry.type === "custom" && entry.customType === "goal-completed"
    )).length, 1);
    const again = await request(realSessionId, { type: "goal", op: "complete" });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, "goal_invalid_transition");
  } finally {
    session.destroy();
  }
});

test("a cold Wrapper pauses a persisted active Goal once", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  const created = await request(realSessionId, { type: "goal", op: "create", objective: "Continue after reload" });
  await session.inner.sessionManager.flush();
  const sessionFile = session.inner.sessionFile;
  assert.ok(sessionFile);
  await session.shutdown();

  const fetched = await request(realSessionId, { type: "goal", op: "get" });
  const cold = getRpcSession(realSessionId);
  assert.ok(cold);
  try {
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.goal.id, created.body.data.goal.id);
    assert.equal(fetched.body.data.goal.status, "paused");
    assert.equal(fetched.body.data.state.enabled, false);
    assert.equal(cold.inner.sessionManager.buildSessionContext().mode, "goal_paused");

    const before = cold.inner.sessionManager.getEntries().filter((entry) => entry.type === "mode_change").length;
    const reopened = await startRpcSession(realSessionId, sessionFile, undefined);
    assert.equal(reopened.session, cold);
    const after = cold.inner.sessionManager.getEntries().filter((entry) => entry.type === "mode_change").length;
    assert.equal(after, before);
  } finally {
    cold.destroy();
  }
});

test("an invalid saved Goal can be read and cleared while ordinary Session commands remain available", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  session.inner.sessionManager.appendModeChange("goal", {
    goal: {
      id: "saved-goal", objective: "Finish", status: "active", tokenBudget: -3,
      tokensUsed: 4, timeUsedSeconds: 0, createdAt: 100, updatedAt: 100,
    },
  });
  await session.inner.sessionManager.ensureOnDisk();
  const sessionFile = session.inner.sessionFile;
  await session.shutdown();

  const { session: cold } = await startRpcSession(realSessionId, sessionFile, undefined);
  try {
    const goal = await request(realSessionId, { type: "goal", op: "get" });
    assert.equal(goal.status, 200);
    assert.deepEqual(goal.body.data, { goal: null, state: null });
    const cleared = await request(realSessionId, { type: "goal", op: "drop" });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.data, { goal: null, state: null });
    assert.equal(cold.inner.sessionManager.buildSessionContext().mode, "none");
    const renamed = await request(realSessionId, { type: "set_session_name", name: "Still usable" });
    assert.equal(renamed.status, 200);
    assert.equal(cold.inner.sessionManager.getSessionName(), "Still usable");
    assert.equal(cold.inner.sessionManager.buildSessionContext().mode, "none");
  } finally {
    cold.destroy();
  }
});

test("cold restoration honors a disabled Goal setting", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  const created = await request(realSessionId, { type: "goal", op: "create", objective: "Do work" });
  assert.equal(created.status, 200);
  const sessionFile = session.inner.sessionFile;
  await session.shutdown();

  await mkdir(join(cwd, ".omp"));
  await writeFile(join(cwd, ".omp", "config.yml"), "goal:\n  enabled: false\n");
  const { session: cold } = await startRpcSession(realSessionId, sessionFile, undefined);
  try {
    assert.equal(cold.inner.settings.get("goal.enabled"), false);
    const fetched = await request(realSessionId, { type: "goal", op: "get" });
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body.data, { goal: null, state: null });
    assert.equal(cold.inner.sessionManager.buildSessionContext().mode, "none");
    const attempted = await request(realSessionId, { type: "goal", op: "create", objective: "Again" });
    assert.equal(attempted.status, 403);
    assert.equal(attempted.body.code, "goal_disabled");
  } finally {
    cold.destroy();
  }
});

test("objective mutation names the missing OMP capability without replacing the Goal", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    const created = await request(realSessionId, { type: "goal", op: "create", objective: "Original" });
    const edit = await request(realSessionId, { type: "goal", op: "set_objective", objective: "Edited" });
    assert.equal(edit.status, 501);
    assert.equal(edit.body.code, "goal_unsupported");
    assert.match(edit.body.error, /objective mutation/i);
    const current = await request(realSessionId, { type: "goal", op: "get" });
    assert.deepEqual(current.body.data.goal, created.body.data.goal);
  } finally {
    session.destroy();
  }
});

test("OMP counts input, output, and cache-write deltas but excludes cache-read deltas", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    const created = await request(realSessionId, {
      type: "goal", op: "create", objective: "Stay within budget", tokenBudget: 100,
    });
    session.inner.goalRuntime.onTurnStart("budget-test", { input: 100, output: 200, cacheRead: 1_000, cacheWrite: 300 });
    await session.inner.goalRuntime.flushUsage("suppressed", {
      input: 130, output: 200, cacheRead: 2_000, cacheWrite: 300,
    });
    assert.equal((await request(realSessionId, { type: "goal", op: "get" })).body.data.goal.tokensUsed, 30);
    await session.inner.goalRuntime.flushUsage("suppressed", {
      input: 130, output: 240, cacheRead: 12_000, cacheWrite: 300,
    });
    assert.equal((await request(realSessionId, { type: "goal", op: "get" })).body.data.goal.tokensUsed, 70);
    await session.inner.goalRuntime.flushUsage("suppressed", {
      input: 130, output: 240, cacheRead: 20_000, cacheWrite: 350,
    });
    const limited = await request(realSessionId, { type: "goal", op: "get" });
    assert.equal(limited.body.data.goal.status, "budget-limited");
    assert.equal(limited.body.data.goal.tokensUsed, 120);
    assert.equal(session.inner.goalRuntime.buildContinuationPrompt(), undefined);
    await session.inner.goalRuntime.flushUsage("suppressed", {
      input: 130, output: 240, cacheRead: 50_000, cacheWrite: 350,
    });
    assert.equal((await request(realSessionId, { type: "goal", op: "get" })).body.data.goal.tokensUsed, 120);

    const raised = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: 150 });
    assert.equal(raised.status, 200);
    assert.equal(raised.body.data.goal.status, "active");
    assert.equal(raised.body.data.goal.id, created.body.data.goal.id);
    assert.equal(raised.body.data.goal.tokensUsed, 120);
    assert.equal(raised.body.data.goal.tokenBudget, 150);
    assert.ok(session.inner.goalRuntime.buildContinuationPrompt());

    const reduced = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: 110 });
    assert.equal(reduced.body.data.goal.status, "budget-limited");
    assert.equal(reduced.body.data.goal.tokensUsed, 120);
    assert.equal(session.inner.goalRuntime.buildContinuationPrompt(), undefined);

    const cleared = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: null });
    assert.equal(cleared.body.data.goal.status, "active");
    assert.equal(cleared.body.data.goal.tokenBudget, undefined);
    assert.equal(cleared.body.data.goal.tokensUsed, 120);
  } finally {
    session.destroy();
  }
});

test("a paused Goal accepts a changed or cleared budget without resuming", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    await request(realSessionId, { type: "goal", op: "create", objective: "Pause first", tokenBudget: 100 });
    const paused = await request(realSessionId, { type: "goal", op: "pause" });
    assert.equal(paused.body.data.goal.status, "paused");
    const changed = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: 500 });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.goal.status, "paused");
    assert.equal(changed.body.data.goal.tokenBudget, 500);
    const cleared = await request(realSessionId, { type: "goal", op: "set_budget", tokenBudget: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.goal.status, "paused");
    assert.equal(cleared.body.data.goal.tokenBudget, undefined);
  } finally {
    session.destroy();
  }
});

test("concurrent Goal creation returns one success and one typed conflict", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  const { session, realSessionId } = await startRpcSession("new", "", cwd);
  try {
    const results = await Promise.all([
      request(realSessionId, { type: "goal", op: "create", objective: "First" }),
      request(realSessionId, { type: "goal", op: "create", objective: "Second" }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(results.find((result) => result.status === 409).body.code, "goal_invalid_transition");
    const current = await request(realSessionId, { type: "goal", op: "get" });
    assert.equal(current.body.data.goal.id, results.find((result) => result.status === 200).body.data.goal.id);
  } finally {
    session.destroy();
  }
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });
