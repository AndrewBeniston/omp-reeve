import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = await mkdtemp(join(tmpdir(), "reeve-goal-coordination-"));
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { startRpcSession } = await jiti.import("./rpc-manager.ts");

async function openSession(options) {
  const cwd = await mkdtemp(join(root, "project-"));
  const opened = await startRpcSession("new", "", cwd, options);
  return { ...opened, cwd };
}

function stableToolNames(session) {
  return session.inner.getEnabledToolNames().filter((name) => !name.startsWith("mcp__"));
}

test("disabled Goal settings reject creation without changing the Session", { timeout: 60_000 }, async () => {
  const cwd = await mkdtemp(join(root, "project-"));
  await mkdir(join(cwd, ".omp"));
  await writeFile(join(cwd, ".omp", "config.yml"), "goal:\n  enabled: false\n");
  const { session } = await startRpcSession("new", "", cwd);
  try {
    await assert.rejects(
      session.send({ type: "goal", op: "create", objective: "Finish" }),
      (error) => error.code === "goal_disabled" && error.status === 403,
    );
    assert.equal(session.inner.getGoalModeState(), undefined);
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), false);
  } finally {
    session.destroy();
  }
});

test("Goal mode activates its tool and restores the previous tools on pause and drop", { timeout: 60_000 }, async () => {
  const { session } = await openSession();
  try {
    const previousTools = stableToolNames(session);
    assert.equal(previousTools.includes("goal"), false);

    await session.send({ type: "goal", op: "create", objective: "Finish" });
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), true);

    await session.send({ type: "goal", op: "pause" });
    assert.deepEqual(stableToolNames(session), previousTools);

    await session.send({ type: "goal", op: "resume" });
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), true);

    await session.send({ type: "goal", op: "drop" });
    assert.deepEqual(stableToolNames(session), previousTools);
  } finally {
    session.destroy();
  }
});

test("an internal abort keeps a Goal active, while an interrupted abort pauses it", { timeout: 60_000 }, async () => {
  const { session } = await openSession();
  try {
    await session.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 2_000 });
    const original = session.inner.getGoalModeState().goal;

    await session.send({ type: "abort", goalReason: "internal" });
    const afterInternal = session.inner.getGoalModeState().goal;
    assert.equal(afterInternal.status, "active");
    assert.equal(afterInternal.id, original.id);

    session.inner.agent.replaceQueues([], [
      { role: "user", content: [{ type: "text", text: "Keep this message" }], timestamp: 1 },
    ]);
    await session.send({ type: "abort", goalReason: "interrupted" });
    const afterInterrupt = session.inner.getGoalModeState().goal;
    assert.equal(afterInterrupt.status, "paused");
    assert.equal(afterInterrupt.id, original.id);
    assert.equal(afterInterrupt.tokensUsed, original.tokensUsed);
    assert.equal(afterInterrupt.timeUsedSeconds, original.timeUsedSeconds);
    const beforeResume = (await session.send({ type: "get_state" })).queuedMessages;
    assert.equal(beforeResume.paused, true);
    assert.deepEqual(beforeResume.items.map((item) => item.text), ["Keep this message"]);

    await session.send({ type: "goal", op: "resume" });
    const afterResume = (await session.send({ type: "get_state" })).queuedMessages;
    assert.deepEqual(afterResume, beforeResume);
    const resumed = session.inner.getGoalModeState().goal;
    assert.equal(resumed.id, original.id);
    assert.equal(resumed.status, "active");
    assert.equal(resumed.tokensUsed, afterInterrupt.tokensUsed);
    assert.equal(resumed.timeUsedSeconds, afterInterrupt.timeUsedSeconds);
  } finally {
    session.destroy();
  }
});

test("changing tools during a Goal keeps Goal active and restores the chosen tools", { timeout: 60_000 }, async () => {
  const { session } = await openSession();
  try {
    await session.send({ type: "goal", op: "create", objective: "Finish" });
    await session.send({ type: "set_tools", toolNames: ["read"] });
    const selected = session.inner.getEnabledToolNames().filter((name) => name !== "goal");
    assert.equal(selected.includes("read"), true);
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), true);

    await assert.rejects(
      session.send({ type: "set_tools", toolNames: [] }),
      (error) => error.code === "goal_unsupported" && error.status === 501,
    );
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), true);

    await session.send({ type: "goal", op: "pause" });
    assert.equal(session.inner.getEnabledToolNames().includes("read"), true);
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), false);
  } finally {
    session.destroy();
  }
});

test("a restricted tool preset rejects Goal activation before creating a Goal", { timeout: 60_000 }, async () => {
  const { session } = await openSession({ toolNames: [] });
  try {
    await assert.rejects(
      session.send({ type: "goal", op: "create", objective: "Finish" }),
      (error) => error.code === "goal_unsupported" && error.status === 501 && /restricted tool preset/i.test(error.message),
    );
    assert.equal(session.inner.getGoalModeState(), undefined);
    assert.deepEqual(session.inner.getEnabledToolNames(), []);
  } finally {
    session.destroy();
  }
});

test("a budget-limited Goal keeps the Goal tool until its budget changes", { timeout: 60_000 }, async () => {
  const { session } = await openSession();
  try {
    await session.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 100 });
    session.inner.goalRuntime.onTurnStart("budget-test", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    await session.inner.goalRuntime.flushUsage("suppressed", {
      input: 70, output: 30, cacheRead: 200, cacheWrite: 10,
    });
    await session.reconcileGoalState();
    assert.equal(session.inner.getGoalModeState().goal.status, "budget-limited");
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), true);

    await session.send({ type: "goal", op: "set_budget", tokenBudget: 150 });
    assert.equal(session.inner.getGoalModeState().goal.status, "active");
    assert.equal(session.inner.getEnabledToolNames().includes("goal"), true);
  } finally {
    session.destroy();
  }
});

test("completion restores tools and writes one durable completion entry", { timeout: 60_000 }, async () => {
  const { session } = await openSession();
  try {
    const previousTools = stableToolNames(session);
    const created = await session.send({ type: "goal", op: "create", objective: "Finish" });
    const completed = await session.send({ type: "goal", op: "complete" });
    assert.equal(completed.goal.id, created.goal.id);
    assert.equal(completed.goal.status, "complete");
    assert.deepEqual(stableToolNames(session), previousTools);
    assert.equal(session.inner.sessionManager.buildSessionContext().mode, "none");
    assert.equal((await session.send({ type: "goal", op: "get" })).goal, null);

    const entries = session.inner.sessionManager.getEntries().filter((entry) => (
      entry.type === "custom" && entry.customType === "goal-completed"
    ));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].data.id, created.goal.id);
    assert.equal(entries[0].data.objective, "Finish");

    await assert.rejects(
      session.send({ type: "goal", op: "complete" }),
      (error) => error.code === "goal_invalid_transition",
    );
    assert.equal(session.inner.sessionManager.getEntries().filter((entry) => (
      entry.type === "custom" && entry.customType === "goal-completed"
    )).length, 1);
  } finally {
    session.destroy();
  }
});

test("a Goal completed by the OMP tool receives the same one-time cleanup", { timeout: 60_000 }, async () => {
  const { session } = await openSession();
  try {
    const previousTools = stableToolNames(session);
    await session.send({ type: "goal", op: "create", objective: "Finish" });
    await session.inner.goalRuntime.completeGoalFromTool();
    await session.send({ type: "goal", op: "get" });
    assert.deepEqual(stableToolNames(session), previousTools);
    assert.equal(session.inner.sessionManager.buildSessionContext().mode, "none");
    assert.equal(session.inner.sessionManager.getEntries().filter((entry) => (
      entry.type === "custom" && entry.customType === "goal-completed"
    )).length, 1);
  } finally {
    session.destroy();
  }
});

test("cold startup completes interrupted cleanup without writing a second marker", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  const created = await session.send({ type: "goal", op: "create", objective: "Finish" });
  const completedGoal = { ...created.goal, status: "complete", updatedAt: created.goal.updatedAt + 1 };
  session.inner.sessionManager.appendCustomEntry("goal-completed", {
    id: completedGoal.id,
    objective: completedGoal.objective,
    tokensUsed: completedGoal.tokensUsed,
    tokenBudget: completedGoal.tokenBudget,
    timeUsedSeconds: completedGoal.timeUsedSeconds,
  });
  session.inner.sessionManager.appendModeChange("goal", { goal: completedGoal });
  await session.inner.sessionManager.flush();
  const sessionFile = session.inner.sessionFile;
  await session.shutdown();

  const { session: cold } = await startRpcSession(realSessionId, sessionFile, undefined);
  try {
    assert.equal(cold.inner.sessionManager.buildSessionContext().mode, "none");
    assert.equal(cold.inner.sessionManager.getEntries().filter((entry) => (
      entry.type === "custom" && entry.customType === "goal-completed"
    )).length, 1);
  } finally {
    cold.destroy();
  }
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });
