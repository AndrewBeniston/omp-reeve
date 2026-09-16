import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { OWNER_FIELDS, OWNER_QUERY, reviewOwnerServerStub } from "../owner-stub.mjs";

/**
 * The GitHub routes, with the module beneath them replaced.
 *
 * Nothing here reaches a host: the reader and the publisher are stubs that
 * record what they were asked, which is what lets a guard be tested by proving
 * they were never called at all.
 */
/** The pair a browser says it is reading, and what the host says it is. */
const READING = "a".repeat(40);
const BASE = "b".repeat(40);
const MOVED = "c".repeat(40);

function endpoint(relativePath, {
  lexical = true, resolved = true, repositoryRoot = "/project",
  remote = { id: "slot", host: "h", owner: "o", name: "n" }, outcome, head = READING, base = BASE,
  access = { status: "ready", identity: { login: "someone", canPush: false, permissionsKnown: true } },
} = {}) {
  const calls = [];
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
        // The repository Git resolves to is checked as well as the directory
        // that was asked for. A root outside the guard is refused whatever the
        // directory's own answer is.
        isFilePathAllowed: (path) => (path === "/elsewhere" ? false : lexical),
        isExistingFilePathAllowed: (path) => (path === "/elsewhere" ? false : resolved),
        isWindowsAbsolutePath: (path) => /^[A-Z]:\\/i.test(path),
      };
      if (name === "@/lib/review-owner-server") return reviewOwnerServerStub({ lexical, resolved });
      if (name === "@/lib/review-github") {
        class ReviewGitHubError extends Error {
          constructor(reason) { super(reason); this.reason = reason; }
        }
        return {
          ReviewGitHubError,
          // The real rule, so a revision that is not one is refused here too.
          isRevision: (value) => typeof value === "string" && /^[0-9a-f]{40}$/i.test(value),
          resolveRepositoryRoot: async (...args) => { calls.push({ name: "resolveRepositoryRoot", args }); return repositoryRoot; },
          resolveRemote: async (...args) => { calls.push({ name: "resolveRemote", args }); return remote; },
          readGitHubRemotes: async () => { calls.push({ name: "readGitHubRemotes" }); return remote ? [remote] : []; },
          readRemoteAccess: async (...args) => { calls.push({ name: "readRemoteAccess", args }); return access; },
          readPullRequests: async (...args) => { calls.push({ name: "readPullRequests", args }); return { items: [], complete: true }; },
          // Threads belong to a comparison, so the stub answers only when both
          // ends are still the ones the request named.
          readReviewThreadsAtRevision: async (...args) => {
            calls.push({ name: "readReviewThreadsAtRevision", args });
            const asked = args[2];
            return head === asked.headSha && base === asked.baseSha
              ? { status: "read", revision: asked, value: { items: [], complete: true } }
              : { status: "revision-moved", revision: { headSha: head, baseSha: base } };
          },
          publishReview: async (...args) => { calls.push({ name: "publishReview", args }); return outcome; },
        };
      }
      throw new Error("Unexpected route dependency: " + name);
    },
  });
  return {
    calls,
    get: (query) => exports.GET({ nextUrl: new URL("http://localhost/?" + query) }),
    post: (body) => exports.POST({ json: async () => body }),
  };
}

test("reading pull requests is refused for a directory the guard does not allow", async () => {
  for (const options of [{ lexical: false }, { resolved: false }]) {
    const route = endpoint("./route.ts", options);
    assert.equal((await route.get(`${OWNER_QUERY}&kind=pulls&remoteId=slot`)).status, 403);
    assert.equal(route.calls.length, 0, "a refused directory still reached GitHub");
  }
});

test("a repository is named by a slot this server issued, never by the request", async () => {
  // A directory inside a repository does not authorise the repository: Git
  // finds that by walking upwards, and it can sit outside the guard.
  const nested = endpoint("./route.ts", { repositoryRoot: "/elsewhere" });
  assert.equal((await nested.get(`${OWNER_QUERY}&kind=pulls&remoteId=slot`)).status, 403);
  assert.equal(nested.calls.some((call) => call.name === "readPullRequests"), false, "an unguarded repository was read");

  const missing = endpoint("./route.ts", { remote: null });
  const response = await missing.get(`${OWNER_QUERY}&kind=pulls&remoteId=someone-elses`);
  assert.equal(response.status, 400);
  assert.equal(missing.calls.some((call) => call.name === "readPullRequests"), false);

  const route = endpoint("./route.ts");
  await route.get(`${OWNER_QUERY}&kind=pulls&remoteId=slot&state=merged&filter=authored`);
  const listed = route.calls.find((call) => call.name === "readPullRequests");
  assert.equal(listed.args[1].state, "merged");
  assert.equal(listed.args[1].filter, "authored");
});

test("publishing needs a directory, a pull request, a revision and a known action", async () => {
  const head = "a".repeat(40);
  const route = endpoint("./publish/route.ts", { outcome: { status: "published", headSha: head } });
  const publication = { action: "submitReview", event: "COMMENT", body: "note", comments: [] };

  assert.equal((await route.post({ ...OWNER_FIELDS, cwd: "relative", number: 1, expectedHeadSha: head, publication })).status, 400);
  assert.equal((await route.post({ ...OWNER_FIELDS, number: 0, expectedHeadSha: head, publication })).status, 400);
  assert.equal((await route.post({ ...OWNER_FIELDS, number: 1, publication })).status, 400);
  // A revision has to be one, and a publication has to be the shape it claims.
  assert.equal((await route.post({ ...OWNER_FIELDS, number: 1, expectedHeadSha: "abc", publication })).status, 400);
  assert.equal((await route.post({ ...OWNER_FIELDS, number: 1, expectedHeadSha: head, publication: { action: "merge" } })).status, 400);
  assert.equal((await route.post({
    ...OWNER_FIELDS, number: 1, expectedHeadSha: head,
    publication: { action: "submitReview", event: "MERGE", body: "", comments: [] },
  })).status, 400);
  assert.equal((await route.post({
    ...OWNER_FIELDS, number: 1, expectedHeadSha: head,
    publication: { action: "submitReview", event: "COMMENT", body: "", comments: [{ path: "a", line: "3", side: "RIGHT", body: "x" }] },
  })).status, 400, "a line that is not a number reached the publisher");
  assert.equal(route.calls.some((call) => call.name === "publishReview"), false, "a rejected request still published");

  const denied = endpoint("./publish/route.ts", { resolved: false, outcome: { status: "published", headSha: head } });
  assert.equal((await denied.post({ ...OWNER_FIELDS, remoteId: "slot", number: 1, expectedHeadSha: head, publication })).status, 403);
  assert.equal(denied.calls.some((call) => call.name === "publishReview"), false);

  // A repository outside the guard is refused even when the directory is not.
  const outside = endpoint("./publish/route.ts", { repositoryRoot: "/elsewhere", outcome: { status: "published", headSha: head } });
  assert.equal((await outside.post({ ...OWNER_FIELDS, remoteId: "slot", number: 1, expectedHeadSha: head, publication })).status, 403);
  assert.equal(outside.calls.some((call) => call.name === "publishReview"), false, "an unguarded repository was published to");
});

test("a refusal and an uncertain write are answers the browser can act on", async () => {
  const refused = endpoint("./publish/route.ts", { outcome: { status: "refused", reason: "head-moved" } });
  const response = await refused.post({
    ...OWNER_FIELDS, remoteId: "slot", number: 1, expectedHeadSha: "b".repeat(40),
    publication: { action: "resolveThread", threadId: "T1" },
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { status: "refused", reason: "head-moved" });

  const uncertain = endpoint("./publish/route.ts", { outcome: { status: "uncertain", reason: "no-confirmation" } });
  const unknown = await uncertain.post({
    ...OWNER_FIELDS, remoteId: "slot", number: 1, expectedHeadSha: "c".repeat(40),
    publication: { action: "replyToThread", threadId: "T1", body: "hi" },
  });
  assert.equal(unknown.status, 202, "an unknown write must not read as success or failure");
});

const THREADS = `${OWNER_QUERY}&kind=threads&remoteId=slot&number=7`;

test("threads are read at the revision the request names", async () => {
  // A thread's line means nothing without the comparison it is placed in, so a
  // request naming neither end, or only one, is refused before the host is asked.
  const missing = endpoint("./route.ts");
  for (const query of [THREADS, THREADS + "&headSha=abc", THREADS + "&headSha=" + READING]) {
    assert.equal((await missing.get(query)).status, 400);
  }
  assert.equal(missing.calls.some((call) => call.name === "readReviewThreadsAtRevision"), false);

  const route = endpoint("./route.ts");
  const response = await route.get(`${THREADS}&headSha=${READING}&baseSha=${BASE}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], complete: true });
  const read = route.calls.find((call) => call.name === "readReviewThreadsAtRevision");
  // Compared field by field: the route's objects come from another realm, so
  // their prototypes are not this one's.
  assert.equal(read.args[2].headSha, READING, "the head being reviewed was not carried to the read");
  assert.equal(read.args[2].baseSha, BASE, "the base being reviewed was not carried to the read");
});

test("threads at a pair that has moved are refused rather than answered", async () => {
  // Either end moving is the same refusal: the comparison the threads belong
  // to is not the one on screen.
  for (const moved of [{ head: MOVED }, { base: MOVED }]) {
    const route = endpoint("./route.ts", moved);
    const response = await route.get(`${THREADS}&headSha=${READING}&baseSha=${BASE}`);
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.reason, "revision-moved");
    assert.equal(body.headSha, moved.head ?? READING);
    assert.equal(body.baseSha, moved.base ?? BASE);
    assert.equal(body.items, undefined, "threads from another comparison were answered with");
  }
});

test("a missing sign-in is stated, never answered with an empty list", async () => {
  const locked = endpoint("./route.ts", { access: { status: "unavailable", reason: "auth-required" } });
  const response = await locked.get(`${OWNER_QUERY}&kind=context&remoteId=slot`);
  assert.equal(response.status, 200, "the Project's remotes are still worth showing");
  const body = await response.json();
  assert.equal(body.access.status, "unavailable");
  assert.equal(body.access.reason, "auth-required");
  assert.match(body.access.message, /Sign in/, "the reason reached the browser without words to show");
  assert.equal(body.items, undefined);

  const ready = endpoint("./route.ts");
  const answered = await (await ready.get(`${OWNER_QUERY}&kind=context&remoteId=slot`)).json();
  assert.equal(answered.access.status, "ready");
  assert.equal(answered.access.identity.login, "someone");
});
