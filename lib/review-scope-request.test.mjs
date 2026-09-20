import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReviewPreviewScope,
  parseReviewPreviewScopeParams,
  parseReviewScope,
  reviewPreviewScopeSearchParams,
} from "./review-scope-request.ts";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const PR = { kind: "pullRequest", remoteId: "remote-1", number: 7, headSha: HEAD, baseSha: BASE };

test("a pull request is a preview scope, and is still not a Git scope", async () => {
  assert.deepEqual(parseReviewPreviewScope(PR), PR);
  // The Git layer refuses what it cannot resolve to a revision, and this is
  // that. Previews read it from the host instead.
  assert.equal(parseReviewScope(PR), null);
});

test("a pull request survives the round trip through a query string", () => {
  const params = new URLSearchParams(reviewPreviewScopeSearchParams(PR));
  assert.deepEqual(parseReviewPreviewScopeParams(params), PR);
});

test("a Project scope keeps the key names it already had", () => {
  const params = new URLSearchParams(reviewPreviewScopeSearchParams({ kind: "branch", base: "main" }));
  assert.equal(params.get("scopeKind"), "branch");
  assert.equal(params.get("scopeBase"), "main");
  assert.deepEqual(parseReviewPreviewScopeParams(params), { kind: "branch", base: "main" });
});

test("anything that is not a pinned pair of revisions is refused", () => {
  // This is the guarantee: a preview reads two revisions the host wrote, so a
  // branch name, a tag, or half a pair never reaches a read.
  assert.equal(parseReviewPreviewScope({ ...PR, headSha: "main" }), null);
  assert.equal(parseReviewPreviewScope({ ...PR, headSha: `${HEAD}; rm -rf /` }), null);
  assert.equal(parseReviewPreviewScope({ ...PR, baseSha: undefined }), null);
  assert.equal(parseReviewPreviewScope({ ...PR, remoteId: "" }), null);
  assert.equal(parseReviewPreviewScope({ ...PR, number: 0 }), null);
  assert.equal(parseReviewPreviewScope({ ...PR, number: 1.5 }), null);
  assert.equal(parseReviewPreviewScope({ kind: "pullRequest" }), null);
});

test("a number written as text is the same pull request", () => {
  // A body carries it as a number and a query string carries it as text.
  assert.deepEqual(parseReviewPreviewScope({ ...PR, number: "7" }), PR);
  assert.equal(parseReviewPreviewScope({ ...PR, number: "seven" }), null);
});
