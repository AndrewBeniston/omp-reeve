import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReviewRequestContext,
  reviewComposerSessionId,
  reviewOwnerBody,
  reviewOwnerKey,
  reviewOwnerSearchParams,
  reviewTabIdFor,
  sameReviewOwner,
} from "./review-owner.ts";

const owner = (projectRoot, worktreePath, sessionId = null) => ({ projectRoot, worktreePath, sessionId });

test("two owners a delimiter would confuse keep separate keys", () => {
  // Joined as "project:…|worktree:…|session:…" these two produce one string,
  // and the Tab of the Session on the left would answer for the one on the
  // right. A directory may contain any separator, so none is used.
  const carriesSeparator = owner("/projects/app", "/projects/app|session:s-2");
  const namesSession = owner("/projects/app", "/projects/app", "s-2");
  assert.notEqual(reviewOwnerKey(carriesSeparator), reviewOwnerKey(namesSession));
  assert.notEqual(reviewTabIdFor(carriesSeparator), reviewTabIdFor(namesSession));
  assert.equal(sameReviewOwner(carriesSeparator, namesSession), false);
});

test("one owner spelled two ways is one owner", () => {
  assert.equal(
    reviewOwnerKey(owner("/projects/app/", "/projects/app/tree/", "s-1")),
    reviewOwnerKey(owner("/projects/app", "/projects/app/tree", "s-1")),
  );
});

test("two Sessions in one Worktree are two owners", () => {
  assert.notEqual(
    reviewOwnerKey(owner("/projects/app", "/projects/app", "s-1")),
    reviewOwnerKey(owner("/projects/app", "/projects/app", "s-2")),
  );
  assert.notEqual(
    reviewOwnerKey(owner("/projects/app", "/projects/app", null)),
    reviewOwnerKey(owner("/projects/app", "/projects/app", "s-1")),
  );
});

test("a caller's own parameters cannot replace the owner", () => {
  const context = { tabId: "review:tab", owner: owner("/projects/app", "/projects/app/tree", "s-1") };
  const params = reviewOwnerSearchParams(context, { cwd: "/elsewhere", sessionId: "s-9", scope: "staged" });
  assert.equal(params.get("cwd"), "/projects/app/tree");
  assert.equal(params.get("sessionId"), "s-1");
  assert.equal(params.get("scope"), "staged");

  const body = reviewOwnerBody(context, { cwd: "/elsewhere", tabId: "review:other", remote: "origin" });
  assert.equal(body.cwd, "/projects/app/tree");
  assert.equal(body.tabId, "review:tab");
  assert.equal(body.remote, "origin");
});

test("a request is read the same way from a query string and a body", () => {
  const fields = { tabId: "review:tab", cwd: "/projects/app/tree", projectRoot: "/projects/app", sessionId: "s-1" };
  assert.deepEqual(parseReviewRequestContext(new URLSearchParams(fields)), parseReviewRequestContext(fields));
  assert.equal(parseReviewRequestContext({ ...fields, cwd: "relative/path" }), null);
  assert.equal(parseReviewRequestContext({ ...fields, projectRoot: "" }), null);
  assert.equal(parseReviewRequestContext({ ...fields, tabId: "" }), null);
  assert.equal(parseReviewRequestContext({ ...fields, sessionId: undefined })?.owner.sessionId, null);
});

test("a Tab hands text to its own Session and to no other", () => {
  const bound = owner("/projects/app", "/projects/app/tree", "s-1");
  assert.equal(reviewComposerSessionId(bound, "/projects/app/tree", "s-1"), "s-1");
  // The Session selected in the same directory is a different conversation.
  assert.equal(reviewComposerSessionId(bound, "/projects/app/tree", "s-2"), null);
  // The right Session, looking at another Worktree.
  assert.equal(reviewComposerSessionId(bound, "/projects/app/other", "s-1"), null);
  // A Tab bound to a Project with no Session hands over nothing.
  assert.equal(reviewComposerSessionId(owner("/projects/app", "/projects/app/tree"), "/projects/app/tree", "s-1"), null);
});
