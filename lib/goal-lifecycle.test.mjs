import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = await mkdtemp(join(tmpdir(), "reeve-goal-lifecycle-"));
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const { SessionManager } = await import("@oh-my-pi/pi-coding-agent");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { getRpcSession, startRpcSession } = await jiti.import("./rpc-manager.ts");
const { PATCH: archiveSession, DELETE: deleteSession } = await jiti.import("../app/api/sessions/[id]/route.ts");

async function openSession() {
  const cwd = await mkdtemp(join(root, "project-"));
  return startRpcSession("new", "", cwd);
}

test("a Fork opens a live child at the saved Goal boundary and leaves the parent unchanged", { timeout: 60_000 }, async () => {
  const { session: parent, realSessionId: parentId } = await openSession();
  let child;
  try {
    const original = (await parent.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 2_000 })).goal;
    const entryId = parent.inner.sessionManager.appendMessage({
      role: "user", content: [{ type: "text", text: "Start the work" }], timestamp: Date.now(),
    });
    parent.inner.goalRuntime.onTurnStart("parent-turn", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    await parent.inner.goalRuntime.flushUsage("suppressed", { input: 100, output: 0, cacheRead: 0, cacheWrite: 0 });
    await parent.inner.sessionManager.flush();
    const parentFile = parent.inner.sessionFile;

    const fork = await parent.send({ type: "fork", entryId });
    assert.equal(fork.cancelled, false);
    child = getRpcSession(fork.newSessionId);
    assert.equal(child?.isAlive(), true);
    assert.deepEqual((await child.send({ type: "goal", op: "get" })).goal, original);
    child.inner.goalRuntime.onTurnStart("child-turn", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    await child.inner.goalRuntime.flushUsage("suppressed", { input: 40, output: 0, cacheRead: 0, cacheWrite: 0 });
    assert.equal((await child.send({ type: "goal", op: "get" })).goal.tokensUsed, 40);
    assert.equal(getRpcSession(parentId), undefined);

    const { session: reopenedParent } = await startRpcSession(parentId, parentFile, undefined);
    try {
      const parentGoal = (await reopenedParent.send({ type: "goal", op: "get" })).goal;
      assert.equal(parentGoal.id, original.id);
      assert.equal(parentGoal.tokensUsed, 100);
      assert.equal(parentGoal.timeUsedSeconds, original.timeUsedSeconds);
      assert.equal(parentGoal.status, "paused");
    } finally {
      await reopenedParent.shutdown();
    }
  } finally {
    await child?.shutdown();
    await parent.shutdown();
  }
});

test("a cold open restores the last durable Goal fields and pauses an active Goal", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  try {
    const created = (await session.send({ type: "goal", op: "create", objective: "Finish the migration", tokenBudget: 2_000 })).goal;
    const saved = { ...created, tokensUsed: 375, timeUsedSeconds: 18, updatedAt: created.updatedAt + 1 };
    session.inner.sessionManager.appendModeChange("goal", { goal: saved });
    await session.inner.sessionManager.flush();
    const sessionFile = session.inner.sessionFile;
    await session.shutdown();

    const { session: reopened } = await startRpcSession(realSessionId, sessionFile, undefined);
    try {
      const restored = (await reopened.send({ type: "goal", op: "get" })).goal;
      assert.deepEqual(restored, { ...saved, status: "paused", updatedAt: restored.updatedAt });
      assert.ok(restored.updatedAt >= saved.updatedAt);
    } finally {
      await reopened.shutdown();
    }
  } finally {
    await session.shutdown();
  }
});

test("a budget-limited Goal remains limited after a cold open until its budget changes", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  try {
    const created = (await session.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 100 })).goal;
    session.inner.sessionManager.appendModeChange("goal", {
      goal: { ...created, status: "budget-limited", tokensUsed: 110, timeUsedSeconds: 5, updatedAt: created.updatedAt + 1 },
    });
    await session.inner.sessionManager.flush();
    const sessionFile = session.inner.sessionFile;
    await session.shutdown();

    const { session: reopened } = await startRpcSession(realSessionId, sessionFile, undefined);
    try {
      const limited = (await reopened.send({ type: "goal", op: "get" })).goal;
      assert.equal(limited.status, "budget-limited");
      assert.equal(limited.tokensUsed, 110);
      assert.equal(limited.timeUsedSeconds, 5);
      await assert.rejects(reopened.send({ type: "goal", op: "resume" }), (error) => error.code === "goal_invalid_transition");
      await reopened.send({ type: "goal", op: "set_budget", tokenBudget: 150 });
      assert.equal((await reopened.send({ type: "goal", op: "get" })).goal.status, "active");
    } finally {
      await reopened.shutdown();
    }
  } finally {
    await session.shutdown();
  }
});

test("a corrupt Goal can be read and dropped while ordinary Session state stays available", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  try {
    const created = (await session.send({ type: "goal", op: "create", objective: "Finish" })).goal;
    session.inner.sessionManager.appendModeChange("goal", { goal: { ...created, tokensUsed: "invalid" } });
    await session.inner.sessionManager.flush();
    const sessionFile = session.inner.sessionFile;
    await session.shutdown();

    const { session: reopened } = await startRpcSession(realSessionId, sessionFile, undefined);
    try {
      assert.equal((await reopened.send({ type: "get_state" })).sessionId, realSessionId);
      assert.deepEqual(await reopened.send({ type: "goal", op: "get" }), { goal: null, state: null });
      assert.deepEqual(await reopened.send({ type: "goal", op: "drop" }), { goal: null, state: null });
      assert.equal(reopened.inner.sessionManager.buildSessionContext().mode, "none");
    } finally {
      await reopened.shutdown();
    }
  } finally {
    await session.shutdown();
  }
});

test("archiving leaves the Goal entries and live Session unchanged", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  try {
    const created = (await session.send({ type: "goal", op: "create", objective: "Finish" })).goal;
    await session.inner.sessionManager.flush();
    const sessionFile = session.inner.sessionFile;
    const before = await readFile(sessionFile, "utf8");

    const response = await archiveSession(new Request(`http://localhost/api/sessions/${realSessionId}`, {
      method: "PATCH", headers: { host: "localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    }), { params: Promise.resolve({ id: realSessionId }) });

    assert.equal(response.status, 200);
    assert.equal(await readFile(sessionFile, "utf8"), before);
    assert.deepEqual((await session.send({ type: "goal", op: "get" })).goal, created);
    assert.equal(session.inner.isStreaming, false);
  } finally {
    await session.shutdown();
  }
});

test("deleting one Session closes its Wrapper without changing another Goal", { timeout: 60_000 }, async () => {
  const { session: first, realSessionId: firstId } = await openSession();
  const { session: second, realSessionId: secondId } = await openSession();
  try {
    await first.send({ type: "goal", op: "create", objective: "First" });
    const secondGoal = (await second.send({ type: "goal", op: "create", objective: "Second", tokenBudget: 600 })).goal;
    const response = await deleteSession(new Request(`http://localhost/api/sessions/${firstId}`, {
      method: "DELETE", headers: { host: "localhost" },
    }), { params: Promise.resolve({ id: firstId }) });

    assert.equal(response.status, 200);
    assert.equal(first.isAlive(), false);
    assert.equal(getRpcSession(firstId), undefined);
    assert.deepEqual((await second.send({ type: "goal", op: "get" })).goal, secondGoal);
    assert.equal(getRpcSession(secondId)?.isAlive(), true);
  } finally {
    await first.shutdown();
    await second.shutdown();
  }
});

test("shutdown keeps the last durable Goal usage and does not create a continuation", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  try {
    await session.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 500 });
    session.inner.goalRuntime.onTurnStart("last-turn", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    await session.inner.goalRuntime.flushUsage("suppressed", { input: 75, output: 0, cacheRead: 0, cacheWrite: 0 });
    await session.inner.sessionManager.flush();
    const sessionFile = session.inner.sessionFile;
    const before = await SessionManager.open(sessionFile);
    const savedGoal = before.buildSessionContext().modeData.goal;
    const messageCount = before.getEntries().filter((entry) => entry.type === "message").length;

    await session.shutdown();
    const stopped = await SessionManager.open(sessionFile);
    assert.deepEqual(stopped.buildSessionContext().modeData.goal, savedGoal);
    assert.equal(stopped.getEntries().filter((entry) => entry.type === "message").length, messageCount);

    const { session: reopened } = await startRpcSession(realSessionId, sessionFile, undefined);
    try {
      const restored = (await reopened.send({ type: "goal", op: "get" })).goal;
      assert.equal(restored.status, "paused");
      assert.equal(restored.tokensUsed, 75);
      assert.equal(restored.timeUsedSeconds, savedGoal.timeUsedSeconds);
    } finally {
      await reopened.shutdown();
    }
  } finally {
    await session.shutdown();
  }
});

test("reconnect reads a missed Goal update from the same live Wrapper", { timeout: 60_000 }, async () => {
  const { session, realSessionId } = await openSession();
  try {
    await session.send({ type: "goal", op: "create", objective: "Finish", tokenBudget: 500 });
    const sessionFile = session.inner.sessionFile;
    const reconnect = await startRpcSession(realSessionId, sessionFile, undefined);
    assert.equal(reconnect.session, session);

    await session.send({ type: "goal", op: "set_budget", tokenBudget: 300 });
    const savedCount = session.inner.sessionManager.getEntries().length;
    const repaired = await reconnect.session.send({ type: "goal", op: "get" });
    assert.equal(repaired.goal.status, "active");
    assert.equal(repaired.goal.tokenBudget, 300);
    assert.equal(session.inner.sessionManager.getEntries().length, savedCount);
  } finally {
    await session.shutdown();
  }
});

test("a Fork restores the historical Goal when the parent later cleared it", { timeout: 60_000 }, async () => {
  const { session: parent } = await openSession();
  let child;
  try {
    const created = (await parent.send({ type: "goal", op: "create", objective: "Finish" })).goal;
    const entryId = parent.inner.sessionManager.appendMessage({
      role: "user", content: [{ type: "text", text: "Start" }], timestamp: Date.now(),
    });
    await parent.send({ type: "goal", op: "drop" });
    await parent.inner.sessionManager.flush();

    const fork = await parent.send({ type: "fork", entryId });
    child = getRpcSession(fork.newSessionId);
    assert.equal(child?.isAlive(), true);
    const restored = (await child.send({ type: "goal", op: "get" })).goal;
    assert.equal(restored.id, created.id);
    assert.equal(restored.objective, created.objective);
    assert.equal(restored.status, "active");
    assert.equal(restored.tokensUsed, created.tokensUsed);
    assert.equal(restored.timeUsedSeconds, created.timeUsedSeconds);
  } finally {
    await child?.shutdown();
    await parent.shutdown();
  }
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });
