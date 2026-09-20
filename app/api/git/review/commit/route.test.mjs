import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_FIELDS, reviewOwnerServerStub } from "../owner-stub.mjs";

function compile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

/** The server's own reading of the repository, which the browser cannot change. */
const REVIEWABLE = "diff --git a/one.txt b/one.txt\n--- a/one.txt\n+++ b/one.txt\n@@ -1 +1 @@\n-a\n+b\n";

function endpoint({ lexical = true, resolved = true, indexPaths = ["one.txt", "hidden.txt"], remotes = ["origin"] } = {}) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compile("./route.ts"), {
    exports,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/file-access") return {
        getAllowedFileRoots: async () => ["/project"],
        isFilePathAllowed: () => lexical,
        isExistingFilePathAllowed: () => resolved,
        isWindowsAbsolutePath: (value) => /^[A-Z]:\\/i.test(value),
      };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub({ lexical, resolved });
      if (name === "@/lib/review-git") return {
        readReviewDiff: async () => ({ patch: REVIEWABLE, conflictedFiles: [], fileRevisions: { "one.txt": "rev-1" } }),
        reviewUnavailableResponse: () => null,
      };
      if (name === "@/lib/review-files") {
        const moduleExports = {};
        vm.runInNewContext(compile("../../../../../lib/review-files.ts"), { exports: moduleExports, require: () => ({ getRelativeFilePath: (v) => v, joinFilePath: (a, b) => `${a}/${b}` }) });
        return moduleExports;
      }
      if (name === "@/lib/review-commit") {
        const moduleExports = {};
        vm.runInNewContext(compile("../../../../../lib/review-commit.ts"), { exports: moduleExports, require: () => ({}) });
        return moduleExports;
      }
      if (name === "@/lib/review-commit-git") return {
        commitReview: async (request) => { calls.push(request); return { status: "committed", committedPaths: ["one.txt"], hiddenPaths: [], commit: "abc123" }; },
        readIndexPaths: async () => indexPaths,
        readRemotes: async () => remotes,
        repositoryRoot: async () => "/project",
      };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  });
  return { calls, post: (body) => exports.POST({ json: async () => body }) };
}

/** The route runs in its own realm, so compare values rather than objects. */
const plain = (value) => JSON.parse(JSON.stringify(value));

const VALID = { ...OWNER_FIELDS, scope: { kind: "staged" }, message: "Add one" };

test("commit refuses a malformed request before touching Git", async () => {
  const route = endpoint();
  for (const body of [
    { ...VALID, cwd: "relative" },
    { ...VALID, scope: { kind: "unstaged" } },
    { ...VALID, scope: { kind: "branch" } },
    { ...VALID, message: 12 },
    { ...VALID, stagePaths: "one.txt" },
    { ...VALID, createBranch: 7 },
    { ...VALID, push: { remote: 7 } },
  ]) {
    assert.equal((await route.post(body)).status, 400, JSON.stringify(body));
  }
  assert.equal(route.calls.length, 0);
});

test("commit rejects a denied directory before reading anything", async () => {
  for (const options of [{ lexical: false }, { resolved: false }]) {
    const route = endpoint(options);
    assert.equal((await route.post(VALID)).status, 403);
    assert.equal(route.calls.length, 0);
  }
});

test("a path the browser invented is refused, because the server reads its own review", async () => {
  const route = endpoint();
  const response = await route.post({ ...VALID, scope: { kind: "uncommitted" }, stagePaths: ["../../etc/hosts"] });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /no longer in this review/);
  assert.equal(route.calls.length, 0);

  // A path the server did read is accepted and passed on unchanged.
  assert.equal((await route.post({ ...VALID, scope: { kind: "uncommitted" }, stagePaths: ["one.txt"] })).status, 200);
  assert.deepEqual(plain(route.calls[0].stagePaths), ["one.txt"]);
});

test("an acknowledgement only counts for something the index actually holds", async () => {
  const route = endpoint();
  const invented = await route.post({ ...VALID, acknowledgedHiddenPaths: ["not-staged.txt"] });
  assert.equal(invented.status, 400);
  assert.equal(route.calls.length, 0);

  assert.equal((await route.post({ ...VALID, acknowledgedHiddenPaths: ["hidden.txt"] })).status, 200);
  assert.deepEqual(plain(route.calls[0].acknowledgedHiddenPaths), ["hidden.txt"]);
});

test("a file edited since the form displayed it stops the commit before Git is touched", async () => {
  const route = endpoint();
  const response = await route.post({ ...VALID, expectedFileRevisions: { "one.txt": "rev-stale" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "refused");
  assert.equal(body.refusal, "stale-files");
  assert.deepEqual(body.stalePaths, ["one.txt"]);
  assert.equal(route.calls.length, 0, "nothing reached the Git layer");

  // The digest the server itself is reading is accepted.
  assert.equal((await route.post({ ...VALID, expectedFileRevisions: { "one.txt": "rev-1" } })).status, 200);
  assert.equal(route.calls.length, 1);
});

test("a remote that is not configured is refused rather than pushed to", async () => {
  const route = endpoint({ remotes: ["origin"] });
  assert.equal((await route.post({ ...VALID, push: { remote: "elsewhere" } })).status, 400);
  assert.equal(route.calls.length, 0);
  assert.equal((await route.post({ ...VALID, push: { remote: "origin", setUpstream: true } })).status, 200);
  assert.deepEqual(plain(route.calls[0].push), { remote: "origin", setUpstream: true });
});

test("the browser cannot name a commit: only the message and the paths travel", async () => {
  const route = endpoint();
  await route.post({ ...VALID, commit: "deadbeef", branch: "main", sha: "deadbeef" });
  const passed = plain(route.calls[0]);
  for (const key of ["commit", "branch", "sha"]) assert.equal(key in passed, false, key);
  assert.equal(passed.message, "Add one");
  assert.equal(passed.cwd, "/project");
});
