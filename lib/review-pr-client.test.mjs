import assert from "node:assert/strict";
import test from "node:test";
import { reviewPrClient } from "./review-pr-client.ts";

const remote = { id: "slot", host: "github.com", owner: "example", name: "project", remoteName: "origin" };
const repository = { remoteId: "slot", hostname: "github.com", owner: "example", repository: "project", account: "reviewer" };
const identity = { ...repository, number: 7, headSha: "head-a", baseSha: "base-a" };
const context = {
  remotes: [remote], selected: remote,
  access: { status: "ready", identity: { login: "reviewer", canPush: false, permissionsKnown: true } },
};
const pull = { number: 7, headSha: "head-a", baseSha: "base-a", state: "open", author: "someone" };
/** The Review Tab asking, which every pull-request request now carries. */
const asking = { tabId: "review:tab", owner: { projectRoot: "/fixture", worktreePath: "/fixture", sessionId: "s-1" } };

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { await run(); } finally { globalThis.fetch = original; }
}
const response = (value, status = 200) => Response.json(value, { status });

test("closed PR selection sends its status and preserves empty/partial list semantics", async () => {
  await withFetch(async (url) => {
    const params = new URL(url, "http://fixture").searchParams;
    if (params.get("kind") === "context") return response(context);
    assert.equal(params.get("state"), "closed");
    assert.equal(params.get("filter"), "reviewing");
    return response({ items: [], complete: false });
  }, async () => {
    const page = await reviewPrClient.pulls(asking, repository, { state: "closed", view: "reviewing", search: "query", cursor: null }, new AbortController().signal);
    assert.equal(page.complete, false);
    assert.deepEqual(page.items, []);
  });
});

test("a changed account prevents publication without issuing a write", async () => {
  let reads = 0;
  await withFetch(async (_url, options) => {
    assert.notEqual(options?.method, "POST");
    reads++;
    return response({ ...context, access: { status: "ready", identity: { login: "other", canPush: true, permissionsKnown: true } } });
  }, async () => {
    const result = await reviewPrClient.publish(asking, identity, { action: "reply", threadId: "thread", body: "note" });
    assert.equal(result.kind, "refused");
    assert.equal(reads, 1);
  });
});

test("explicit range publication maps to the shared API and never retries an uncertain response", async () => {
  let writes = 0;
  await withFetch(async (_url, options) => {
    if (options?.method !== "POST") return response(context);
    writes++;
    const body = JSON.parse(options.body);
    assert.equal(body.expectedHeadSha, "head-a");
    assert.equal(body.publication.action, "submitReview");
    assert.deepEqual(body.publication.comments, [{ body: "note", path: "notes.txt", side: "LEFT", line: 8, startLine: 5, startSide: "LEFT" }]);
    return response({ status: "uncertain", reason: "no-confirmation" }, 202);
  }, async () => {
    const result = await reviewPrClient.publish(asking, identity, { action: "inline", path: "notes.txt", side: "deletions", startLine: 5, endLine: 8, body: "note" });
    assert.equal(result.kind, "uncertain");
    assert.equal(writes, 1);
  });
});

test("a different head or base never becomes the displayed snapshot", async () => {
  // Either end is enough to refuse: an answer that agrees about the head and
  // not the base describes a comparison nobody asked to read.
  for (const scope of [
    { kind: "pullRequest", remoteId: "slot", number: 7, headSha: "head-b", baseSha: "base-a" },
    { kind: "pullRequest", remoteId: "slot", number: 7, headSha: "head-a", baseSha: "base-b" },
  ]) {
    await withFetch(async (url) => new URL(url, "http://fixture").pathname.endsWith("github") ? response(context) : response({ scope }), async () => {
      await assert.rejects(reviewPrClient.snapshot(asking, repository, pull, new AbortController().signal), /revision changed/);
    });
  }
});

test("the pair being read is carried to both the changes and the threads", async () => {
  const asked = [];
  await withFetch(async (url) => {
    const parsed = new URL(url, "http://fixture");
    const params = parsed.searchParams;
    if (params.get("kind") === "context") return response(context);
    asked.push([parsed.pathname, params.get("headSha"), params.get("baseSha")]);
    if (params.get("kind") === "threads") return response({ items: [], complete: true });
    return response({ scope: { kind: "pullRequest", remoteId: "slot", number: 7, headSha: "head-a", baseSha: "base-a" },
      patch: "", fileRevisions: {}, repositoryRoot: "/fixture", cwd: "/fixture", untrackedFiles: [], omittedUntrackedFiles: 0, conflictedFiles: [] });
  }, async () => {
    const snapshot = await reviewPrClient.snapshot(asking, repository, pull, new AbortController().signal);
    assert.equal(snapshot.identity.baseSha, "base-a");
    assert.equal(snapshot.commentRestriction, null);
    await reviewPrClient.threads(asking, snapshot.identity, null, new AbortController().signal);
    assert.deepEqual(asked.map(([, head, base]) => [head, base]), [["head-a", "base-a"], ["head-a", "base-a"]]);
  });
});

test("a sign-in that is missing is a stated reason, not an empty repository list", async () => {
  await withFetch(async () => response({ remotes: [remote], selected: remote,
    access: { status: "unavailable", reason: "auth-required", message: "Sign in to GitHub to review pull requests." } }), async () => {
    const access = await reviewPrClient.access(asking, null, new AbortController().signal);
    assert.equal(access.status, "unavailable");
    assert.equal(access.reason, "auth-required");
    assert.equal(access.repositories.length, 1, "the Project's remotes are still worth offering");
  });
});

test("permissions the host would not state close the discussion rather than offering a refused form", async () => {
  const quiet = { remotes: [remote], selected: remote,
    access: { status: "ready", identity: { login: "reviewer", canPush: false, permissionsKnown: false } } };
  await withFetch(async (url) => new URL(url, "http://fixture").searchParams.get("kind") === "context" ? response(quiet)
    : response({ scope: { kind: "pullRequest", remoteId: "slot", number: 7, headSha: "head-a", baseSha: "base-a" },
      patch: "", fileRevisions: {}, repositoryRoot: "/fixture", cwd: "/fixture", untrackedFiles: [], omittedUntrackedFiles: 0, conflictedFiles: [] }), async () => {
    const snapshot = await reviewPrClient.snapshot(asking, repository, pull, new AbortController().signal);
    assert.equal(snapshot.canComment, false);
    assert.equal(snapshot.canApprove, false);
    assert.match(snapshot.commentRestriction, /read-only/);
  });
});

test("a thread action under that same restriction is refused without a write leaving", async () => {
  const quiet = { remotes: [remote], selected: remote,
    access: { status: "ready", identity: { login: "reviewer", canPush: false, permissionsKnown: false } } };
  let writes = 0;
  await withFetch(async (_url, options) => {
    if (options?.method === "POST") writes += 1;
    return response(quiet);
  }, async () => {
    // The host's thread flags would allow this reply. The account's standing
    // could not be established, so the reply never goes out.
    const result = await reviewPrClient.publish(asking, identity, { action: "reply", threadId: "T1", body: "note" });
    assert.equal(result.kind, "refused");
    assert.match(result.message, /read-only/);
    assert.equal(writes, 0, "a refused action still reached the publish endpoint");
  });
});

test("a review pins both ends of the comparison, and a thread action pins only the head", async () => {
  const sent = [];
  await withFetch(async (_url, options) => {
    if (options?.method !== "POST") return response(context);
    sent.push(JSON.parse(options.body));
    return response({ status: "published", headSha: "head-a", commentId: "c1" });
  }, async () => {
    await reviewPrClient.publish(asking, identity, { action: "review", event: "approve", body: "Looks right" });
    await reviewPrClient.publish(asking, identity, { action: "inline", path: "notes.txt", side: "additions", startLine: 2, endLine: 2, body: "note" });
    await reviewPrClient.publish(asking, identity, { action: "resolve", threadId: "T1" });
  });
  // Read back what actually left, rather than trusting the success answer.
  assert.deepEqual(sent.map((body) => [body.expectedHeadSha, body.expectedBaseSha]),
    [["head-a", "base-a"], ["head-a", "base-a"], ["head-a", undefined]]);
  assert.equal(sent[0].publication.event, "APPROVE");
});
