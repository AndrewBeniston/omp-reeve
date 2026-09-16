import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createJiti } from "jiti";

const run = promisify(execFile);
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { noteTurnLifecycle, forgetTurnLifecycle, turnEventForAgentEvent } = await jiti.import("./review-turn-recorder.ts");
const { readSpan } = await jiti.import("./review-turn-store.ts");
const { diffSpan } = await jiti.import("./review-turn-capture.ts");

const git = (cwd, args) => run("git", args, { cwd, encoding: "utf8" });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "reeve-adapter-"));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(project, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await git(project, ["init", "-q", "."]);
  await git(project, ["config", "user.email", "a@b.c"]);
  await git(project, ["config", "user.name", "a"]);
  await writeFile(join(project, "a.txt"), "before\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  return { project, agentDir };
}

/**
 * The Session wrapper's own call order, with no model behind it.
 *
 * Each method stands where one call sits in `rpc-manager`: `prompt` before
 * `inner.prompt`, `emit` inside the subscribe handler, `settled` in the
 * prompt promise's `then`/`catch`, `abort` in the abort command, `destroy`
 * in `destroy()`. The events carry the shapes the SDK really emits, including
 * an `agent_end` that names no `isTerminal` at all.
 */
function wrapper(sessionId, cwd, agentDir) {
  const note = (event) => noteTurnLifecycle(sessionId, cwd, event, agentDir);
  return {
    prompt: (streamingBehavior) =>
      note(streamingBehavior ? { type: "continuation" } : { type: "prompt_started", promptId: randomUUID() }),
    emit: (event) => {
      const turnEvent = turnEventForAgentEvent(event);
      return turnEvent ? note(turnEvent) : Promise.resolve();
    },
    settled: (failed) => note({ type: "prompt_settled", ...(failed ? { failed: true } : {}) }),
    abort: () => note({ type: "abort_requested" }),
    destroy: () => forgetTurnLifecycle(sessionId, agentDir),
  };
}

test("an agent_end that names no isTerminal ends the prompt", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("w1", agentDir);
  const session = wrapper("w1", project, agentDir);

  await session.prompt();
  await session.emit({ type: "agent_start" });
  await writeFile(join(project, "a.txt"), "written by the run\n");
  // The SDK's own consumers read a missing flag as a final settle.
  await session.emit({ type: "agent_end" });
  await session.settled();

  const span = await readSpan("w1", agentDir);
  assert.equal(span.status, "completed");
  const patch = await diffSpan(span, { agentDir });
  assert.match(patch.patch, /\+written by the run/);
});

test("a steer joins the prompt already open, and its work lands in the same interval", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("w2", agentDir);
  const session = wrapper("w2", project, agentDir);

  await session.prompt();
  const opened = await readSpan("w2", agentDir);
  await session.emit({ type: "agent_start" });
  await writeFile(join(project, "a.txt"), "first pass\n");
  // A queued steer is coming, so the SDK marks this end as not the last one.
  await session.emit({ type: "agent_end", isTerminal: false });
  await session.prompt("steer");
  await session.emit({ type: "agent_start" });
  await writeFile(join(project, "a.txt"), "after the steer\n");
  await session.emit({ type: "agent_end" });

  assert.equal((await readSpan("w2", agentDir)).status, "running", "a steer must not close the prompt it joined");
  await session.settled();

  const span = await readSpan("w2", agentDir);
  assert.equal(span.status, "completed");
  assert.equal(span.runId, opened.runId, "the steer started a second run instead of joining the first");
  const patch = await diffSpan(span, { agentDir });
  assert.match(patch.patch, /\+after the steer/);
});

test("an abort is recorded as an interruption, with what the run had reached", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("w3", agentDir);
  const session = wrapper("w3", project, agentDir);

  await session.prompt();
  await session.emit({ type: "agent_start" });
  await writeFile(join(project, "a.txt"), "half done\n");
  await session.abort();
  await session.emit({ type: "agent_end" });
  await session.settled();

  const span = await readSpan("w3", agentDir);
  assert.equal(span.status, "interrupted");
  assert.ok(span.afterTree, "an interrupted prompt still records where it got to");
});

test("a prompt that fails before any run starts is recorded as failed", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("w4", agentDir);
  const session = wrapper("w4", project, agentDir);

  await session.prompt();
  await session.settled(true);

  assert.equal((await readSpan("w4", agentDir)).status, "failed");
});

test("a Session destroyed mid-prompt records no end state", async () => {
  const { project, agentDir } = await fixture();
  forgetTurnLifecycle("w5", agentDir);
  const session = wrapper("w5", project, agentDir);

  await session.prompt();
  await session.emit({ type: "agent_start" });
  await writeFile(join(project, "a.txt"), "still being written\n");
  session.destroy();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await readSpan("w5", agentDir)).status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const span = await readSpan("w5", agentDir);
  assert.equal(span.status, "interrupted");
  assert.equal(span.unavailable, "unsettled");
  assert.equal(span.afterTree, undefined, "a workspace nobody is watching must not be recorded as finished");
});
