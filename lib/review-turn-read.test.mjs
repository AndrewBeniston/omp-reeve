import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const run = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { readLastTurnDiff } = await jiti.import("./review-turn-read.ts");
const { noteTurnLifecycle, forgetTurnLifecycle } = await jiti.import("./review-turn-recorder.ts");
const { readSpan, writeSpan } = await jiti.import("./review-turn-store.ts");
const { readReviewDiff } = await jiti.import("./review-git.ts");
const { allowFileRoot } = await jiti.import("./file-access.ts");

const git = (cwd, args) => run("git", args, { cwd, encoding: "utf8" });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "reeve-lastturn-"));
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
  /*
   * The recorder stores the repository root as its real path, and macOS gives
   * a temporary directory under a symlink (/var -> /private/var). The reader
   * checks the real path against the allowed roots, so the fixture allows both
   * spellings. Without the real path the check depends on unrelated roots on
   * this computer, which made these tests fail only in some runs.
   */
  allowFileRoot(project);
  allowFileRoot(await realpath(project));
  return { project, agentDir };
}

/** A Session that says it belongs where the test says, so no real one is read. */
const saying = (cwd) => async () => cwd;

/**
 * One prompt that writes through the tool the agent really uses.
 *
 * The pair of executions around the write is what the record is built from: a
 * file that appears without one is somebody else's work and is left out of the
 * turn. See docs/review-last-turn-snapshot.md.
 */
async function recordedPrompt(sessionId, project, agentDir, path, content) {
  forgetTurnLifecycle(sessionId, agentDir);
  const note = (event) => noteTurnLifecycle(sessionId, project, event, agentDir);
  await note({ type: "prompt_started", promptId: "p1" });
  await note({ type: "agent_started" });
  await note({ type: "tool_started", toolCallId: "c1", toolName: "write", args: { path, content } });
  await writeFile(join(project, path), content);
  await note({ type: "tool_ended", toolCallId: "c1", toolName: "write" });
  await note({ type: "prompt_settled" });
  await note({ type: "agent_ended", terminal: true });
}

test("a Session that names no directory of its own is refused", async () => {
  const { project, agentDir } = await fixture();
  const result = await readLastTurnDiff({
    cwd: project, sessionId: "invented", agentDir, sessionCwd: async () => null,
  });
  assert.deepEqual(result, { kind: "unavailable", reason: "no-record", retryable: false });
});

test("a Session working in another directory cannot be read from this one", async () => {
  const { project, agentDir } = await fixture();
  await recordedPrompt("s1", project, agentDir, "a.txt", "changed\n");

  const elsewhere = await readLastTurnDiff({
    cwd: project, sessionId: "s1", agentDir, sessionCwd: saying(join(project, "..", "other-project")),
  });
  assert.equal(elsewhere.reason, "session-mismatch", "a Session elsewhere was answered from this directory's record");
});

test("a prompt still running reads as in progress, and says it is worth retrying", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("s2", agentDir);
  await noteTurnLifecycle("s2", project, { type: "prompt_started", promptId: "p1" }, agentDir);

  const result = await readLastTurnDiff({ cwd: project, sessionId: "s2", agentDir, sessionCwd: saying(project) });
  assert.deepEqual(result, { kind: "unavailable", reason: "in-progress", retryable: true });
});

test("a Session with no snapshot at all is refused rather than shown as unchanged", async () => {
  const { project, agentDir } = await fixture();
  const result = await readLastTurnDiff({ cwd: project, sessionId: "s3", agentDir, sessionCwd: saying(project) });
  assert.deepEqual(result, { kind: "unavailable", reason: "no-record", retryable: false });
});

test("a recorded prompt reads back, and anchors comments exactly as the other scopes do", async () => {
  const { project, agentDir } = await fixture();
  await recordedPrompt("s4", project, agentDir, "a.txt", "written by the run\n");

  const result = await readLastTurnDiff({ cwd: project, sessionId: "s4", agentDir, sessionCwd: saying(project) });
  assert.equal(result.kind, "diff");
  assert.match(result.diff.patch, /\+written by the run/);
  assert.equal(result.diff.scope.kind, "lastTurn");
  assert.equal(result.diff.conflictedFiles.length, 0);

  // The working tree still holds exactly what the prompt left, so the
  // uncommitted view is showing the same document. A comment written there
  // must not read as outdated here, which it would if the two scopes
  // identified a file by different means.
  const uncommitted = await readReviewDiff(project, { kind: "uncommitted" });
  assert.equal(
    result.diff.fileRevisions["a.txt"],
    uncommitted.fileRevisions["a.txt"],
    "one file has two identities across scopes, so comments would read as outdated",
  );
});

test("files the capture could not represent are named, not silently missing", async () => {
  const { project, agentDir } = await fixture();
  await recordedPrompt("s5", project, agentDir, "a.txt", "changed\n");
  const span = await readSpan("s5", agentDir);
  await writeSpan({ ...span, skippedPaths: ["binary.bin"] }, agentDir);

  const result = await readLastTurnDiff({ cwd: project, sessionId: "s5", agentDir, sessionCwd: saying(project) });
  assert.deepEqual(result.diff.skippedPaths, ["binary.bin"]);
});
