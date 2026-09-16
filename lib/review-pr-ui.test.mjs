import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { reviewPrListMessage, reviewPrThreadPlacement, reviewPrThreadRangeLabel, reviewPrActionAllowed } = await jiti.import("./review-pr-ui.ts");

const repository = { remoteId: "slot", hostname: "github.com", owner: "example", repository: "project", account: "reviewer" };
const ready = { status: "ready", repositories: [repository], selected: repository, account: "reviewer", permissionsKnown: true, canPush: false };
const locked = { status: "unavailable", repositories: [repository], selected: repository, reason: "auth-required", message: "Sign in to GitHub to review pull requests." };
const say = (input) => reviewPrListMessage({ access: ready, error: null, loading: false, items: [], search: "", ...input });

test("a repository that cannot be read never reads as a repository with nothing in it", () => {
  const stopped = say({ access: locked });
  assert.equal(stopped.kind, "unavailable");
  assert.equal(stopped.message, locked.message);
  assert.equal(stopped.retry, true);

  // The same shape of input, with access granted, is the empty state and says
  // something else entirely.
  const empty = say({});
  assert.equal(empty.kind, "empty");
  assert.match(empty.message, /no pull requests/i);
});

test("checking is its own state, before either of the other two", () => {
  const checking = say({ access: null, items: null });
  assert.equal(checking.kind, "checking");

  // A list still arriving is not an empty one either.
  assert.equal(say({ items: null }).kind, "loading");
  assert.equal(say({ loading: true }).kind, "loading");
});

test("a failed list is announced with a way to try again, and an empty search says which", () => {
  const failed = say({ error: "Pull requests could not be loaded." });
  assert.equal(failed.kind, "failed");
  assert.equal(failed.retry, true);

  assert.match(say({ search: "parity" }).message, /match this search/);
  assert.equal(say({ items: [{ number: 1 }] }).kind, "listed");
});

const thread = (id, path, startLine, extra = {}) => ({ id, path, startLine, endLine: startLine,
  side: "additions", resolved: false, outdated: false, canReply: true, canResolve: true, comments: [], ...extra });

test("a thread with no line in this revision is never drawn against a nearby one", () => {
  const placed = reviewPrThreadPlacement([
    thread("T1", "src/a.ts", 12),
    thread("T2", "src/a.ts", null, { outdated: true }),
    thread("T3", "src/b.ts", 3),
  ]);
  assert.deepEqual(placed.anchored.map((entry) => entry.id), ["T1", "T3"]);
  assert.deepEqual(placed.unanchored.map((entry) => entry.id), ["T2"]);

  // Asked about one file, it answers about that file only.
  const file = reviewPrThreadPlacement([thread("T1", "src/a.ts", 12), thread("T3", "src/b.ts", 3)], "src/a.ts");
  assert.deepEqual(file.anchored.map((entry) => entry.id), ["T1"]);
});

test("a thread says which column and which lines it was left on", () => {
  assert.equal(reviewPrThreadRangeLabel(thread("T1", "a", 12)), "Line 12 (new)");
  assert.equal(reviewPrThreadRangeLabel(thread("T1", "a", 12, { side: "deletions", endLine: 14 })), "Lines 12–14 (old)");
  assert.equal(reviewPrThreadRangeLabel(thread("T1", "a", null)), "Not in this revision");
});

const permitted = { id: "T1", path: "a", startLine: 1, endLine: 1, side: "additions", resolved: false, outdated: false,
  canReply: true, canResolve: true, comments: [{ id: "C1", body: "b", author: "someone", createdAt: "now", url: "u", canEdit: true, canDelete: true }] };
const gate = (publication, restriction) => reviewPrActionAllowed({ restriction, canComment: true, canApprove: true,
  canRequestChanges: true, threads: [permitted], publication });

test("a restriction closes every action, however willing a thread's own flags are", () => {
  const actions = [
    { action: "reply", threadId: "T1", body: "hi" },
    { action: "resolve", threadId: "T1" },
    { action: "unresolve", threadId: "T1" },
    { action: "edit", commentId: "C1", body: "hi" },
    { action: "delete", commentId: "C1" },
    { action: "inline", path: "a", side: "additions", startLine: 1, endLine: 1, body: "hi" },
    { action: "review", event: "comment", body: "hi" },
    { action: "review", event: "approve", body: "" },
  ];
  // The host says yes to each of these at thread level. The snapshot says this
  // account's standing could not be established, and that decides.
  for (const action of actions) {
    assert.equal(gate(action, null), true, `${action.action} was closed while nothing restricted it`);
    assert.equal(gate(action, "read-only here"), false, `${action.action} stayed open under a restriction`);
  }
});

test("without a restriction, the host's own flags still decide", () => {
  const refused = { ...permitted, canReply: false, canResolve: false,
    comments: [{ ...permitted.comments[0], canEdit: false, canDelete: false }] };
  const ask = (publication) => reviewPrActionAllowed({ restriction: null, canComment: true, canApprove: true,
    canRequestChanges: true, threads: [refused], publication });
  assert.equal(ask({ action: "reply", threadId: "T1", body: "hi" }), false);
  assert.equal(ask({ action: "resolve", threadId: "T1" }), false);
  assert.equal(ask({ action: "edit", commentId: "C1", body: "hi" }), false);
  assert.equal(ask({ action: "delete", commentId: "C1" }), false);
  // A thread this pull request does not hold is not actionable either.
  assert.equal(ask({ action: "reply", threadId: "T9", body: "hi" }), false);
});
