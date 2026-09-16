import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_FIELDS, reviewOwnerServerStub } from "../owner-stub.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MERGE_BASE = "c".repeat(40);

/**
 * The route, with Git and the owner check replaced.
 *
 * `git` decides what each command answers, so a run with no merge base is
 * expressed the way Git expresses it — exit 1 and no output — rather than by
 * a flag this route would never see.
 */
function endpoint({ git = () => ({ code: 0, stdout: "", stderr: "" }), diff, record } = {}) {
  const calls = [];
  const recorded = [];
  const code = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub();
      if (name === "@/lib/review-commit-git") return {
        runGit: async (cwd, args) => {
          calls.push({ cwd, args });
          return git(args);
        },
      };
      if (name === "@/lib/review-model-request") return {
        // Echoed, so the test reads exactly what the route resolved.
        composeReviewRequest: (input) => ({ prompt: "composed", filter: input.mode, delivery: input.settings.delivery, severityFloor: "low", input }),
        REVIEW_REQUEST_REFUSALS: { "no-merge-base": "no merge base", "no-session": "no session", "git-unusable": "git unusable" },
      };
      if (name === "@/lib/review-settings") return { reviewSettings: (stored) => ({ delivery: stored?.delivery ?? "current-chat", exhaustiveReview: false }) };
      if (name === "@/lib/review-git") return {
        readReviewDiff: async (cwd, scope) => {
          if (diff === "unreadable") throw new Error("no repository here");
          return { cwd, scope, patch: "", fileRevisions: {}, conflictedFiles: [] };
        },
      };
      if (name === "@/lib/review-request-snapshot") return {
        reviewedFilesFromDiff: (value) => ({ "a.ts": { revision: "rev-1", patch: "@@", scope: value.scope } }),
        recordReviewRequestSnapshot: async (input) => {
          recorded.push(input);
          return record === "unwritable" ? null : { ...input, requestId: "req-1" };
        },
      };
      if (name === "@/lib/review-slash-entries") return { describeGitUnusable: (stderr) => `explained: ${stderr.trim()}` };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const request = (body) => exports.POST({ json: async () => body });
  return { request, calls, recorded };
}

test("a Review Tab with no Session is refused, and no Git runs", async () => {
  const { request, calls } = endpoint();
  const response = await request({ ...OWNER_FIELDS, mode: "uncommitted" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).reason, "no-session");
  assert.deepEqual(calls, []);
});

test("the owner is asked before anything is composed", async () => {
  const { request, calls } = endpoint();
  const response = await request({ mode: "uncommitted", sessionId: "s1" });
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("an uncommitted review composes without touching Git", async () => {
  const { request, calls } = endpoint();
  const response = await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.filter, { kind: "uncommitted" });
  // The Session comes back from the owner, never from what the caller claimed.
  assert.equal(body.sessionId, "s1");
  assert.deepEqual(calls, []);
});

test("who asked and whether security runs reach the composition", async () => {
  const { request } = endpoint();
  // A review the human typed: the requested floor, no security pass.
  const typed = await (await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted", origin: "requested", security: false })).json();
  assert.equal(typed.input.origin, "requested");
  assert.equal(typed.input.security, false);
  // A review an armed trigger started, with the security pass riding on it.
  const armed = await (await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted", origin: "automatic", security: true })).json();
  assert.equal(armed.input.origin, "automatic");
  assert.equal(armed.input.security, true);
  // Absent fields stay the safe default: the human asked, and nothing extra runs.
  const bare = await (await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted" })).json();
  assert.equal(bare.input.origin, "requested");
  assert.equal(bare.input.security, false);
});

test("a branch review resolves the merge base and hands it to the composition", async () => {
  const { request, calls } = endpoint({
    git: (args) => {
      if (args[0] === "merge-base") return { code: 0, stdout: `${MERGE_BASE}\n`, stderr: "" };
      return { code: 0, stdout: `${args[3].startsWith("HEAD") ? HEAD : BASE}\n`, stderr: "" };
    },
  });
  const response = await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "branch", base: "main" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.filter, { kind: "branch", base: "main", mergeBase: MERGE_BASE });
  // Both sides are resolved to commits first, so the merge base is asked for
  // in the terms Git settled rather than in the name the browser sent. The
  // arguments are copied out because they were built inside the module's own
  // realm, where an array is not the same class as this file's.
  assert.deepEqual([...calls.at(-1).args], ["merge-base", BASE, HEAD]);
});

test("no merge base is refused outright rather than falling back to a plain diff", async () => {
  const { request } = endpoint({
    git: (args) => args[0] === "merge-base"
      ? { code: 1, stdout: "", stderr: "" }
      : { code: 0, stdout: `${HEAD}\n`, stderr: "" },
  });
  const response = await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "branch", base: "unrelated" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).reason, "no-merge-base");
});

test("an unusable Git is explained, and its own words are not the answer", async () => {
  const { request } = endpoint({ git: () => ({ code: 128, stdout: "", stderr: "fatal: bad revision" }) });
  const response = await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "branch", base: "gone" });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.reason, "git-unusable");
  assert.match(body.error, /^explained:/);
});

test("a base that could be read as an option is refused before Git sees it", async () => {
  const { request, calls } = endpoint();
  const response = await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "branch", base: "--upload-pack=touch" });
  assert.equal(response.status, 400);
  assert.deepEqual(calls, []);
});

test("what the model is being asked to read is recorded against the composed prompt", async () => {
  const { request, recorded } = endpoint();
  const body = await (await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted" })).json();
  assert.equal(body.requestId, "req-1");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].sessionId, "s1");
  assert.equal(recorded[0].prompt, "composed");
  // Read field by field: the scope was built inside the module's own realm.
  assert.equal(recorded[0].files["a.ts"].scope.kind, "uncommitted");
});

test("a branch review records the merge base it pinned, not the branch name", async () => {
  const { request, recorded } = endpoint({
    git: (args) => args[0] === "merge-base"
      ? { code: 0, stdout: `${MERGE_BASE}\n`, stderr: "" }
      : { code: 0, stdout: `${args[3].startsWith("HEAD") ? HEAD : BASE}\n`, stderr: "" },
  });
  await request({ ...OWNER_FIELDS, sessionId: "s1", mode: "branch", base: "main" });
  assert.equal(recorded[0].files["a.ts"].scope.kind, "branch");
  assert.equal(recorded[0].files["a.ts"].scope.base, MERGE_BASE);
});

test("a review still starts when nothing about its revisions could be recorded", async () => {
  const unreadable = endpoint({ diff: "unreadable" });
  const first = await unreadable.request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted" });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).requestId, null);
  const unwritable = endpoint({ record: "unwritable" });
  const second = await unwritable.request({ ...OWNER_FIELDS, sessionId: "s1", mode: "uncommitted" });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).requestId, null);
});
