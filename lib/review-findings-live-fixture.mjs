/**
 * One real review turn, against a real model, in a disposable Project and a
 * disposable agent directory.
 *
 * Every other test of the findings path writes the directive itself, which
 * proves the parsing and the placement but never that a model asked in Reeve's
 * own words writes something Reeve can read. This one composes the review
 * request the way the route composes it, records the revisions the way the
 * route records them, sends the prompt through `startRpcSession` — the path the
 * browser uses — and reads the findings back through the read module.
 *
 * Everything the Session touches lives under a temporary root: its own agent
 * directory through PI_CODING_AGENT_DIR, its own models file, its own Git
 * repository. No Session, Project, or credential belonging to this computer is
 * read or written.
 *
 * The endpoint and the model are supplied by whoever runs it, through
 * `--base-url` and `--model` or through REEVE_LIVE_BASE_URL and
 * REEVE_LIVE_MODEL_ID. There is no built-in default, and the endpoint is never
 * printed, because this output is read in public logs.
 *
 * Usage: bun lib/review-findings-live-fixture.mjs --base-url URL --model ID [--retain]
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

/** The file the review is about, and the fault planted in it. */
const REVIEWED_FILE = "src/total.js";

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

const BEFORE = [
  "export function total(prices) {",
  "  let sum = 0;",
  "  for (let index = 0; index < prices.length; index++) {",
  "    sum += prices[index];",
  "  }",
  "  return sum;",
  "}",
  "",
].join("\n");

/** The change under review. The loop now reads one element past the end. */
const AFTER = [
  "export function total(prices) {",
  "  let sum = 0;",
  "  for (let index = 0; index <= prices.length; index++) {",
  "    sum += prices[index];",
  "  }",
  "  return sum;",
  "}",
  "",
].join("\n");

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "reeve-findings-live-"));
  const project = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(join(project, "src"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await git(project, ["init", "-q", "."]);
  await git(project, ["config", "user.email", "fixture@example.invalid"]);
  await git(project, ["config", "user.name", "fixture"]);
  await writeFile(join(project, REVIEWED_FILE), BEFORE);
  await git(project, ["add", "."]);
  await git(project, ["commit", "-qm", "first"]);
  // The uncommitted change the review is asked about.
  await writeFile(join(project, REVIEWED_FILE), AFTER);

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
  const { composeReviewRequest } = await jiti.import(here("review-model-request.ts"));
  const { reviewSettings } = await jiti.import(here("review-settings.ts"));
  const { readReviewDiff } = await jiti.import(here("review-git.ts"));
  const { recordReviewRequestSnapshot, reviewedFilesFromDiff } = await jiti.import(here("review-request-snapshot.ts"));
  const { readReviewFindings } = await jiti.import(here("review-findings-read.ts"));
  const { placeReviewFindings } = await jiti.import(here("review-findings.ts"));
  const { getSessionEntries, resolveSessionPath } = await jiti.import(here("session-reader.ts"));
  const { allowFileRoot } = await jiti.import(here("file-access.ts"));

  allowFileRoot(project);
  allowFileRoot(await realpath(project));

  // Composed and recorded exactly as the request route does both.
  const composed = composeReviewRequest({ mode: { kind: "uncommitted" }, settings: reviewSettings(undefined) });
  const diff = await readReviewDiff(project, { kind: "uncommitted" });

  const { session, realSessionId } = await startRpcSession("live", "", project, {
    initialModel: { provider, modelId },
  });
  const snapshot = await recordReviewRequestSnapshot({
    sessionId: realSessionId,
    cwd: project,
    prompt: composed.prompt,
    files: reviewedFilesFromDiff(diff),
    agentDir,
  });

  const events = [];
  session.onEvent((event) => events.push(event.type));
  await session.send({ type: "prompt", message: composed.prompt });

  /*
   * The prompt can return on the turn's end, before the run has settled and
   * before the Session has been written. The browser waits for the settled
   * event too, so this waits for it rather than reading a file that is not
   * there yet.
   */
  const settled = () => events.includes("prompt_done") || events.includes("agent_settled") || events.includes("agent_end");
  for (let attempt = 0; attempt < 240 && !settled(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  /*
   * The Session's own file, once it is on disk. The prompt returns before the
   * writer has necessarily flushed it, and the read module reads the file
   * rather than the live Session.
   */
  let sessionPath = null;
  for (let attempt = 0; attempt < 80 && !sessionPath; attempt += 1) {
    sessionPath = await resolveSessionPath(realSessionId);
    if (!sessionPath) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const entries = sessionPath ? await getSessionEntries(sessionPath) : [];
  const answers = entries
    .filter((entry) => entry.type === "message" && entry.message?.role === "assistant")
    .flatMap((entry) => Array.isArray(entry.message.content) ? entry.message.content : [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text);

  const read = await readReviewFindings({
    cwd: project,
    sessionId: realSessionId,
    agentDir,
    sessionCwd: async () => project,
    entries: sessionPath ? undefined : async () => entries,
  });
  const current = new Map(Object.entries(reviewedFilesFromDiff(await readReviewDiff(project, { kind: "uncommitted" })))
    .map(([path, file]) => [path, { patch: file.patch, revision: file.revision }]));
  const placed = read.kind === "findings"
    ? placeReviewFindings(read.findings, new Map(Object.entries(read.reviewed)), current)
    : [];

  report({
    modelId,
    recorded: Boolean(snapshot),
    reviewedFile: REVIEWED_FILE,
    sessionOnDisk: Boolean(sessionPath),
    settled: settled(),
    answerCount: answers.length,
    directiveSightings: answers.join("\n").split("::code-comment{").length - 1,
    answerExtract: answers.join("\n").slice(0, 1200),
    read: read.kind === "findings"
      ? {
          kind: read.kind,
          boundToRequest: read.requestId === snapshot?.requestId,
          refusedDirectives: read.refusedDirectives,
          findings: read.findings.map((finding) => ({
            id: finding.id,
            path: finding.path,
            startLine: finding.startLine ?? null,
            endLine: finding.endLine ?? null,
            title: finding.title,
            priority: finding.priority ?? null,
          })),
        }
      : { kind: read.kind, reason: read.reason ?? null },
    placements: placed.map((entry) => ({
      id: entry.finding.id,
      state: entry.placement.state,
      reason: entry.placement.reason ?? null,
      startLine: entry.placement.startLine ?? null,
    })),
    eventTypes: [...new Set(events)],
    ...(retain ? { retainedRoot: root } : {}),
  });

  await discard();
  // The Session keeps handles open that nothing here can close, so the process
  // is ended deliberately, after the disposable root has been removed.
  process.exit(0);
}

main().catch(async (error) => {
  report({ error: String(error?.stack ?? error) });
  await discard();
  process.exit(1);
});
