import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { readReviewFindings } = await jiti.import("./review-findings-read.ts");
const { recordReviewRequestSnapshot } = await jiti.import("./review-request-snapshot.ts");

/** The patch the review request was composed against. */
const PATCH = [
  "@@ -1,4 +1,4 @@",
  " const alpha = 1;",
  "-const bravo = 0;",
  "+const bravo = 3;",
  " const charlie = 4;",
  "",
].join("\n");

const PROMPT = "Review the changes described below.";

function directive(file, start) {
  return `::code-comment{title="Wrong constant" body="This should be four." file="${file}" start=${start} priority=2}`;
}

function userEntry(id, text) {
  return { type: "message", id, parentId: null, timestamp: "2026-09-15T10:00:00.000Z", message: { role: "user", content: text } };
}

function assistantEntry(id, blocks) {
  return { type: "message", id, parentId: null, timestamp: "2026-09-15T10:01:00.000Z", message: { role: "assistant", content: blocks } };
}

/**
 * One branch, each entry hanging from the one before it.
 *
 * A Session file is a tree, and the reader walks the branch that ends at the
 * last entry. A test that left every parent empty would hand it a forest of
 * roots and prove nothing about the walk.
 */
function chain(entries, from = null) {
  let parentId = from;
  return entries.map((entry) => {
    const linked = { ...entry, parentId };
    parentId = entry.id;
    return linked;
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "reeve-findings-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  const read = (entries, overrides = {}) => readReviewFindings({
    cwd,
    sessionId: "s1",
    agentDir,
    sessionCwd: async () => cwd,
    entries: async () => entries,
    ...overrides,
  });
  return { cwd, agentDir, read };
}

async function recordRequest(agentDir, cwd, { prompt = PROMPT, files, minute = 0 } = {}) {
  return recordReviewRequestSnapshot({
    sessionId: "s1",
    cwd,
    prompt,
    agentDir,
    // Named explicitly, so two requests in one test are ordered by what the
    // test says rather than by how fast the machine ran them.
    now: () => new Date(Date.UTC(2026, 8, 15, 10, minute)),
    files: files ?? { "src/values.ts": { revision: "rev-1", patch: PATCH } },
  });
}

test("a finding is read from the turn that answered a recorded review request", async () => {
  const { cwd, agentDir, read } = await fixture();
  const snapshot = await recordRequest(agentDir, cwd);
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: `I found one thing.\n\n${directive("src/values.ts", 3)}` }]),
  ]));
  assert.equal(result.kind, "findings");
  assert.equal(result.requestId, snapshot.requestId);
  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.findings[0], {
    id: "a1#0",
    entryId: "a1",
    directiveIndex: 0,
    path: "src/values.ts",
    side: "additions",
    startLine: 3,
    endLine: 3,
    title: "Wrong constant",
    body: "This should be four.",
    priority: "2",
    requestId: snapshot.requestId,
    createdAt: "2026-09-15T10:01:00.000Z",
  });
  // The revisions the request was composed against travel with the findings.
  assert.equal(result.reviewed["src/values.ts"].revision, "rev-1");
  assert.equal(result.reviewed["src/values.ts"].patch, PATCH);
});

test("a Session working in another directory is refused", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd);
  const result = await read(chain([userEntry("u1", PROMPT)]), { sessionCwd: async () => join(cwd, "elsewhere") });
  assert.deepEqual(result, { kind: "unavailable", reason: "session-mismatch" });
});

test("a directive nobody asked for is bound to nothing and is not shown", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd);
  // The turn never carries the composed prompt, so no revision can vouch for it.
  const result = await read(chain([
    userEntry("u1", "What do you think of this file?"),
    assistantEntry("a1", [{ type: "text", text: directive("src/values.ts", 3) }]),
  ]));
  assert.deepEqual(result, { kind: "none" });
});

test("the latest review that started is the one on screen", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd, { minute: 0 });
  const second = await recordRequest(agentDir, cwd, { prompt: "Review this branch against main.", minute: 1 });
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: directive("src/values.ts", 3) }]),
    userEntry("u2", "Review this branch against main."),
    assistantEntry("a2", [{ type: "text", text: directive("src/values.ts", 2) }]),
  ]));
  assert.equal(result.requestId, second.requestId);
  assert.deepEqual(result.findings.map((finding) => finding.id), ["a2#0"]);
});

test("a directive written by the human, or by a tool, is not the model's finding", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd);
  const result = await read(chain([
    userEntry("u1", `${PROMPT}\n\n${directive("src/values.ts", 3)}`),
    assistantEntry("a1", [
      { type: "thinking", thinking: directive("src/values.ts", 3) },
      { type: "toolCall", toolCallId: "t1", toolName: "write", input: { text: directive("src/values.ts", 3) } },
    ]),
    { type: "message", id: "r1", parentId: null, timestamp: "2026-09-15T10:02:00.000Z", message: { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: directive("src/values.ts", 3) }] } },
  ]));
  assert.deepEqual(result, { kind: "none" });
});

test("a directive naming a path outside the repository is dropped and counted", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd);
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: [directive("/etc/passwd", 1), directive("src/values.ts", 3)].join("\n") }]),
  ]));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, "a1#1");
  assert.equal(result.refusedDirectives, 1);
});

test("a request recorded for another Worktree is not evidence here", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, join(cwd, "..", "other-worktree"));
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: directive("src/values.ts", 3) }]),
  ]));
  assert.deepEqual(result, { kind: "none" });
});

test("a Session that has asked for no review has no findings", async () => {
  const { read } = await fixture();
  assert.deepEqual(await read(chain([userEntry("u1", PROMPT)])), { kind: "none" });
});

test("a directive written after the review turn ended is not that review's finding", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd);
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: directive("src/values.ts", 3) }]),
    userEntry("u2", "Now write the release notes."),
    assistantEntry("a2", [{ type: "text", text: directive("src/values.ts", 2) }]),
  ]));
  assert.deepEqual(result.findings.map((finding) => finding.id), ["a1#0"]);
});

test("a later review that raised nothing clears the findings before it", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd, { minute: 0 });
  await recordRequest(agentDir, cwd, { prompt: "Review this branch against main.", minute: 1 });
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: directive("src/values.ts", 3) }]),
    userEntry("u2", "Review this branch against main."),
    assistantEntry("a2", [{ type: "text", text: "Nothing to raise. The change reads correctly." }]),
  ]));
  assert.deepEqual(result, { kind: "none" });
});

test("a review that was composed and never sent hides nothing", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd, { minute: 0 });
  // Composed after the review above, and never sent, so it is in no transcript.
  await recordRequest(agentDir, cwd, { prompt: "Review this branch against main.", minute: 1 });
  const result = await read(chain([
    userEntry("u1", PROMPT),
    assistantEntry("a1", [{ type: "text", text: directive("src/values.ts", 3) }]),
  ]));
  assert.equal(result.kind, "findings");
  assert.deepEqual(result.findings.map((finding) => finding.id), ["a1#0"]);
});

test("a review on a branch nobody kept does not draw on this one", async () => {
  const { agentDir, cwd, read } = await fixture();
  await recordRequest(agentDir, cwd, { minute: 0 });
  const kept = chain([
    userEntry("u1", "Where does the total go wrong?"),
    assistantEntry("a1", [{ type: "text", text: "It reads one element too many." }]),
  ]);
  // The abandoned fork hangs from the first entry, and the Session moved on.
  const abandoned = chain([
    userEntry("u2", PROMPT),
    assistantEntry("a2", [{ type: "text", text: directive("src/values.ts", 3) }]),
  ], "u1");
  assert.deepEqual(await read([...kept, ...abandoned, ...chain([userEntry("u3", "Thank you.")], "a1")]), { kind: "none" });
});
