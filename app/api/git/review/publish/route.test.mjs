import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_FIELDS, reviewOwnerServerStub } from "../owner-stub.mjs";
import { readLocalChanges } from "../../../../../lib/review-publish.ts";

/**
 * What publishing does to a repository, and what it refuses to do.
 *
 * The commit option writes a human's own work into history, so these ask the
 * destructive questions: does anything commit when nobody asked, does a
 * working tree that moved stop the commit, and does a refused commit publish
 * anything afterwards.
 */
function compile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function endpoint({
  local = { paths: ["one.txt"], digest: "snapshot-1" },
  commit = { status: "committed", committedPaths: ["one.txt"], hiddenPaths: [], stagedPaths: ["one.txt"], commit: "abc123" },
  push = { status: "pushed" },
  denied = false,
} = {}) {
  const calls = { commit: [], push: [], publish: [] };
  const exports = {};
  vm.runInNewContext(compile("./route.ts"), {
    exports,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub();
      if (name === "@/lib/review-git-guard") return { reviewRepositoryDenied: async () => denied };
      if (name === "@/lib/review-commit-git") return {
        commitReview: async (request) => { calls.commit.push(request); return commit; },
      };
      if (name === "@/lib/review-push") return {
        pushReviewBranch: async (cwd, remote) => { calls.push.push({ cwd, remote }); return push; },
      };
      if (name === "@/lib/review-publish") return {
        readLocalChanges: async () => local,
        readPublishState: async () => ({ remote: "origin", base: "main", head: "codex/work" }),
        publishReviewBranch: async (request) => {
          calls.publish.push(request);
          return { status: "published", forge: "github", number: 7, url: "https://github.com/owner/repo/pull/7", draft: false };
        },
      };
      if (name === "@/lib/review-publish-ui") {
        const moduleExports = {};
        vm.runInNewContext(compile("../../../../../lib/review-publish-ui.ts"), { exports: moduleExports, require: () => ({}) });
        return moduleExports;
      }
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  });
  return { calls, post: (body) => exports.POST({ json: async () => body }) };
}

const VALID = { ...OWNER_FIELDS, title: "A change", body: "", base: "main", draft: false };

test("publishing commits nothing unless the request asks for it", async () => {
  const route = endpoint();
  for (const body of [VALID, { ...VALID, commitFirst: null }, { ...VALID, pushFirst: true }]) {
    const response = await route.post(body);
    assert.equal(response.status, 200, JSON.stringify(body));
  }
  assert.equal(route.calls.commit.length, 0);
  assert.equal(route.calls.publish.length, 3);
});

test("a commit option that is not a whole request is refused before Git runs", async () => {
  const route = endpoint();
  for (const commitFirst of [
    {},
    { message: "Commit one" },
    { message: "   ", snapshot: "snapshot-1" },
    { message: 7, snapshot: "snapshot-1" },
    { message: "Commit one", snapshot: "" },
    "Commit one",
  ]) {
    assert.equal((await route.post({ ...VALID, commitFirst })).status, 400, JSON.stringify(commitFirst));
  }
  assert.equal(route.calls.commit.length, 0);
  assert.equal(route.calls.publish.length, 0);
});

test("local changes that moved since the form opened are not committed", async () => {
  const route = endpoint({ local: { paths: ["one.txt"], digest: "snapshot-2" } });
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: "snapshot-1" } });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /moved since this form opened/);
  assert.equal(route.calls.commit.length, 0);
  assert.equal(route.calls.push.length, 0);
  assert.equal(route.calls.publish.length, 0);
});

test("a matched snapshot commits exactly what it named, then pushes and publishes", async () => {
  const route = endpoint({ local: { paths: ["one.txt", "two.txt"], digest: "snapshot-1" } });
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit the work", snapshot: "snapshot-1" } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "published");
  assert.deepEqual(route.calls.commit[0].stagePaths, ["one.txt", "two.txt"]);
  assert.deepEqual(route.calls.commit[0].reviewedPaths, ["one.txt", "two.txt"]);
  assert.equal(route.calls.commit[0].message, "Commit the work");
  // A commit that stayed local would leave the request without it.
  assert.equal(route.calls.push.length, 1);
  assert.equal(route.calls.publish.length, 1);
});

test("a refused commit publishes nothing and says why", async () => {
  const route = endpoint({ commit: { status: "refused", refusal: "untrusted-project", committedPaths: [], hiddenPaths: [], stagedPaths: [] } });
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: "snapshot-1" } });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Trust this Project/);
  assert.equal(route.calls.push.length, 0);
  assert.equal(route.calls.publish.length, 0);
});

test("a commit that landed but could not be pushed publishes nothing", async () => {
  const route = endpoint({ push: { status: "failed", failure: "auth" } });
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: "snapshot-1" } });
  assert.equal((await response.json()).status, "push-failed");
  assert.equal(route.calls.publish.length, 0);
});

test("a denied repository is refused before anything is committed", async () => {
  const route = endpoint({ denied: true });
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: "snapshot-1" } });
  assert.equal(response.status, 403);
  assert.equal(route.calls.commit.length, 0);
});

test("a reading that covered nothing commits nothing, whatever the request carries", async () => {
  const route = endpoint({ local: { paths: ["one.txt"], digest: "" } });
  // An empty snapshot is not a request at all, and a real one matches nothing.
  assert.equal((await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: "" } })).status, 400);
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: "snapshot-1" } });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /could not be read in full/);
  assert.equal(route.calls.commit.length, 0);
  assert.equal(route.calls.push.length, 0);
  assert.equal(route.calls.publish.length, 0);
});

/** A repository, so the digests in the next test are the real ones. */
function repository(t) {
  const home = mkdtempSync(path.join(tmpdir(), "reeve-publish-route-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const cwd = path.join(home, "work");
  execFileSync("git", ["init", "-q", "-b", "main", cwd]);
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(path.join(cwd, "base.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");
  return cwd;
}

test("an untracked file rewritten between the two reads stops the commit", async (t) => {
  const cwd = repository(t);
  writeFileSync(path.join(cwd, "fresh.txt"), "what the human saw\n");
  // What the form was given when it opened.
  const shown = await readLocalChanges(cwd);
  writeFileSync(path.join(cwd, "fresh.txt"), "what arrived afterwards\n");
  const now = await readLocalChanges(cwd);
  assert.deepEqual(now.paths, shown.paths, "the same path, so only the content moved");

  const route = endpoint({ local: now });
  const response = await route.post({ ...VALID, commitFirst: { message: "Commit one", snapshot: shown.digest } });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /moved since this form opened/);
  assert.equal(route.calls.commit.length, 0);
  assert.equal(route.calls.push.length, 0);
  assert.equal(route.calls.publish.length, 0);
});
