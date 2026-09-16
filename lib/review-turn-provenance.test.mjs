import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const run = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { noteTurnLifecycle, forgetTurnLifecycle } = await jiti.import("./review-turn-recorder.ts");
const { readSpan, writeSpan } = await jiti.import("./review-turn-store.ts");
const { readLastTurnDiff } = await jiti.import("./review-turn-read.ts");
const { allowFileRoot } = await jiti.import("./file-access.ts");

const git = (cwd, args) => run("git", args, { cwd, encoding: "utf8" });

/**
 * What a last turn shows, held against the working tree it is read beside.
 *
 * The answer comes from two recorded moments and the run's own tool results,
 * so it cannot be derived from HEAD or from what the files say now. These tests
 * move the working tree underneath a fixed record: somebody saving while the
 * prompt runs, the work being committed or put back, a tool that fails, and a
 * shell nobody can follow. See docs/review-last-turn-snapshot.md.
 */
async function fixture() {
  // Resolved here, because Git reports the repository by its real path and the
  // allowed roots are compared as written. On a computer whose temporary
  // directory is a symbolic link, an unresolved root is never matched.
  const root = await realpath(await mkdtemp(join(tmpdir(), "reeve-provenance-")));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(project, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await git(project, ["init", "-q", "."]);
  await git(project, ["config", "user.email", "a@b.c"]);
  await git(project, ["config", "user.name", "a"]);
  await writeFile(join(project, "tracked.txt"), "committed\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  allowFileRoot(project);
  return { project, agentDir };
}

/** A Session that says it belongs where the test says, so no real one is read. */
const saying = (cwd) => async () => cwd;

const read = (project, agentDir, sessionId) =>
  readLastTurnDiff({ cwd: project, sessionId, agentDir, sessionCwd: saying(project) });

/**
 * One prompt, driven a step at a time.
 *
 * Each step is a tool call: its arguments, the change it makes on disk, and the
 * result it reports. The result is what `edit` is held to, so a step states it
 * exactly as the SDK would.
 */
function driver(sessionId, project, agentDir) {
  forgetTurnLifecycle(sessionId, agentDir);
  const note = (event) => noteTurnLifecycle(sessionId, project, event, agentDir);
  let calls = 0;
  return {
    open: async () => {
      await note({ type: "prompt_started", promptId: "p1" });
      await note({ type: "agent_started" });
    },
    /** A tool call: `apply` runs between the call starting and its result. */
    call: async ({ tool, args = {}, result, isError, apply }) => {
      calls += 1;
      const toolCallId = "c" + calls;
      await note({ type: "tool_started", toolCallId, toolName: tool, args });
      if (apply) await apply();
      await note({ type: "tool_ended", toolCallId, toolName: tool, result, isError });
    },
    byHand: (path, content) => writeFile(join(project, path), content),
    close: async () => {
      await note({ type: "prompt_settled" });
      await note({ type: "agent_ended", terminal: true });
      return readSpan(sessionId, agentDir);
    },
  };
}

const edited = (path, oldText, newText, extra = {}) => ({ details: { path, oldText, newText, ...extra } });

test("a write is shown, and an edit somebody saved elsewhere while it ran is not", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s1", project, agentDir);
  await run.open();
  await run.call({
    tool: "write",
    args: { path: "by-the-run.txt", content: "written by the run\n" },
    apply: () => run.byHand("by-the-run.txt", "written by the run\n"),
  });
  await run.byHand("tracked.txt", "saved by hand while the prompt ran\n");
  await run.close();

  const result = await read(project, agentDir, "s1");
  assert.equal(result.kind, "diff");
  assert.match(result.diff.patch, /by-the-run\.txt/);
  assert.doesNotMatch(result.diff.patch, /tracked\.txt/, "a hand edit during the prompt was shown as its work");
  assert.deepEqual(result.diff.unattributedPaths, ["tracked.txt"]);
  assert.deepEqual(result.diff.incompleteTools, []);
});

test("an edit is shown when the file held what the edit says it held", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s2", project, agentDir);
  await run.open();
  await run.call({
    tool: "edit",
    args: { path: "tracked.txt" },
    result: edited("tracked.txt", "committed\n", "edited by the run\n"),
    apply: () => run.byHand("tracked.txt", "edited by the run\n"),
  });
  await run.close();

  const result = await read(project, agentDir, "s2");
  assert.match(result.diff.patch, /\+edited by the run/);
  assert.deepEqual(result.diff.unattributedPaths, []);
});

test("an edit over somebody else's unsaved change is not claimed", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s3", project, agentDir);
  await run.open();
  // Saved by hand after the baseline. The edit that follows keeps most of the
  // file, so this text would survive inside what the tool reports writing.
  await run.byHand("tracked.txt", "somebody got here first\n");
  await run.call({
    tool: "edit",
    args: { path: "tracked.txt" },
    // The tool read the file it found and reports that as its before state,
    // which is not what this run last left there.
    result: edited("tracked.txt", "somebody got here first\n", "somebody got here first, then the run\n"),
    apply: () => run.byHand("tracked.txt", "somebody got here first, then the run\n"),
  });
  await run.close();

  const result = await read(project, agentDir, "s3");
  assert.doesNotMatch(result.diff.patch, /tracked\.txt/, "an edit onto a hand change was claimed");
  assert.deepEqual(result.diff.unattributedPaths, ["tracked.txt"]);
});

test("two edits to one file chain against what the run last left, not disk", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s4", project, agentDir);
  await run.open();
  await run.call({
    tool: "edit",
    args: { path: "tracked.txt" },
    result: edited("tracked.txt", "committed\n", "once\n"),
    apply: () => run.byHand("tracked.txt", "once\n"),
  });
  await run.call({
    tool: "edit",
    args: { path: "tracked.txt" },
    result: edited("tracked.txt", "once\n", "twice\n"),
    apply: () => run.byHand("tracked.txt", "twice\n"),
  });
  await run.close();

  const result = await read(project, agentDir, "s4");
  assert.match(result.diff.patch, /\+twice/);
  assert.deepEqual(result.diff.unattributedPaths, []);
});

test("a rename and a delete are accounted for on both paths", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s5", project, agentDir);
  await run.open();
  await run.call({
    tool: "edit",
    args: {},
    result: edited("moved.txt", "committed\n", "committed\n", { sourcePath: "tracked.txt" }),
    apply: async () => {
      await run.byHand("moved.txt", "committed\n");
      await rm(join(project, "tracked.txt"));
    },
  });
  await run.close();

  const result = await read(project, agentDir, "s5");
  assert.match(result.diff.patch, /moved\.txt/);
  assert.match(result.diff.patch, /tracked\.txt/, "the path it was moved from is missing from the turn");
  assert.deepEqual(result.diff.unattributedPaths, []);
});

test("a move whose source somebody changed first claims neither path", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s5b", project, agentDir);
  await run.open();
  // Saved by hand after the baseline, into the file the run is about to move.
  await run.byHand("tracked.txt", "somebody got here first\n");
  await run.call({
    tool: "edit",
    args: {},
    // The tool reports what it found, which is not what this run left there.
    result: edited("moved.txt", "somebody got here first\n", "somebody got here first\n", {
      sourcePath: "tracked.txt",
    }),
    apply: async () => {
      await run.byHand("moved.txt", "somebody got here first\n");
      await rm(join(project, "tracked.txt"));
    },
  });
  await run.close();

  // Nothing was required of the destination on its own, so without the group
  // the contaminated file would move across and be claimed there.
  const result = await read(project, agentDir, "s5b");
  assert.doesNotMatch(result.diff.patch, /moved\.txt/, "a move carried somebody else's text in and claimed it");
  assert.doesNotMatch(result.diff.patch, /tracked\.txt/);
  assert.deepEqual(result.diff.unattributedPaths.sort(), ["moved.txt", "tracked.txt"]);
});

test("a move from outside the repository claims nothing on the way in", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s5c", project, agentDir);
  await run.open();
  // The source sits outside the repository, so its requirement cannot be
  // checked here. Dropping that claim and keeping the destination would let
  // content nobody verified arrive inside the repository as the run's work.
  await run.call({
    tool: "edit",
    args: {},
    result: edited("moved-in.txt", "from elsewhere\n", "from elsewhere\n", {
      sourcePath: join(project, "..", "outside.txt"),
    }),
    apply: () => run.byHand("moved-in.txt", "from elsewhere\n"),
  });
  await run.close();

  const result = await read(project, agentDir, "s5c");
  assert.doesNotMatch(result.diff.patch, /moved-in\.txt/, "a move from outside was claimed on arrival");
  assert.deepEqual(result.diff.unattributedPaths, ["moved-in.txt"]);
});

test("a shell narrows the turn to what other tools proved, and is named", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s6", project, agentDir);
  await run.open();
  await run.call({ tool: "grep", args: { pattern: "committed" } });
  await run.call({
    tool: "write",
    args: { path: "by-the-run.txt", content: "written by the run\n" },
    apply: () => run.byHand("by-the-run.txt", "written by the run\n"),
  });
  // The shell is the agent too, so what it did is missing coverage rather than
  // somebody else's work — but it cannot be enumerated, so it is named.
  await run.call({
    tool: "bash",
    args: { command: "printf x > by-the-shell.txt" },
    apply: () => run.byHand("by-the-shell.txt", "x"),
  });
  await run.close();

  const result = await read(project, agentDir, "s6");
  assert.equal(result.kind, "diff", "a shell refused the whole turn instead of narrowing it");
  assert.match(result.diff.patch, /by-the-run\.txt/);
  assert.doesNotMatch(result.diff.patch, /by-the-shell\.txt/);
  assert.deepEqual(result.diff.unattributedPaths, ["by-the-shell.txt"]);
  assert.deepEqual(result.diff.incompleteTools, ["bash"]);
});

test("a tool that failed is not credited, whatever the file ended up holding", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s7", project, agentDir);
  await run.open();
  await run.call({
    tool: "write",
    args: { path: "by-the-run.txt", content: "written by the run\n" },
    isError: true,
    // The content matches what the failed call intended. Somebody else put it
    // there, or it landed in part; either way the tool did not report success.
    apply: () => run.byHand("by-the-run.txt", "written by the run\n"),
  });
  await run.close();

  const result = await read(project, agentDir, "s7");
  assert.doesNotMatch(result.diff.patch, /by-the-run\.txt/, "a failed tool was credited");
  assert.deepEqual(result.diff.unattributedPaths, ["by-the-run.txt"]);
  assert.deepEqual(result.diff.incompleteTools, ["write"]);
});

test("committing or putting back the work does not change what the turn shows", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s8", project, agentDir);
  await run.open();
  await run.call({
    tool: "edit",
    args: { path: "tracked.txt" },
    result: edited("tracked.txt", "committed\n", "edited by the run\n"),
    apply: () => run.byHand("tracked.txt", "edited by the run\n"),
  });
  await run.close();
  const before = await read(project, agentDir, "s8");

  await git(project, ["add", "-A"]);
  await git(project, ["commit", "-qm", "the run's work"]);
  const committed = await read(project, agentDir, "s8");
  assert.equal(committed.diff.patch, before.diff.patch, "HEAD moved and the recorded turn moved with it");

  // Undoing the work afterwards is a later event, not a correction.
  await run.byHand("tracked.txt", "committed\n");
  const reverted = await read(project, agentDir, "s8");
  assert.equal(reverted.diff.patch, before.diff.patch);
});

test("a turn recorded before any of this was kept is refused, not drawn as empty", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s9", project, agentDir);
  await run.open();
  await run.call({
    tool: "write",
    args: { path: "by-the-run.txt", content: "written by the run\n" },
    apply: () => run.byHand("by-the-run.txt", "written by the run\n"),
  });
  const span = await run.close();
  await writeSpan({ ...span, provenance: undefined }, agentDir);

  const result = await read(project, agentDir, "s9");
  assert.equal(result.kind, "unavailable");
  assert.equal(result.reason, "attribution-unavailable");
});

test("each untrusted condition answers with its own reason, and only one is worth retrying", async () => {
  const { project, agentDir } = await fixture();
  const run = driver("s10", project, agentDir);
  await run.open();
  await run.call({
    tool: "write",
    args: { path: "by-the-run.txt", content: "written by the run\n" },
    apply: () => run.byHand("by-the-run.txt", "written by the run\n"),
  });
  const recorded = await run.close();

  const answered = [];
  for (const reason of ["budget-exceeded", "capture-failed", "store-unavailable", "unsettled", "not-a-repository"]) {
    await writeSpan({ ...recorded, status: "completed", unavailable: reason }, agentDir);
    const result = await read(project, agentDir, "s10");
    assert.equal(result.reason, reason);
    assert.equal(result.retryable, false);
    answered.push(result.reason);
  }

  await writeSpan({ ...recorded, status: "completed", beforeTree: undefined, afterTree: undefined }, agentDir);
  answered.push((await read(project, agentDir, "s10")).reason);

  await writeSpan({ ...recorded, status: "running", unavailable: undefined }, agentDir);
  const running = await read(project, agentDir, "s10");
  assert.deepEqual(running, { kind: "unavailable", reason: "in-progress", retryable: true });
  answered.push(running.reason);

  await writeSpan({ ...recorded, status: "completed", provenance: undefined }, agentDir);
  answered.push((await read(project, agentDir, "s10")).reason);

  answered.push((await read(project, agentDir, "s11")).reason);
  await writeSpan(recorded, agentDir);
  const elsewhere = await readLastTurnDiff({
    cwd: project, sessionId: "s10", agentDir, sessionCwd: saying(join(project, "..", "other")),
  });
  answered.push(elsewhere.reason);

  assert.deepEqual(answered, [
    "budget-exceeded", "capture-failed", "store-unavailable", "unsettled", "not-a-repository",
    "baseline-missing", "in-progress", "attribution-unavailable", "no-record", "session-mismatch",
  ]);
});
