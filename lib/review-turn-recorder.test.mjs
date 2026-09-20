import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const run = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { noteTurnLifecycle, forgetTurnLifecycle, hasSettleTimer } = await jiti.import("./review-turn-recorder.ts");
const { readSpan, readRun, readRuns, writeSpan, storePathFor } = await jiti.import("./review-turn-store.ts");
const { diffSpan } = await jiti.import("./review-turn-capture.ts");

const git = (cwd, args) => run("git", args, { cwd, encoding: "utf8" });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "reeve-recorder-"));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(project, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await git(project, ["init", "-q", "."]);
  await git(project, ["config", "user.email", "a@b.c"]);
  await git(project, ["config", "user.name", "a"]);
  await writeFile(join(project, "a.txt"), "before the prompt\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  return { project, agentDir };
}

/** Wait for a span written by work that was deliberately not awaited. */
async function settles(sessionId, agentDir, predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const span = await readSpan(sessionId, agentDir);
    if (span && predicate(span)) return span;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return readSpan(sessionId, agentDir);
}

test("a prompt records what changed while it ran", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s1", agentDir);

  // The workspace is clean when the prompt starts, so its baseline is the
  // Project's own HEAD tree — the case where the snapshot store holds no copy
  // of its own.
  await noteTurnLifecycle("s1", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  await noteTurnLifecycle("s1", project, { type: "agent_started" }, agentDir);
  // Whatever changes the workspace during the prompt lands in the interval,
  // wherever it came from.
  await writeFile(join(project, "a.txt"), "written while the prompt ran\n");
  await noteTurnLifecycle("s1", project, { type: "continuation" }, agentDir);
  await noteTurnLifecycle("s1", project, { type: "prompt_settled" }, agentDir);
  // The run has yet to report a terminal end, so the span stays open.
  assert.equal((await readSpan("s1", agentDir)).status, "running");
  await noteTurnLifecycle("s1", project, { type: "agent_ended", terminal: true }, agentDir);

  const span = await readSpan("s1", agentDir);
  assert.equal(span.status, "completed");
  assert.ok(span.beforeTree && span.afterTree, "a closed span must carry both sides");
  // The span records the resolved repository root, which is what a reader must
  // use: a Session's own directory can be a symlink to it.
  assert.equal(span.repositoryRoot, await realpath(project));
  assert.equal(hasSettleTimer("s1"), false, "a closed span left a timer armed");

  const patch = await diffSpan(span, { agentDir });
  assert.equal(patch.kind, "patch");
  assert.match(patch.patch, /\+written while the prompt ran/);

  const refs = await run(
    "git",
    ["--git-dir", storePathFor(span, agentDir), "for-each-ref", "--format=%(refname)", "refs/spans"],
    { encoding: "utf8" },
  );
  assert.match(refs.stdout, /refs\/spans\/s1\/before/);
  assert.match(refs.stdout, /refs\/spans\/s1\/after/);
});

test("an interrupted prompt is recorded once the prompt itself settles", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s2", agentDir);

  await noteTurnLifecycle("s2", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  await noteTurnLifecycle("s2", project, { type: "agent_started" }, agentDir);
  await writeFile(join(project, "a.txt"), "half written\n");
  await noteTurnLifecycle("s2", project, { type: "abort_requested" }, agentDir);

  assert.equal((await readSpan("s2", agentDir)).status, "running", "the abort request must not close the span");

  await noteTurnLifecycle("s2", project, { type: "prompt_settled" }, agentDir);
  await noteTurnLifecycle("s2", project, { type: "agent_ended", terminal: true }, agentDir);
  const span = await readSpan("s2", agentDir);
  assert.equal(span.status, "interrupted");
  assert.ok(span.afterTree, "an interrupted prompt still records where it got to");
});

test("a run that never reports its end records no end state", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s4", agentDir);

  await noteTurnLifecycle("s4", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  await noteTurnLifecycle("s4", project, { type: "agent_started" }, agentDir);
  await writeFile(join(project, "a.txt"), "still being written\n");
  await noteTurnLifecycle("s4", project, { type: "prompt_settled" }, agentDir);
  await noteTurnLifecycle("s4", project, { type: "settle_timeout" }, agentDir);

  const span = await readSpan("s4", agentDir);
  assert.equal(span.status, "interrupted");
  assert.equal(span.afterTree, undefined, "a workspace still being written must not be captured as an end state");
  assert.equal(span.unavailable, "unsettled");
});

test("a directory outside a repository records why, and writes no store", async () => {
  const root = await mkdtemp(join(tmpdir(), "reeve-plain-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { recursive: true });
  forgetTurnLifecycle("s3", agentDir);

  await noteTurnLifecycle("s3", root, { type: "prompt_started", promptId: "p1" }, agentDir);
  const span = await readSpan("s3", agentDir);

  assert.equal(span.unavailable, "not-a-repository");
  assert.equal(span.beforeTree, undefined);
  assert.equal(existsSync(storePathFor(span, agentDir)), false);
});

test("an end left over from a finished run cannot close the run after it", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s5", agentDir);

  await noteTurnLifecycle("s5", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  await noteTurnLifecycle("s5", project, { type: "agent_started" }, agentDir);
  // A terminal end arrives before the prompt promise settles, and the SDK then
  // starts a continuation anyway.
  await noteTurnLifecycle("s5", project, { type: "agent_ended", terminal: true }, agentDir);
  assert.equal(hasSettleTimer("s5"), true, "a prompt owed half its ending must be waited on");
  await noteTurnLifecycle("s5", project, { type: "agent_started" }, agentDir);
  assert.equal(hasSettleTimer("s5"), false, "nothing is owed while a run is executing");

  await writeFile(join(project, "a.txt"), "written by the continuation\n");
  await noteTurnLifecycle("s5", project, { type: "prompt_settled" }, agentDir);
  assert.equal(
    (await readSpan("s5", agentDir)).status,
    "running",
    "a stale end closed a span over a workspace the run was still writing",
  );

  await noteTurnLifecycle("s5", project, { type: "agent_ended", terminal: true }, agentDir);
  const span = await readSpan("s5", agentDir);
  assert.equal(span.status, "completed");
  const patch = await diffSpan(span, { agentDir });
  assert.match(patch.patch, /\+written by the continuation/);
});

test("events are recorded in the order they were raised, not the order they finish", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s6", agentDir);

  // Nothing here is awaited in turn: the caller hands the events over as the
  // session raises them, and the recorder is what keeps them in order.
  noteTurnLifecycle("s6", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  noteTurnLifecycle("s6", project, { type: "agent_started" }, agentDir);
  noteTurnLifecycle("s6", project, { type: "prompt_settled" }, agentDir);
  await noteTurnLifecycle("s6", project, { type: "agent_ended", terminal: true }, agentDir);

  const span = await readSpan("s6", agentDir);
  assert.equal(span.status, "completed", "an end that overtook its own opening left the span unclosed");
  assert.ok(span.beforeTree && span.afterTree);
});

test("a destroyed session closes what it had open, and its later events touch nothing", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s7", agentDir);

  await noteTurnLifecycle("s7", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  await noteTurnLifecycle("s7", project, { type: "agent_started" }, agentDir);
  await noteTurnLifecycle("s7", project, { type: "agent_ended", terminal: true }, agentDir);
  assert.equal(hasSettleTimer("s7"), true);

  forgetTurnLifecycle("s7", agentDir);
  assert.equal(hasSettleTimer("s7"), false, "a destroyed session left a timer armed");

  const closed = await settles("s7", agentDir, (span) => span.status !== "running");
  assert.equal(closed.status, "interrupted");
  assert.equal(closed.unavailable, "unsettled");
  assert.equal(closed.afterTree, undefined, "a session nobody is watching must not be recorded as finished");

  // An event queued against the session that was destroyed must not revive it.
  await noteTurnLifecycle("s7", project, { type: "prompt_settled" }, agentDir);
  assert.equal((await readSpan("s7", agentDir)).status, "interrupted");
});

test("a prompt that replaces another leaves that run's record and objects alone", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s8", agentDir);

  await noteTurnLifecycle("s8", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  const first = await readSpan("s8", agentDir);
  await noteTurnLifecycle("s8", project, { type: "prompt_started", promptId: "p2" }, agentDir);
  const second = await readSpan("s8", agentDir);

  assert.notEqual(first.runId, second.runId, "a new prompt must not write into the store it replaced");
  assert.equal(second.promptId, "p2", "the session must point at the prompt that is current");
  // Another process may be part-way through the run this one replaced, so its
  // record and its objects stay until retention decides they are finished with.
  const superseded = await readRun(first.runId, agentDir);
  assert.equal(superseded.status, "superseded");
  assert.equal(existsSync(storePathFor(first, agentDir)), true, "a replaced run's objects were deleted under it");
  assert.equal(existsSync(storePathFor(second, agentDir)), true);
});

test("a run that finishes after another has opened does not take the Session back", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s9", agentDir);

  await noteTurnLifecycle("s9", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  const first = await readSpan("s9", agentDir);
  await noteTurnLifecycle("s9", project, { type: "prompt_started", promptId: "p2" }, agentDir);
  const second = await readSpan("s9", agentDir);

  // The replaced run's own writes land late: its capture finishing, and the
  // ending written when the Session that owned it was torn down.
  await writeSpan({ ...first, beforeTree: "late" }, agentDir);
  await writeSpan({ ...first, status: "interrupted", unavailable: "unsettled" }, agentDir);

  const current = await readSpan("s9", agentDir);
  assert.equal(current.runId, second.runId, "a late write moved the Session back to the run it replaced");
  assert.equal(current.status, "running");
  assert.equal((await readRun(first.runId, agentDir)).status, "interrupted", "the late write never reached its own record");
});

test("a run still opening when its Session is replaced does not publish over the replacement", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s10", agentDir);

  // Left in flight on purpose: opening asks the system who owns the run and
  // resolves the repository before it publishes anything.
  const opening = noteTurnLifecycle("s10", project, { type: "prompt_started", promptId: "p1" }, agentDir);
  await new Promise((resolve) => setTimeout(resolve, 5));
  // Destroyed and started again while that first open is still running.
  forgetTurnLifecycle("s10", agentDir);
  await noteTurnLifecycle("s10", project, { type: "prompt_started", promptId: "p2" }, agentDir);
  await opening;

  const first = (await readRuns(agentDir)).find((run) => run.promptId === "p1");
  // Without this the race was never reached: the first open would have been
  // dropped on the way in rather than part-way through.
  assert.ok(first, "the first open stopped before it could publish, so nothing was tested");

  const current = await readSpan("s10", agentDir);
  assert.equal(current.promptId, "p2", "a run that was still opening published over the Session that replaced it");
  assert.notEqual(current.runId, first.runId);
});
