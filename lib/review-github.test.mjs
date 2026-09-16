import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { parseRemoteUrl, readPullRequests, readPullRequestPatchAtRevision, readReviewThreads, readIdentity, readRemoteAccess, refusePublication, publishReview, commentableLines, classifyWrite } =
  await jiti.import("./review-github.ts");

const remote = { id: "slot", remoteName: "origin", host: "github.com", owner: "someone", name: "project" };

/** A command that never reaches a host, and records what it was asked. */
function gh(answers) {
  const calls = [];
  const runner = async (args, input) => {
    calls.push(Object.assign(args, { input }));
    const answer = answers.find((entry) => entry.match(args));
    if (!answer) throw new Error("unexpected command: " + args.join(" "));
    return {
      code: answer.code ?? 0, stdout: answer.stdout ?? "", stderr: answer.stderr ?? "",
      ...(answer.timedOut ? { timedOut: true } : {}),
    };
  };
  return { runner, calls };
}

test("a remote URL names a repository in either form, or nothing at all", () => {
  assert.deepEqual(parseRemoteUrl("git@github.com:someone/project.git"), {
    host: "github.com", owner: "someone", name: "project",
  });
  assert.deepEqual(parseRemoteUrl("https://github.com/someone/project.git"), {
    host: "github.com", owner: "someone", name: "project",
  });
  // A host of its own is read the same way: nothing here assumes one host.
  assert.deepEqual(parseRemoteUrl("git@git.example.org:team/thing.git"), {
    host: "git.example.org", owner: "team", name: "thing",
  });
  assert.equal(parseRemoteUrl("/srv/local/bare.git"), null);
});

test("a list says when the host had more than it was asked for", async () => {
  const page = (count) => JSON.stringify(
    Array.from({ length: count }, (_, index) => ({
      number: index + 1, title: "t", author: { login: "a" }, state: "OPEN", isDraft: false,
      headRefName: "h", baseRefName: "b", headRefOid: String(index).padStart(40, "a"),
      baseRefOid: String(index).padStart(40, "b"), updatedAt: "now", url: "u",
    })),
  );

  const exact = gh([{ match: () => true, stdout: page(3) }]);
  const complete = await readPullRequests(remote, { limit: 3 }, exact.runner);
  assert.equal(complete.items.length, 3);
  assert.equal(complete.complete, true);

  // One more than the limit came back, which is how the host says there is more.
  const more = gh([{ match: () => true, stdout: page(4) }]);
  const partial = await readPullRequests(remote, { limit: 3 }, more.runner);
  assert.equal(partial.items.length, 3, "the extra entry must not be shown");
  assert.equal(partial.complete, false, "a truncated list was reported as the whole answer");
  assert.equal(partial.items[0].headSha, "a".repeat(39) + "0", "the revision the list saw must be carried");
  assert.equal(partial.items[0].baseSha, "b".repeat(39) + "0", "the base the list saw must be carried with it");
});

test("the filters a human chooses become the host's own search", async () => {
  const reviewing = gh([{ match: () => true, stdout: "[]" }]);
  await readPullRequests(remote, { filter: "reviewing" }, reviewing.runner);
  assert.ok(reviewing.calls[0].includes("review-requested:@me"));
  // Open is what a review list shows unless a human asks for more.
  assert.equal(reviewing.calls[0][reviewing.calls[0].indexOf("--state") + 1], "open");

  const merged = gh([{ match: () => true, stdout: "[]" }]);
  await readPullRequests(remote, { state: "merged" }, merged.runner);
  assert.equal(merged.calls[0][merged.calls[0].indexOf("--state") + 1], "merged");

  const authored = gh([{ match: () => true, stdout: "[]" }]);
  await readPullRequests(remote, { filter: "authored" }, authored.runner);
  assert.equal(authored.calls[0][authored.calls[0].indexOf("--search") + 1], "author:@me");
  // The repository is named by this server, from the slot it issued.
  assert.ok(authored.calls[0].includes("github.com/someone/project"));
});

test("a failure is reported in this module's words, never the command's", async () => {
  const unauthenticated = gh([
    { match: (args) => args[0] === "auth", code: 1, stderr: "To get started with GitHub CLI, please run: gh auth login" },
  ]);
  await assert.rejects(() => readIdentity(remote, unauthenticated.runner), (error) => {
    assert.equal(error.reason, "auth-required");
    assert.doesNotMatch(String(error.message), /gh auth login/, "the command's own words reached the caller");
    return true;
  });

  const refused = gh([
    { match: (args) => args[0] === "auth", code: 0 },
    { match: () => true, code: 1, stderr: "HTTP 502 while requesting https://api.github.com/user" },
  ]);
  await assert.rejects(() => readIdentity(remote, refused.runner), (error) => {
    assert.equal(error.reason, "remote-unavailable");
    assert.doesNotMatch(String(error.message), /api\.github\.com/, "a host's own message reached the caller");
    return true;
  });
});

test("threads are read with what the viewer may do with them", async () => {
  const answer = {
    data: { repository: { pullRequest: { reviewThreads: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{
        id: "T1", path: "src/a.ts", line: 12, diffSide: "RIGHT", isResolved: false, isOutdated: false,
        viewerCanResolve: true, viewerCanUnresolve: false, viewerCanReply: true,
        comments: { pageInfo: { hasNextPage: true }, nodes: [
          { id: "C1", body: "first", createdAt: "now", url: "u", viewerCanUpdate: true, viewerCanDelete: false, author: { login: "someone" } },
        ] },
      }],
    } } } },
  };
  const runner = gh([{ match: () => true, stdout: JSON.stringify(answer) }]).runner;
  const threads = await readReviewThreads(remote, 7, runner);

  assert.equal(threads.items.length, 1);
  assert.equal(threads.items[0].comments[0].viewerCanEdit, true);
  assert.equal(threads.items[0].comments[0].viewerCanDelete, false);
  assert.equal(threads.complete, false, "a thread with more comments than were read was reported as whole");
});

test("publication is judged against the pull request, not against what was sent", () => {
  const threads = [{
    id: "T1", path: "src/a.ts", line: 4, side: "RIGHT", resolved: false, outdated: false,
    viewerCanResolve: true, viewerCanUnresolve: false, viewerCanReply: true,
    comments: [{ id: "C1", author: "someone", body: "b", createdAt: "now", url: "u", viewerCanEdit: false, viewerCanDelete: true }],
  }];
  // One file, one hunk: line 4 removed, 5 added, 6 and 7 context.
  const patch = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -4,3 +4,3 @@",
    "-gone",
    "+added",
    " kept",
    " also",
  ].join("\n");
  const context = { headSha: "abc", expectedHeadSha: "abc", threads, lines: commentableLines(patch) };

  // The revision moved under the human: refused rather than published anyway.
  assert.equal(
    refusePublication({ action: "replyToThread", threadId: "T1", body: "hi" }, { ...context, headSha: "def" }),
    "head-moved",
  );
  // Identifiers that belong to something else are refused.
  assert.equal(refusePublication({ action: "resolveThread", threadId: "T9" }, context), "thread-not-in-pull-request");
  assert.equal(refusePublication({ action: "editComment", commentId: "C9", body: "x" }, context), "comment-not-in-pull-request");
  // What the host says the viewer may do is what decides.
  assert.equal(refusePublication({ action: "editComment", commentId: "C1", body: "x" }, context), "not-permitted");
  assert.equal(refusePublication({ action: "unresolveThread", threadId: "T1" }, context), "not-permitted");
  assert.equal(refusePublication({ action: "deleteComment", commentId: "C1" }, context), null);
  // Reviewing is not write access: anyone who can read a repository may
  // approve, and the host refuses the cases it reserves for itself.
  assert.equal(
    refusePublication({ action: "submitReview", event: "APPROVE", body: "ok", comments: [] }, context),
    null,
  );
  // The patch shows 4, 5 and 6 on the right, and 4, 5 and 6 on the left.
  const at = (comment) => refusePublication(
    { action: "submitReview", event: "COMMENT", body: "", comments: [{ path: "src/a.ts", body: "x", ...comment }] },
    context,
  );
  assert.equal(at({ line: 5, side: "RIGHT" }), null, "an added line must be commentable");
  assert.equal(at({ line: 4, side: "LEFT" }), null, "a removed line must be commentable on the left");
  assert.equal(at({ line: 99, side: "RIGHT" }), "line-not-in-revision", "a line the patch never shows was accepted");
  assert.equal(at({ line: 5, side: "RIGHT", startLine: 4, startSide: "RIGHT" }), null);
  assert.equal(at({ line: 4, side: "RIGHT", startLine: 5, startSide: "RIGHT" }), "line-not-in-revision");
  // A range cannot straddle the two sides of a file.
  assert.equal(at({ line: 5, side: "RIGHT", startLine: 4, startSide: "LEFT" }), "line-not-in-revision");
  assert.equal(
    refusePublication({ action: "submitReview", event: "COMMENT", body: "", comments: [{ path: "other.ts", line: 1, side: "RIGHT", body: "x" }] }, context),
    "path-not-in-pull-request",
  );
  assert.equal(
    refusePublication({ action: "submitReview", event: "COMMENT", body: "looks fine", comments: [] }, context),
    null,
  );
});

/** Answers for the three reads every publication makes before it acts. */
function publishFixture(headSha) {
  return [
    { match: (args) => args.includes("headRefOid") && args.includes("--jq"), stdout: headSha + "\n" },
    { match: (args) => args[1] === "diff", stdout: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+one\n" },
    {
      match: (args) => args[1] === "graphql" && String(args).includes("reviewThreads"),
      stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: {
        pageInfo: { hasNextPage: false, endCursor: null }, nodes: [],
      } } } } }),
    },
  ];
}

/**
 * One open thread carrying two comments: the viewer's own, and somebody
 * else's. The host's flags are the only thing that says which is which, so
 * they are what the fixture varies.
 */
const DISCUSSION = {
  data: { repository: { pullRequest: { reviewThreads: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{
      id: "T1", path: "src/a.ts", line: 4, diffSide: "RIGHT", isResolved: false, isOutdated: false,
      viewerCanResolve: true, viewerCanUnresolve: true, viewerCanReply: true,
      comments: { pageInfo: { hasNextPage: false }, nodes: [
        { id: "MINE", body: "mine", createdAt: "now", url: "u", viewerCanUpdate: true, viewerCanDelete: true, author: { login: "viewer" } },
        { id: "THEIRS", body: "theirs", createdAt: "now", url: "u", viewerCanUpdate: false, viewerCanDelete: false, author: { login: "someone" } },
      ] },
    }],
  } } } },
};

/** The reads a thread action makes, plus one answer for the mutation itself. */
function discussionFixture(headSha, mutation) {
  return [
    { match: (args) => args.includes("headRefOid") && args.includes("--jq"), stdout: headSha + "\n" },
    { match: (args) => args[1] === "graphql" && String(args).includes("reviewThreads"), stdout: JSON.stringify(DISCUSSION) },
    { match: (args) => args[1] === "graphql" && String(args).includes("mutation"), ...mutation },
  ];
}

/** What the host sends back when it did the thing, by mutation. */
const ACCEPTED = {
  reply: { addPullRequestReviewThreadReply: { comment: { id: "NEW" } } },
  edit: { updatePullRequestReviewComment: { pullRequestReviewComment: { id: "MINE" } } },
  delete: { deletePullRequestReviewComment: { clientMutationId: null } },
  resolve: { resolveReviewThread: { thread: { id: "T1" } } },
  unresolve: { unresolveReviewThread: { thread: { id: "T1" } } },
};

test("each thread action sends its own mutation, and nothing else", async () => {
  const actions = [
    [{ action: "replyToThread", threadId: "T1", body: "a reply" }, "addPullRequestReviewThreadReply", ACCEPTED.reply],
    [{ action: "editComment", commentId: "MINE", body: "edited" }, "updatePullRequestReviewComment", ACCEPTED.edit],
    [{ action: "deleteComment", commentId: "MINE" }, "deletePullRequestReviewComment", ACCEPTED.delete],
    [{ action: "resolveThread", threadId: "T1" }, "resolveReviewThread", ACCEPTED.resolve],
    [{ action: "unresolveThread", threadId: "T1" }, "unresolveReviewThread", ACCEPTED.unresolve],
  ];
  for (const [publication, mutation, accepted] of actions) {
    const { runner, calls } = gh(discussionFixture("abc", { stdout: JSON.stringify({ data: accepted }) }));
    const outcome = await publishReview(remote, 7, { headSha: "abc" }, publication, runner);

    assert.equal(outcome.status, "published", `${publication.action} was not published`);
    const writes = calls.filter((args) => String(args).includes("mutation"));
    assert.equal(writes.length, 1, `${publication.action} sent more than one write`);
    assert.ok(String(writes[0]).includes(mutation), `${publication.action} sent the wrong mutation`);
    // A thread action describes a conversation. It must not read the changes,
    // and it must not carry a body anyone drafted elsewhere.
    assert.equal(calls.some((args) => args[1] === "diff"), false, `${publication.action} read the diff`);
  }
});

test("only the viewer's own comment can be edited or deleted", async () => {
  for (const publication of [
    { action: "deleteComment", commentId: "THEIRS" },
    { action: "editComment", commentId: "THEIRS", body: "rewritten" },
  ]) {
    const { runner, calls } = gh(discussionFixture("abc", { code: 1, stderr: "gh: Forbidden (HTTP 403)" }));
    const outcome = await publishReview(remote, 7, { headSha: "abc" }, publication, runner);

    assert.deepEqual(outcome, { status: "refused", reason: "not-permitted" });
    assert.equal(calls.some((args) => String(args).includes("mutation")), false,
      `${publication.action} on another author's comment reached the host`);
  }
});

test("a thread action whose answer never arrived is not sent again", async () => {
  const { runner, calls } = gh(discussionFixture("abc", { code: 1, timedOut: true }));
  const outcome = await publishReview(remote, 7, { headSha: "abc" }, { action: "resolveThread", threadId: "T1" }, runner);

  assert.deepEqual(outcome, { status: "uncertain", reason: "no-confirmation" });
  assert.equal(calls.filter((args) => String(args).includes("mutation")).length, 1);
});

test("a moved base refuses only a publication that pinned one", async () => {
  const head = "a".repeat(40);
  const pair = (baseSha) => [
    { match: (args) => args.includes("--json") && String(args).includes("baseRefOid"),
      stdout: JSON.stringify({ headRefOid: head, baseRefOid: baseSha }) },
    { match: (args) => args.includes("headRefOid") && args.includes("--jq"), stdout: head + "\n" },
    { match: (args) => args[1] === "graphql" && String(args).includes("reviewThreads"), stdout: JSON.stringify(DISCUSSION) },
    { match: (args) => args[1] === "graphql" && String(args).includes("mutation"), stdout: JSON.stringify({ data: ACCEPTED.resolve }) },
  ];
  const reply = { action: "resolveThread", threadId: "T1" };

  const moved = gh(pair("c".repeat(40)));
  assert.deepEqual(
    await publishReview(remote, 7, { headSha: head, baseSha: "b".repeat(40) }, reply, moved.runner),
    { status: "refused", reason: "base-moved" },
  );
  assert.equal(moved.calls.some((args) => String(args).includes("mutation")), false);

  // The same moved base, and a publication that never named one: unaffected,
  // and the base is not even read.
  const unpinned = gh(pair("c".repeat(40)));
  assert.equal((await publishReview(remote, 7, { headSha: head }, reply, unpinned.runner)).status, "published");
  assert.equal(unpinned.calls.some((args) => String(args).includes("baseRefOid")), false,
    "a publication that pinned no base still made the host report one");
});

test("a publication refused for drift sends nothing at all", async () => {
  const { runner, calls } = gh(publishFixture("moved"));
  const outcome = await publishReview(
    remote, 7, { headSha: "what-the-human-read" },
    { action: "submitReview", event: "COMMENT", body: "note", comments: [] },
    runner,
  );

  assert.deepEqual(outcome, { status: "refused", reason: "head-moved" });
  const wrote = calls.some((args) => args.includes("--method") || String(args).includes("mutation"));
  assert.equal(wrote, false, "a refused publication still sent a write to the host");
});

test("a write that was cut off is reported as unknown, and never sent twice", async () => {
  const { runner, calls } = gh([
    ...publishFixture("abc"),
    { match: (args) => args.includes("--method"), code: 1, timedOut: true },
  ]);
  const outcome = await publishReview(
    remote, 7, { headSha: "abc" },
    { action: "submitReview", event: "COMMENT", body: "note", comments: [] },
    runner,
  );

  assert.deepEqual(outcome, { status: "uncertain", reason: "no-confirmation" });
  const writes = calls.filter((args) => args.includes("--method"));
  assert.equal(writes.length, 1, "an uncertain write was attempted again");
});

test("a review is anchored to the revision the human read", async () => {
  const { runner, calls } = gh([
    ...publishFixture("abc"),
    { match: (args) => args.includes("--method"), stdout: JSON.stringify({ id: 99 }) },
  ]);
  const outcome = await publishReview(
    remote, 7, { headSha: "abc" },
    { action: "submitReview", event: "COMMENT", body: "note", comments: [] },
    runner,
  );

  assert.equal(outcome.status, "published");
  const write = calls.find((args) => args.includes("--method"));
  assert.ok(write, "nothing was sent");
  // The body travels on stdin, which the fake keeps beside the arguments.
  const sent = JSON.parse(write.input);
  assert.equal(sent.commit_id, "abc", "the review was not anchored to the revision that was read");
  assert.equal(sent.event, "COMMENT");
});

test("only an answer that says it happened counts as published", () => {
  // The host replied and named what it created.
  assert.deepEqual(classifyWrite({ code: 0, stdout: JSON.stringify({ id: 12 }), stderr: "" }), { kind: "published", id: "12" });
  // It replied at the transport level and then refused in the payload.
  assert.deepEqual(
    classifyWrite({ code: 0, stdout: JSON.stringify({ errors: [{ message: "Forbidden" }] }), stderr: "" }),
    { kind: "refused", reason: "not-permitted" },
  );
  // Exit zero with nothing recognisable promises nothing.
  assert.deepEqual(classifyWrite({ code: 0, stdout: "OK", stderr: "" }), { kind: "uncertain" });
  // A status the host reported is an answer: the write did not happen.
  assert.deepEqual(classifyWrite({ code: 1, stdout: "", stderr: "HTTP 403: Resource not accessible" }), {
    kind: "refused", reason: "not-permitted",
  });
  assert.deepEqual(classifyWrite({ code: 1, stdout: "", stderr: "HTTP 422: Validation failed" }), {
    kind: "refused", reason: "line-not-in-revision",
  });
  // No status at all is a connection that died, which says nothing about
  // whether the host acted.
  assert.deepEqual(classifyWrite({ code: 1, stdout: "", stderr: "read ECONNRESET" }), { kind: "uncertain" });
  assert.deepEqual(classifyWrite({ code: 1, stdout: "", stderr: "HTTP 502 Bad Gateway" }), { kind: "uncertain" });
  // A command exiting non-zero is not itself an HTTP status.
  assert.notDeepEqual(classifyWrite({ code: 403, stdout: "", stderr: "broken pipe" }), {
    kind: "refused", reason: "not-permitted",
  });
});

/** A host whose revision answers differ each time it is asked. */
function movingRevisions(pairs, diff = "--- a/x\n+++ b/x\n") {
  const asked = [];
  const runner = async (args) => {
    asked.push(args[1]);
    if (args[1] === "view") {
      const pair = pairs.shift();
      return { code: 0, stdout: JSON.stringify(pair ?? {}), stderr: "" };
    }
    return { code: 0, stdout: diff, stderr: "" };
  };
  return { runner, asked };
}

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MOVED = "c".repeat(40);
const pair = (headRefOid, baseRefOid) => ({ headRefOid, baseRefOid });

test("a pull request is read pinned to one head and base pair, on both sides of the read", async () => {
  const reading = { headSha: HEAD, baseSha: BASE };

  const stable = movingRevisions([pair(HEAD, BASE), pair(HEAD, BASE)]);
  const read = await readPullRequestPatchAtRevision(remote, 7, reading, stable.runner);
  assert.equal(read.status, "read");
  assert.deepEqual(read.revision, reading);
  assert.ok(read.value.includes("+++ b/x"));

  // A pair that moved before the read is refused without fetching anything:
  // there is no point pulling a whole pull request's changes down to throw
  // them away.
  const staleHead = movingRevisions([pair(MOVED, BASE)]);
  assert.deepEqual(await readPullRequestPatchAtRevision(remote, 7, reading, staleHead.runner), {
    status: "revision-moved", revision: { headSha: MOVED, baseSha: BASE },
  });
  assert.deepEqual(staleHead.asked, ["view"], "a request at a revision the host had left still fetched changes");

  // The base is half the comparison, so it is refused on the same terms as the
  // head. A head that stood still against a base that did not is a different
  // set of changes from the one being read.
  const staleBase = movingRevisions([pair(HEAD, MOVED)]);
  assert.deepEqual(await readPullRequestPatchAtRevision(remote, 7, reading, staleBase.runner), {
    status: "revision-moved", revision: { headSha: HEAD, baseSha: MOVED },
  });

  // A pair that moves during the read leaves changes belonging to revisions
  // nobody asked for. They are refused rather than stamped with the old pair,
  // which is what a reviewer would otherwise comment against.
  for (const during of [pair(MOVED, BASE), pair(HEAD, MOVED)]) {
    const moving = movingRevisions([pair(HEAD, BASE), during]);
    const answer = await readPullRequestPatchAtRevision(remote, 7, reading, moving.runner);
    assert.equal(answer.status, "revision-moved");
  }

  // A revision is the same revision whichever case it is written in.
  const upper = movingRevisions([pair(HEAD, BASE), pair(HEAD, BASE)]);
  assert.equal((await readPullRequestPatchAtRevision(remote, 7,
    { headSha: HEAD.toUpperCase(), baseSha: BASE.toUpperCase() }, upper.runner)).status, "read");
});

test("a pull request the host half-describes is not treated as pinned", async () => {
  const half = movingRevisions([{ headRefOid: HEAD }]);
  await assert.rejects(
    () => readPullRequestPatchAtRevision(remote, 7, { headSha: HEAD, baseSha: BASE }, half.runner),
    (error) => {
      assert.equal(error.reason, "incomplete-data");
      return true;
    },
  );
});

test("an entry the host could not fully describe leaves the list saying so", async () => {
  const entry = (extra) => ({
    number: 1, title: "t", author: { login: "a" }, state: "OPEN", isDraft: false,
    headRefName: "h", baseRefName: "b", updatedAt: "now", url: "u", ...extra,
  });
  const partial = gh([{ match: () => true, stdout: JSON.stringify([
    entry({ headRefOid: HEAD, baseRefOid: BASE }), entry({ number: 2, headRefOid: HEAD }),
  ]) }]);
  const page = await readPullRequests(remote, {}, partial.runner);
  assert.equal(page.items.length, 1, "a pull request with no base was offered as though it could be pinned");
  assert.equal(page.items[0].baseSha, BASE);
  assert.equal(page.complete, false, "a list missing an entry was reported as the whole answer");
});

test("a chosen view and a typed search reach the host as one query", async () => {
  const searched = gh([{ match: () => true, stdout: "[]" }]);
  await readPullRequests(remote, { filter: "authored", query: "in:title parity" }, searched.runner);
  const args = searched.calls[0];
  assert.equal(args.filter((value) => value === "--search").length, 1, "two searches let one of them fall away");
  assert.equal(args[args.indexOf("--search") + 1], "author:@me in:title parity");
});

test("access says why reading cannot happen, and never by saying nothing", async () => {
  const missing = gh([{ match: (args) => args[0] === "auth", code: 1, stderr: "gh auth login" }]);
  assert.deepEqual(await readRemoteAccess(remote, missing.runner), { status: "unavailable", reason: "auth-required" });

  const nameless = gh([
    { match: (args) => args[0] === "auth", code: 0 },
    { match: () => true, code: 0, stdout: "\n" },
  ]);
  assert.deepEqual(await readRemoteAccess(remote, nameless.runner), { status: "unavailable", reason: "incomplete-data" });

  // A host that will not say what an account may do is recorded as not having
  // said it, which is not the same as having refused.
  const quiet = gh([
    { match: (args) => args[0] === "auth", code: 0 },
    { match: (args) => args.includes("user"), code: 0, stdout: "someone\n" },
    { match: () => true, code: 1, stderr: "HTTP 404" },
  ]);
  assert.deepEqual(await readRemoteAccess(remote, quiet.runner), {
    status: "ready", identity: { login: "someone", canPush: false, permissionsKnown: false },
  });
});
