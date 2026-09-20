import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  MAX_RETAINED_REVIEW_REQUESTS,
  REVIEW_REQUEST_SNAPSHOT_BYTE_CAP,
  readReviewRequestSnapshots,
  recordReviewRequestSnapshot,
  reviewedFilesFromDiff,
} = await jiti.import("./review-request-snapshot.ts");

const FILES = { "src/a.ts": { revision: "rev-1", patch: "@@ -1 +1 @@\n-a\n+b\n" } };

async function agentDirectory() {
  return mkdtemp(join(tmpdir(), "reeve-request-"));
}

test("a recorded request is read back whole", async () => {
  const agentDir = await agentDirectory();
  const written = await recordReviewRequestSnapshot({ sessionId: "s1", cwd: "/repo", prompt: "Review this.", files: FILES, agentDir });
  const [read] = await readReviewRequestSnapshots("s1", agentDir);
  assert.equal(read.requestId, written.requestId);
  assert.equal(read.prompt, "Review this.");
  assert.deepEqual(read.files, FILES);
});

test("one Session never reads another's records", async () => {
  const agentDir = await agentDirectory();
  await recordReviewRequestSnapshot({ sessionId: "s1", cwd: "/repo", prompt: "Review this.", files: FILES, agentDir });
  assert.deepEqual(await readReviewRequestSnapshots("s2", agentDir), []);
});

test("records are kept oldest first, and only the newest few are kept at all", async () => {
  const agentDir = await agentDirectory();
  const kept = MAX_RETAINED_REVIEW_REQUESTS + 3;
  for (let index = 0; index < kept; index++) {
    await recordReviewRequestSnapshot({
      sessionId: "s1", cwd: "/repo", prompt: `Review ${index}.`, files: FILES, agentDir,
      now: () => new Date(Date.UTC(2026, 8, 15, 10, index)),
    });
  }
  const snapshots = await readReviewRequestSnapshots("s1", agentDir);
  assert.equal(snapshots.length, MAX_RETAINED_REVIEW_REQUESTS);
  assert.equal(snapshots[0].prompt, `Review ${kept - MAX_RETAINED_REVIEW_REQUESTS}.`);
  assert.equal(snapshots.at(-1).prompt, `Review ${kept - 1}.`);
});

test("patches too large to keep leave every revision behind", async () => {
  const agentDir = await agentDirectory();
  const huge = { "src/a.ts": { revision: "rev-1", patch: "x".repeat(REVIEW_REQUEST_SNAPSHOT_BYTE_CAP + 1) } };
  const written = await recordReviewRequestSnapshot({ sessionId: "s1", cwd: "/repo", prompt: "Review this.", files: huge, agentDir });
  assert.equal(written.patchesOmitted, true);
  const [read] = await readReviewRequestSnapshots("s1", agentDir);
  assert.deepEqual(read.files, { "src/a.ts": { revision: "rev-1" } });
});

test("a damaged record is ignored rather than read as evidence", async () => {
  const agentDir = await agentDirectory();
  await recordReviewRequestSnapshot({ sessionId: "s1", cwd: "/repo", prompt: "Review this.", files: FILES, agentDir });
  const directory = join(agentDir, "omp-web-review-requests", "s1");
  await writeFile(join(directory, "damaged.json"), "{not json", "utf8");
  await writeFile(join(directory, "foreign.json"), JSON.stringify({ requestId: "r", sessionId: "s2", cwd: "/repo", composedAt: "now", prompt: "p", files: {} }), "utf8");
  const snapshots = await readReviewRequestSnapshots("s1", agentDir);
  assert.equal(snapshots.length, 1);
  assert.equal((await readdir(directory)).length, 3);
});

test("each file of a diff carries its own revision and its own patch", () => {
  const patch = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "diff --git a/src/b.ts b/src/b.ts",
    "--- a/src/b.ts",
    "+++ b/src/b.ts",
    "@@ -1 +1 @@",
    "-c",
    "+d",
    "",
  ].join("\n");
  const files = reviewedFilesFromDiff({ patch, fileRevisions: { "src/a.ts": "rev-a", "src/b.ts": "rev-b" }, conflictedFiles: [] });
  assert.deepEqual(Object.keys(files), ["src/a.ts", "src/b.ts"]);
  assert.equal(files["src/a.ts"].revision, "rev-a");
  assert.match(files["src/a.ts"].patch, /\+b/);
  assert.ok(!files["src/a.ts"].patch.includes("src/b.ts"));
});
