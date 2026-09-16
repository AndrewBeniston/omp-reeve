import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_QUERY, reviewOwnerServerStub } from "./owner-stub.mjs";

/**
 * The classified failure the Git layer raises when Review cannot run in a
 * directory at all. The route must carry its reason and status through, and
 * still not leak the message Git itself produced.
 */
const UNAVAILABLE = {
  error: "This directory is not in a Git repository, so there are no changes to review.",
  reason: "not-a-repository",
  status: 409,
};

/** The revision a browser says it is reading, and what the host says it is. */
const READING = "a".repeat(40);
const BASE = "b".repeat(40);
const MOVED = "c".repeat(40);

function endpoint(relativePath, { lexical = true, resolved = true, fail = false, head = READING, base = BASE } = {}) {
  const calls = [];
  const reader = (name) => async (...args) => {
    calls.push({ name, args });
    if (fail === "unavailable") throw Object.assign(new Error("Private implementation detail"), { reviewUnavailable: UNAVAILABLE });
    if (fail) throw new Error("Private implementation detail");
    if (name === "readReviewBranches") return [];
    if (name === "resolveRemote") return { id: "slot", host: "h", owner: "o", name: "n" };
    if (name === "resolveRepositoryRoot") return "/project";
    // The host's own head decides: a read is answered only when it is still
    // the revision the request named.
    if (name === "readPullRequestPatchAtRevision") {
      const asked = args[2];
      return head === asked.headSha && base === asked.baseSha
        ? { status: "read", revision: { headSha: asked.headSha, baseSha: asked.baseSha }, value: "--- a/x\n+++ b/x\n" }
        : { status: "revision-moved", revision: { headSha: head, baseSha: base } };
    }
    if (name === "defaultReviewBase") return null;
    if (name === "readLastTurnDiff") return { kind: "diff", diff: { patch: "" } };
    return { patch: "" };
  };
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/file-access") return {
        getAllowedFileRoots: async () => ["/project"],
        isFilePathAllowed: () => lexical,
        isExistingFilePathAllowed: () => resolved,
        isWindowsAbsolutePath: (path) => /^[A-Z]:\\/i.test(path),
      };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub({ lexical, resolved });
      if (name === "@/lib/review-git") return {
        ...Object.fromEntries(
          ["readReviewDiff", "readReviewBranches", "readReviewCommits", "defaultReviewBase"].map((name) => [name, reader(name)]),
        ),
        // Read from the patch itself, so it needs no host and no repository.
        fileRevisionsForPatch: () => ({ "x": "blob" }),
        reviewUnavailableResponse: (error) => error?.reviewUnavailable ?? null,
      };
      // The pull-request scope reads its changes from GitHub rather than from
      // this Project, through a slot this server issued.
      if (name === "@/lib/review-github") {
        class ReviewGitHubError extends Error {
          constructor(reason) { super(reason); this.reason = reason; }
        }
        return {
          ReviewGitHubError,
          // The real rule, so a revision that is not one is refused here too.
          isRevision: (value) => typeof value === "string" && /^[0-9a-f]{40}$/i.test(value),
          resolveRemote: reader("resolveRemote"),
          resolveRepositoryRoot: reader("resolveRepositoryRoot"),
          readPullRequestPatchAtRevision: reader("readPullRequestPatchAtRevision"),
        };
      }
      // The last-turn view reads a record rather than Git, so it arrives
      // through its own reader and must be guarded the same way.
      if (name === "@/lib/review-turn-read") return { readLastTurnDiff: reader("readLastTurnDiff") };
      // The metadata answer also reports where a commit could go and what is
      // staged, so the form can refuse when either moves.
      if (name === "@/lib/review-commit-git") return {
        repositoryRoot: async () => "/project",
        readRemotes: async () => ["origin"],
        readIndexDigest: async () => "index-digest",
        readIndexPaths: async () => ["staged.txt"],
      };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  });
  return { calls, get: (query) => exports.GET({ nextUrl: new URL(`http://localhost/?${query}`) }) };
}

/** The owner every request carries: this Tab, in this Worktree of this Project. */
const OWNER = OWNER_QUERY;

for (const [file, query] of [["./route.ts", `${OWNER}&scope=unstaged`], ["./choices/route.ts", `${OWNER}&kind=metadata`]]) {
  test(`${file} rejects denied lexical and resolved paths before reading Git`, async () => {
    for (const options of [{ lexical: false }, { resolved: false }]) {
      const route = endpoint(file, options);
      assert.equal((await route.get(query)).status, 403);
      assert.equal(route.calls.length, 0);
    }
  });

  test(`${file} does not expose Git error details`, async () => {
    const route = endpoint(file, { fail: true });
    const response = await route.get(query);
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /Private implementation detail/);
  });

  test(`${file} answers an unusable directory with its reason rather than a generic failure`, async () => {
    const route = endpoint(file, { fail: "unavailable" });
    const response = await route.get(query);
    assert.equal(response.status, UNAVAILABLE.status);
    assert.deepEqual(await response.json(), { error: UNAVAILABLE.error, reason: UNAVAILABLE.reason });
  });
}

test("Review rejects incomplete or unknown scopes without reading Git", async () => {
  const route = endpoint("./route.ts");
  for (const query of [
    "tabId=review:tab&cwd=relative&projectRoot=/project",
    // A request that names no Tab names no binding, so nothing can answer it.
    "cwd=/project&projectRoot=/project&scope=unstaged",
    `${OWNER}&scope=unknown`,
    `${OWNER}&scope=branch`,
    `${OWNER}&scope=commit`,
  ]) {
    assert.equal((await route.get(query)).status, 400);
  }
  assert.equal(route.calls.length, 0);
});

test("the last turn is read for a named Session, behind the same directory guard", async () => {
  // A Session has to be named: without one there is no record to look for.
  const missing = endpoint("./route.ts");
  assert.equal((await missing.get(`${OWNER}&scope=lastTurn`)).status, 400);
  assert.equal(missing.calls.length, 0);

  // A directory the guard refuses is refused before the record is touched.
  const denied = endpoint("./route.ts", { resolved: false });
  assert.equal((await denied.get(`${OWNER}&scope=lastTurn&sessionId=s1`)).status, 403);
  assert.equal(denied.calls.length, 0);

  const route = endpoint("./route.ts");
  const response = await route.get(`${OWNER}&scope=lastTurn&sessionId=s1`);
  assert.equal(response.status, 200);
  // Compared field by field: the stub builds its objects inside the sandbox,
  // so they share no prototype with the ones out here.
  assert.equal(route.calls.length, 1);
  assert.equal(route.calls[0].name, "readLastTurnDiff");
  assert.equal(route.calls[0].args[0].cwd, "/project");
  assert.equal(route.calls[0].args[0].sessionId, "s1");
});

test("Review metadata uses the guarded Project directory for both readers", async () => {
  const route = endpoint("./choices/route.ts");
  const response = await route.get(`${OWNER}&kind=metadata`);
  assert.equal(response.status, 200);
  assert.deepEqual(route.calls, [
    { name: "defaultReviewBase", args: ["/project"] },
    { name: "readReviewBranches", args: ["/project"] },
  ]);
  assert.deepEqual(await response.json(), {
    defaultBranch: null,
    currentBranch: null,
    localBranches: [],
    remotes: ["origin"],
    indexDigest: "index-digest",
    indexPaths: ["staged.txt"],
  });
});

const PULL = `${OWNER}&scope=pullRequest&remoteId=slot&number=7`;
const PINNED = `${PULL}&headSha=${READING}&baseSha=${BASE}`;

test("a pull request is read at the pair the request names, and says so", async () => {
  // A request that names neither end of the comparison, only one of them, or
  // something that is not a revision, is refused before the host is asked.
  const missing = endpoint("./route.ts");
  for (const query of [PULL, PULL + "&headSha=abc", PULL + "&headSha=" + READING]) {
    assert.equal((await missing.get(query)).status, 400);
  }
  assert.equal(missing.calls.length, 0, "a request with no revision still reached GitHub");

  // A directory the guard refuses is refused before the host is asked too.
  const denied = endpoint("./route.ts", { resolved: false });
  assert.equal((await denied.get(PINNED)).status, 403);
  assert.equal(denied.calls.length, 0);

  const route = endpoint("./route.ts");
  const response = await route.get(PINNED);
  assert.equal(response.status, 200);
  const body = await response.json();
  const read = route.calls.find((call) => call.name === "readPullRequestPatchAtRevision");
  assert.equal(read.args[2].headSha, READING, "the head the browser is reading was not carried to the read");
  assert.equal(read.args[2].baseSha, BASE, "the base the browser is reading was not carried to the read");
  assert.equal(body.scope.headSha, READING);
  assert.equal(body.scope.baseSha, BASE, "the answer did not say which comparison it is");
  // Paths in a pull request's patch are the repository's, so the answer names
  // the repository rather than the directory the request came from.
  assert.equal(body.repositoryRoot, "/project");
});

test("a pull request whose head or base has moved is refused, never stamped with the old pair", async () => {
  for (const moved of [{ head: MOVED }, { base: MOVED }]) {
    const route = endpoint("./route.ts", moved);
    const response = await route.get(PINNED);
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.reason, "revision-moved");
    // The pair found, so the browser can offer the changes that exist now.
    assert.equal(body.headSha, moved.head ?? READING);
    assert.equal(body.baseSha, moved.base ?? BASE);
    assert.equal(body.patch, undefined, "changes from another comparison were answered with");
  }
});
