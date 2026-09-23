import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = new URL(".", import.meta.url).pathname;

/**
 * The real Session wrapper, driven in a process of its own.
 *
 * The wrapper records into whichever agent directory it finds, so the child is
 * given one under a temporary root: a test must never write into the agent
 * directory this computer actually uses. The wrapper itself is the one the
 * product runs, built the way the other rpc-manager tests build it, and the
 * three scenarios share one child because loading the Session module is the
 * expensive part.
 */
async function project(root, name) {
  const directory = join(root, name);
  await mkdir(directory, { recursive: true });
  const git = (args) => run("git", args, { cwd: directory, encoding: "utf8" });
  await git(["init", "-q", "."]);
  await git(["config", "user.email", "a@b.c"]);
  await git(["config", "user.name", "a"]);
  await writeFile(join(directory, "a.txt"), "before\n");
  await git(["add", "."]);
  await git(["commit", "-qm", "first"]);
  return directory;
}

async function wrapperScenarios() {
  const root = await mkdtemp(join(tmpdir(), "reeve-wrapper-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { recursive: true });
  const [one, two, three] = await Promise.all([project(root, "one"), project(root, "two"), project(root, "three")]);

  const script = `
    import { createJiti } from "jiti";
    const jiti = createJiti("${here}x.mjs", { tsconfigPaths: true });
    const { AgentSessionWrapper } = await jiti.import("${here}rpc-manager.ts");
    const { readSpan } = await jiti.import("${here}review-turn-store.ts");
    import { writeFile } from "node:fs/promises";

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async (read, limit = 4000) => {
      const end = Date.now() + limit;
      for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > end) return null;
        await sleep(20);
      }
    };
    const deferred = () => {
      let resolve;
      const promise = new Promise((settle) => { resolve = settle; });
      return { promise, resolve };
    };

    function session(sessionId, cwd) {
      const prompts = [];
      let emit = () => {};
      const inner = {
        sessionId,
        sessionFile: cwd + "/session.jsonl",
        isStreaming: false, isCompacting: false, isBashRunning: false,
        agent: { state: {}, peekSteeringQueue: () => [], peekFollowUpQueue: () => [], replaceQueues: () => {} },
        settings: { get: () => undefined, override() {} },
        sessionManager: { getEntries: () => [], getCwd: () => cwd },
        subscribe: (listener) => { emit = (event) => listener(event); return () => {}; },
        maybeStartTitleGeneration: () => {},
        getGoalModeState: () => undefined,
        getQueuedMessages: () => ({ steering: [], followUp: [] }),
        queuedMessageCount: 0,
        prompt: () => { const pending = deferred(); prompts.push(pending); return pending.promise; },
        abort: async () => {},
        dispose: async () => {},
      };
      const wrapper = new AgentSessionWrapper(inner, { on: () => () => {} });
      // The wrapper subscribes to its Session in start(), which is what
      // startRpcSession calls; without it no run event ever arrives.
      wrapper.start();
      return { wrapper, prompts, emit: (event) => emit(event) };
    }

    const result = {};

    // Destroyed after the baseline is recorded and before the run is
    // dispatched.
    {
      const s = session("s1", "${one}");
      // A baseline takes a different time on each machine, so no wait puts
      // the destroy in the right place everywhere. The recorded baseline is
      // held open, the wrapper is destroyed, and the prompt path then goes on.
      const recorded = deferred();
      const released = deferred();
      const noteTurn = s.wrapper.noteTurn.bind(s.wrapper);
      s.wrapper.noteTurn = async (event) => {
        const noted = await noteTurn(event);
        if (event.type === "prompt_started") {
          recorded.resolve();
          await released.promise;
        }
        return noted;
      };
      const sending = s.wrapper.send({ type: "prompt", message: "go" });
      await recorded.promise;
      s.wrapper.destroy();
      released.resolve();
      await sending;
      const span = await until(async () => {
        const current = await readSpan("s1");
        return current && current.status !== "running" ? current : null;
      });
      result.midBaseline = {
        prompts: s.prompts.length,
        status: span ? span.status : null,
        unavailable: span ? span.unavailable ?? null : null,
        afterTree: Boolean(span && span.afterTree),
      };
    }

    // Destroyed before the baseline even begins.
    {
      const s = session("s2", "${two}");
      const sending = s.wrapper.send({ type: "prompt", message: "go" });
      s.wrapper.destroy();
      await sending;
      await sleep(300);
      const span = await readSpan("s2");
      result.beforeBaseline = { prompts: s.prompts.length, status: span ? span.status : null };
    }

    // A settle belonging to a prompt that has since been replaced.
    {
      const s = session("s3", "${three}");
      await s.wrapper.send({ type: "prompt", message: "first" });
      const first = await readSpan("s3");
      await s.wrapper.send({ type: "prompt", message: "second" });
      const second = await readSpan("s3");
      result.replaced = first.runId !== second.runId;

      s.prompts[0].resolve();
      await sleep(300);
      result.afterStaleSettle = (await readSpan("s3")).status;

      s.emit({ type: "agent_start" });
      await writeFile("${three}/a.txt", "written by the second run\\n");
      s.emit({ type: "agent_end" });
      s.prompts[1].resolve();
      const closed = await until(async () => {
        const current = await readSpan("s3");
        return current && current.status !== "running" ? current : null;
      });
      result.afterOwnSettle = closed ? closed.status : null;
    }

    console.log("RESULT" + JSON.stringify(result));
    // The Session module leaves handles open, so the child is ended on purpose
    // rather than waited on.
    process.exit(0);
  `;

  // Written out and run as a file: handed to the runtime with `-e` instead,
  // the same script hangs before it reaches its first line.
  const scriptPath = join(root, "scenarios.mjs");
  await writeFile(scriptPath, script);
  const { stdout } = await run(process.execPath, [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
    timeout: 60_000,
  });
  const line = stdout.split("\n").find((entry) => entry.startsWith("RESULT"));
  assert.ok(line, "the wrapper scenarios printed no result:\n" + stdout);
  return JSON.parse(line.slice("RESULT".length));
}

test("the Session wrapper records a prompt's lifecycle without losing or misplacing one", { timeout: 120_000 }, async () => {
  const result = await wrapperScenarios();

  // Destroyed with the baseline recorded and the run not yet dispatched: the
  // run is never dispatched, and the span the prompt had already opened is
  // closed rather than left running for ever.
  assert.equal(result.midBaseline.prompts, 0, "a destroyed wrapper dispatched its prompt anyway");
  assert.equal(result.midBaseline.status, "interrupted", "a Session destroyed mid-baseline was left running");
  assert.equal(result.midBaseline.unavailable, "unsettled");
  assert.equal(result.midBaseline.afterTree, false, "a Session nobody is watching was recorded as finished");

  // Destroyed before the baseline began: nothing was captured and no run
  // started, so there is no record rather than a prompt that changed nothing.
  assert.equal(result.beforeBaseline.prompts, 0);
  assert.equal(result.beforeBaseline.status, null);

  // A settle from the replaced prompt must not end the one that replaced it.
  assert.equal(result.replaced, true, "the second prompt reused the first one's run");
  assert.equal(result.afterStaleSettle, "running", "a stale settle closed the prompt that replaced it");
  assert.equal(result.afterOwnSettle, "completed");
});
