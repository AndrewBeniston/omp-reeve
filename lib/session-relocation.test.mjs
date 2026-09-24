import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { relocateSession } = await jiti.import("./session-relocation.ts");

function createHarness({ failAfterMove = false, gate } = {}) {
  let sessionFile = "/sessions/source.jsonl";
  let cwd = "/repo";
  let alive = true;
  let moveCalls = 0;
  let rollbackCalls = 0;
  let activeMoves = 0;
  let maxActiveMoves = 0;
  const starts = [];
  const allowedRoots = [];
  const cachedPaths = new Map([["session-364", sessionFile]]);
  const registry = new Map();

  const manager = {
    captureState: () => ({ cwd, sessionFile }),
    ensureOnDisk: async () => {},
    flush: async () => {},
    getCwd: () => cwd,
    getSessionId: () => "session-364",
    getSessionFile: () => sessionFile,
    async moveTo(nextCwd) {
      moveCalls += 1;
      activeMoves += 1;
      maxActiveMoves = Math.max(maxActiveMoves, activeMoves);
      try {
        if (gate) await gate.promise;
        cwd = nextCwd;
        sessionFile = `/sessions/${nextCwd.split("/").at(-1)}.jsonl`;
        if (failAfterMove) throw new Error("move failed after changing state");
      } finally {
        activeMoves -= 1;
      }
    },
    async rollbackMove(snapshot) {
      rollbackCalls += 1;
      cwd = snapshot.cwd;
      sessionFile = snapshot.sessionFile;
    },
  };

  const wrapper = {
    inner: { sessionManager: manager },
    get sessionId() { return "session-364"; },
    get sessionFile() { return sessionFile; },
    get cwd() { return cwd; },
    isAlive: () => alive,
    isRunning: () => false,
    send: async (command) => command.type === "get_tools"
      ? [
        { name: "read", description: "Read", active: true },
        { name: "bash", description: "Bash", active: true },
        { name: "edit", description: "Edit", active: true },
        { name: "write", description: "Write", active: true },
      ]
      : null,
    shutdown: async () => {
      alive = false;
      registry.delete("session-364");
    },
  };
  registry.set("session-364", wrapper);

  const dependencies = {
    agentDir: "/agent",
    allowFileRoot: (path) => allowedRoots.push(path),
    cacheSessionPath: (sessionId, path) => cachedPaths.set(sessionId, path),
    canonicalizePath: (path) => path,
    getAllowedRoots: async () => new Set(["/repo", "/repo-worktrees/feature", "/local"]),
    getTrustStatus: (path) => ({ requiresTrust: true, trusted: false }),
    getWrapper: (sessionId) => registry.get(sessionId),
    invalidateSessionList: () => {},
    isAllowedPath: (path) => path.startsWith("/"),
    isExistingAllowedPath: (path) => path.startsWith("/"),
    async resolveProject(path) {
      return { projectRoot: path.startsWith("/repo-worktrees/") ? "/repo" : path };
    },
    resolveSessionPath: async (sessionId) => cachedPaths.get(sessionId) ?? null,
    async startSession(sessionId, file, options) {
      starts.push({ sessionId, file, options });
      sessionFile = file;
      alive = true;
      registry.set(sessionId, wrapper);
      return { session: wrapper, realSessionId: sessionId };
    },
  };

  return {
    dependencies,
    get moveCalls() { return moveCalls; },
    get rollbackCalls() { return rollbackCalls; },
    get maxActiveMoves() { return maxActiveMoves; },
    starts,
    allowedRoots,
    registry,
    manager,
    wrapper,
  };
}

test("local relocation keeps identity and reloads one wrapper at the moved path", async () => {
  const harness = createHarness();
  const result = await relocateSession({ sessionId: "session-364", targetCwd: "/local" }, harness.dependencies);

  assert.equal(result.sessionId, "session-364");
  assert.equal(result.sessionFile, "/sessions/local.jsonl");
  assert.equal(result.projectRoot, "/local");
  assert.equal(harness.starts.length, 1);
  assert.equal(harness.starts[0].sessionId, "session-364");
  assert.equal(harness.starts[0].file, "/sessions/local.jsonl");
  assert.deepEqual(harness.starts[0].options.toolNames, ["read", "bash", "edit", "write"]);
  assert.equal(harness.registry.get("session-364"), harness.wrapper);
  assert.equal(harness.registry.get("session-364").sessionFile, "/sessions/local.jsonl");
  assert.ok(harness.allowedRoots.includes("/local"));
});

test("worktree relocation allows the destination and returns its Project", async () => {
  const harness = createHarness();
  const result = await relocateSession({ sessionId: "session-364", targetCwd: "/repo-worktrees/feature" }, harness.dependencies);

  assert.equal(result.projectRoot, "/repo");
  assert.equal(harness.starts[0].file, "/sessions/feature.jsonl");
  assert.ok(harness.allowedRoots.includes("/repo-worktrees/feature"));
});

test("a failed move restores the source file and keeps one active wrapper", async () => {
  const harness = createHarness({ failAfterMove: true });

  await assert.rejects(
    relocateSession({ sessionId: "session-364", targetCwd: "/local" }, harness.dependencies),
    /move failed after changing state/,
  );
  assert.equal(harness.rollbackCalls, 1);
  assert.equal(harness.manager.getCwd(), "/repo");
  assert.equal(harness.manager.getSessionFile(), "/sessions/source.jsonl");
  assert.equal(harness.registry.size, 1);
  assert.equal(harness.registry.get("session-364"), harness.wrapper);
});

test("concurrent relocation requests share one operation", async () => {
  let release;
  const gate = { promise: new Promise((resolve) => { release = resolve; }) };
  const harness = createHarness({ gate });

  const first = relocateSession({ sessionId: "session-364", targetCwd: "/local" }, harness.dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  const second = relocateSession({ sessionId: "session-364", targetCwd: "/local" }, harness.dependencies);
  assert.equal(harness.moveCalls, 1);
  release();
  const results = await Promise.all([first, second]);

  assert.equal(harness.maxActiveMoves, 1);
  assert.equal(harness.moveCalls, 1);
  assert.equal(harness.starts.length, 1);
  assert.deepEqual(results.map((result) => result.sessionFile), ["/sessions/local.jsonl", "/sessions/local.jsonl"]);
});
