import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const run = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  writeSpan, setSessionRun, readSpan, readRun, readRuns, runRetention,
  spanDiffState, storePathFor, newRunId, currentOwner, ownerIsGone,
} = await jiti.import("./review-turn-store.ts");

const agentDirectory = () => mkdtemp(join(tmpdir(), "reeve-span-"));
/** A process identifier the system knows nothing about, so its owner is certainly gone. */
const deadOwner = { host: hostname(), pid: 65000, birth: "Mon Aug 24 22:57:12 2026" };
const liveOwner = await currentOwner();

const span = (sessionId, startedAt, status = "completed", owner = liveOwner) => ({
  runId: newRunId(sessionId),
  sessionId,
  promptId: sessionId + ":1",
  cwd: "/repo/" + sessionId,
  repositoryRoot: "/repo/" + sessionId,
  startedAt,
  status,
  owner,
  beforeTree: "t1",
  afterTree: "t2",
});

async function fillStore(record, agentDir, bytes) {
  const store = storePathFor(record, agentDir);
  await mkdir(join(store, "objects"), { recursive: true });
  await writeFile(join(store, "objects", "pack"), Buffer.alloc(bytes));
  return store;
}

async function place(record, agentDir, bytes = 16) {
  await writeSpan(record, agentDir);
  await setSessionRun(record.sessionId, record.runId, agentDir);
  await fillStore(record, agentDir, bytes);
  return record;
}

test("two processes working one session keep both records, and one of them is current", async () => {
  const agentDir = await agentDirectory();
  const script = (promptId) => `
    const { createJiti } = await import("jiti");
    const jiti = createJiti("${import.meta.url}", { tsconfigPaths: true });
    const store = await jiti.import("${new URL("./review-turn-store.ts", import.meta.url).pathname}");
    const runId = store.newRunId("shared");
    await store.writeSpan({
      runId, sessionId: "shared", promptId: "${promptId}", cwd: "/repo", repositoryRoot: "/repo",
      startedAt: new Date().toISOString(), status: "running", owner: store.currentOwner(),
    }, "${agentDir}");
    await store.setSessionRun("shared", runId, "${agentDir}");
  `;

  await Promise.all([
    run("bun", ["-e", script("p1")], { encoding: "utf8" }),
    run("bun", ["-e", script("p2")], { encoding: "utf8" }),
  ]);

  const runs = await readRuns(agentDir);
  assert.equal(runs.length, 2, "one process's run record overwrote the other's");
  const current = await readSpan("shared", agentDir);
  assert.ok(["p1", "p2"].includes(current.promptId), "the session points at neither run");
});

test("a record is replaced whole, leaving no temporary behind", async () => {
  const agentDir = await agentDirectory();
  const first = span("s1", "2026-09-14T10:00:00Z");
  await writeSpan(first, agentDir);
  await setSessionRun("s1", first.runId, agentDir);
  await writeSpan({ ...first, status: "interrupted" }, agentDir);

  assert.equal((await readSpan("s1", agentDir)).status, "interrupted");
  assert.equal((await readRun(first.runId, agentDir)).status, "interrupted");
  assert.deepEqual(await readdir(join(agentDir, "review-turns", "runs")), [first.runId + ".json"]);
});

test("an owner is judged on identity, never on age", async () => {
  // This process is alive however old the run it opened, and its identity is
  // read from the system rather than worked out from the clock.
  assert.ok(liveOwner.birth, "the system must report this process's own birth");
  assert.equal(await ownerIsGone(liveOwner), false);
  // A process the system does not know at all.
  assert.equal(await ownerIsGone(deadOwner), true);
  // This process's number, recorded against a birth that is not its own: the
  // number was inherited, so whoever recorded it is gone.
  assert.equal(await ownerIsGone({ ...liveOwner, birth: "Mon Aug 24 22:57:12 2026" }), true);
  // A record made where the system could not be asked proves nothing, so the
  // run is kept rather than collected.
  assert.equal(await ownerIsGone({ host: hostname(), pid: process.pid }), false);
  // Another machine cannot be questioned from here.
  assert.equal(await ownerIsGone({ host: "somewhere-else", pid: 65000, birth: "whenever" }), false);
  assert.equal(await ownerIsGone(undefined), false);
});

test("a process's identity does not move when the clock does", async () => {
  // Read twice, with the clock's own units deliberately unused: the system
  // reports an absolute birth, so two readings of one live process agree
  // whatever has happened to the wall clock in between.
  const first = await currentOwner();
  const second = await currentOwner();
  assert.equal(first.birth, second.birth);
  assert.equal(await ownerIsGone({ ...first, birth: second.birth }), false);
});

test("retention collects a store no run claims, and leaves a store being created alone", async () => {
  const agentDir = await agentDirectory();
  const kept = await place(span("kept", "2026-09-14T10:00:00Z"), agentDir);
  // A run record written but whose store does not exist yet is exactly what an
  // opening capture looks like from another process.
  const opening = span("opening", "2026-09-14T10:00:01Z", "running");
  await writeSpan(opening, agentDir);
  await setSessionRun("opening", opening.runId, agentDir);
  await fillStore({ runId: "abandoned" }, agentDir, 16);

  await runRetention(agentDir);

  assert.equal(existsSync(storePathFor(kept, agentDir)), true, "a store its run still claims was collected");
  assert.ok(await readRun(opening.runId, agentDir), "a run whose store is still being created was dropped");
  assert.equal(existsSync(join(agentDir, "review-turns", "stores", "abandoned.git")), false);
});

test("the byte budget drops the oldest finished run, never one a live process owns", async () => {
  const agentDir = await agentDirectory();
  const old = await place(span("old", "2026-09-14T09:00:00Z"), agentDir, 4096);
  const recent = await place(span("recent", "2026-09-14T11:00:00Z"), agentDir, 4096);
  // Older than both, and running for far longer than any age rule would allow.
  const live = await place(span("live", "2020-01-01T00:00:00Z", "running"), agentDir, 4096);

  await runRetention(agentDir, { maxBytes: 9000 });

  assert.equal(await readRun(old.runId, agentDir), null, "the oldest finished run was not dropped for the budget");
  assert.equal(existsSync(storePathFor(old, agentDir)), false, "its store outlived its record");
  assert.ok(await readRun(recent.runId, agentDir), "the newest finished run went before the oldest");
  assert.ok(await readRun(live.runId, agentDir), "a long-running capture was collected on age alone");
  assert.equal(existsSync(storePathFor(live, agentDir)), true);
});

test("a run whose owner is certainly gone is collected, whatever its age", async () => {
  const agentDir = await agentDirectory();
  const abandoned = await place(span("abandoned", new Date().toISOString(), "running", deadOwner), agentDir, 4096);
  const live = await place(span("live", "2020-01-01T00:00:00Z", "running"), agentDir, 4096);

  await runRetention(agentDir, { maxBytes: 5000 });

  assert.equal(await readRun(abandoned.runId, agentDir), null, "a run no process is writing was kept for ever");
  assert.ok(await readRun(live.runId, agentDir), "a live owner's run was collected");
});

test("the run count is bounded, and a live run is not counted out", async () => {
  const agentDir = await agentDirectory();
  const secondsAgo = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
  const finished = [];
  for (let index = 0; index < 4; index += 1) {
    finished.push(await place(span("s" + index, secondsAgo(40 - index * 10)), agentDir));
  }
  // Older than every finished run, so only its owner can save it.
  const live = await place(span("live", secondsAgo(60), "running"), agentDir);

  await runRetention(agentDir, { maxRuns: 2 });

  const remaining = (await readRuns(agentDir)).map((entry) => entry.sessionId).sort();
  assert.deepEqual(remaining, ["live", "s2", "s3"], "retention kept the wrong runs");
  // A session whose run is gone keeps no pointer to it.
  assert.equal(await readSpan(finished[0].sessionId, agentDir), null);
  assert.ok(await readSpan("live", agentDir));
});

test("a run still running reads as unavailable, never as a finished interval", () => {
  assert.deepEqual(spanDiffState(span("s1", "2026-09-14T10:00:00Z", "running")), {
    kind: "unavailable",
    reason: "in-progress",
  });

  const refused = { ...span("s2", "2026-09-14T10:00:00Z"), beforeTree: undefined, unavailable: "budget-exceeded" };
  assert.deepEqual(spanDiffState(refused), { kind: "unavailable", reason: "budget-exceeded" });

  assert.deepEqual(spanDiffState(span("s3", "2026-09-14T10:00:00Z")), {
    kind: "ready",
    beforeTree: "t1",
    afterTree: "t2",
  });
});
