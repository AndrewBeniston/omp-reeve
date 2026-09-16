/**
 * One real prompt, against a real model, in a disposable Project and a
 * disposable agent directory.
 *
 * Everything the Session touches lives under a temporary root: its own agent
 * directory through PI_CODING_AGENT_DIR, its own models file, its own Git
 * repository. No Session, Project, or credential belonging to this computer is
 * read or written.
 *
 * The run is driven through `startRpcSession` and read back through
 * `readLastTurnDiff`, which are the paths the browser uses at both ends, so
 * what is proved here is the product's own behaviour rather than a helper's.
 *
 * The endpoint and the model are supplied by whoever runs it, through
 * `--base-url` and `--model` or through REEVE_LIVE_BASE_URL and
 * REEVE_LIVE_MODEL_ID. There is no built-in default: a fixture that knew an
 * endpoint of its own could send a real request somewhere nobody intended.
 * The endpoint is never printed, because this output is read in public logs.
 *
 * Usage: bun lib/review-turn-live-fixture.mjs --base-url URL --model ID [--retain]
 * It prints one JSON object on a line beginning with LIVE_RESULT.
 */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

function option(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option("base-url", process.env.REEVE_LIVE_BASE_URL);
const modelId = option("model", process.env.REEVE_LIVE_MODEL_ID);
const retain = process.argv.includes("--retain");
const provider = "live-fixture";

/** The file the run is asked to edit, and what it is then held to. */
const RUN_FILE = "tracked.txt";
const RUN_CONTENT = "edited by the run\n";
const HAND_FILE = "by-hand.txt";
const HAND_DURING_FILE = "by-hand-during.txt";

function report(result) {
  console.log("LIVE_RESULT" + JSON.stringify(result));
}

if (!baseUrl || !modelId) {
  report({
    error:
      "Name the endpoint and the model: --base-url URL --model ID, "
      + "or REEVE_LIVE_BASE_URL and REEVE_LIVE_MODEL_ID.",
  });
  process.exit(2);
}

const git = (cwd, args) => run("git", args, { cwd, encoding: "utf8" });

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "reeve-live-"));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(project, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await git(project, ["init", "-q", "."]);
  await git(project, ["config", "user.email", "fixture@example.invalid"]);
  await git(project, ["config", "user.name", "fixture"]);
  await writeFile(join(project, HAND_FILE), "committed\n");
  // An existing tracked file, so the run has something to edit rather than
  // create: an edit is the ordinary case and the harder one to attribute.
  await writeFile(join(project, RUN_FILE), "before the run\n");
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);

  await writeFile(
    join(agentDir, "models.yml"),
    [
      "providers:",
      "  " + provider + ":",
      "    baseUrl: " + baseUrl,
      "    api: openai-completions",
      "    auth: none",
      "    models:",
      "      - id: " + modelId,
      "        name: Live fixture model",
      "        contextWindow: 131072",
      "        maxTokens: 8192",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(agentDir, "config.yml"),
    ["modelRoles:", "  default: " + provider + "/" + modelId, ""].join("\n"),
  );
  return { root, project, agentDir };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Removed on the way out, including when the run fails. */
let disposableRoot = null;

async function discard() {
  if (retain || !disposableRoot) return;
  await rm(disposableRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function main() {
  const { root, project, agentDir } = await workspace();
  disposableRoot = root;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
  const here = (name) => new URL("./" + name, import.meta.url).pathname;
  const { startRpcSession } = await jiti.import(here("rpc-manager.ts"));
  const { readSpan } = await jiti.import(here("review-turn-store.ts"));
  const { readLastTurnDiff } = await jiti.import(here("review-turn-read.ts"));
  const { allowFileRoot } = await jiti.import(here("file-access.ts"));

  // Dirty before the prompt begins. A diff drawn against HEAD would call this
  // the agent's work.
  await writeFile(join(project, HAND_FILE), "edited by hand before the prompt\n");

  const { session, realSessionId } = await startRpcSession("live", "", project, {
    initialModel: { provider, modelId },
  });
  // Both forms: a temporary directory is reached through a symlink on some
  // systems, and the repository root Git reports is the resolved one.
  allowFileRoot(project);
  allowFileRoot(await realpath(project));

  // The model this Session really holds, asked of the Session rather than
  // repeated back from what was requested.
  const state = await session.send({ type: "get_state" });
  const usedModel = state?.model ? state.model.provider + "/" + state.model.id : null;

  const events = [];
  // Someone saves an unrelated file in their editor while the agent works. The
  // write is kept rather than left to finish on its own, so the run cannot end
  // before it has landed and the evidence cannot depend on a race.
  let handEditDuringTurn = null;
  session.onEvent((event) => {
    events.push({
      type: event.type,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      ...(event.args ? { args: event.args } : {}),
    });
    if (!handEditDuringTurn && event.type === "tool_execution_start") {
      handEditDuringTurn = writeFile(join(project, HAND_DURING_FILE), "saved by hand while the prompt ran\n");
    }
  });

  await session.send({
    type: "prompt",
    message:
      "First run the shell command 'ls' to list this directory. Then use the edit tool once to change "
      + "the file " + RUN_FILE + " so its only line reads exactly: edited by the run. Then stop and say done.",
  });
  // Inside the run: the prompt above has returned, and the span does not close
  // until the run reports its terminal end.
  await handEditDuringTurn;

  let span = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    span = await readSpan(realSessionId, agentDir);
    if (span && span.status !== "running") break;
    await sleep(250);
  }

  // Read the way the browser reads it, so anything the read path adds above the
  // recorded interval — attribution included — is what this evidence shows.
  const read = await readLastTurnDiff({ cwd: project, sessionId: realSessionId, agentDir });
  const status = await git(project, ["status", "--porcelain"]);

  report({
    modelId,
    usedModel,
    span: span
      ? {
          status: span.status,
          unavailable: span.unavailable ?? null,
          hasBefore: Boolean(span.beforeTree),
          hasAfter: Boolean(span.afterTree),
          provenance: span.provenance ?? null,
        }
      : null,
    read: {
      kind: read.kind,
      ...(read.kind === "diff"
        ? {
            patch: read.diff.patch,
            unattributedPaths: read.diff.unattributedPaths ?? null,
            incompleteTools: read.diff.incompleteTools ?? null,
            skippedPaths: read.diff.skippedPaths,
          }
        : { reason: read.reason, retryable: read.retryable }),
    },
    runFile: RUN_FILE,
    runContent: RUN_CONTENT,
    handFile: HAND_FILE,
    handDuringFile: HAND_DURING_FILE,
    handEditLanded: handEditDuringTurn !== null,
    workingTree: status.stdout,
    toolEvents: events
      .filter((event) => event.type === "tool_execution_start" || event.type === "tool_execution_end")
      .map((event) => ({ type: event.type, toolName: event.toolName, isError: event.isError ?? false })),
    eventTypes: [...new Set(events.map((event) => event.type))],
    ...(retain ? { retainedRoot: root } : {}),
  });

  await discard();
  // The Session keeps handles open that nothing here can close, so the process
  // is ended deliberately — after the disposable root has been removed.
  process.exit(0);
}

main().catch(async (error) => {
  report({ error: String(error && error.stack ? error.stack : error) });
  await discard();
  process.exit(1);
});
