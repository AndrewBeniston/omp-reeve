import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgePrSubmission,
  reviewPrDraftPlacement,
  reviewPrDraftRevisionLabel,
  reviewSubmissionComments,
  reviewSubmissionConfirmation,
  reviewSubmissionPublication,
  reviewSubmissionRefusal,
  reviewSubmissionRequest,
  reviewSubmissionRetention,
  reviewSubmissionRevisionState,
} from "./review-submission.ts";

const identity = { remoteId: "origin-slot", hostname: "github.com", owner: "example", repository: "project",
  account: "reviewer", number: 7, headSha: "head-aaaaaaaaaa", baseSha: "base-bbbbbbbbbb" };
const pinned = { headSha: identity.headSha, baseSha: identity.baseSha };
const open = { restriction: null, canComment: true, canApprove: true, canRequestChanges: true, revision: { kind: "current" } };
const inline = (over = {}) => ({ id: "c1", saved: true, updatedAt: "2026-09-15T00:00:00Z", pinned,
  publication: { action: "inline", path: "lib/a.ts", side: "additions", startLine: 4, endLine: 6, body: "Explain this" }, ...over });

test("every verdict is submittable, and each carries its saved line comments in one review", () => {
  const carried = reviewSubmissionComments([inline()], pinned);
  for (const verdict of ["comment", "approve", "request_changes"]) {
    const request = reviewSubmissionRequest(verdict, "The summary", carried);
    assert.equal(reviewSubmissionRefusal({ ...open, request }), null);
    const publication = reviewSubmissionPublication(request);
    assert.deepEqual(publication, { action: "review", event: verdict, body: "The summary",
      comments: [{ path: "lib/a.ts", side: "additions", startLine: 4, endLine: 6, body: "Explain this" }] });
  }
  // A verdict on its own stays the shape the existing callers send.
  assert.deepEqual(reviewSubmissionPublication(reviewSubmissionRequest("approve", "", [])),
    { action: "review", event: "approve", body: "" });
});

test("a moved head or a moved base is reported before anything is submitted", () => {
  const moved = reviewSubmissionRevisionState(pinned, { headSha: "head-cccccccccc", baseSha: identity.baseSha });
  assert.equal(moved.kind, "moved");
  assert.equal(moved.head, true);
  assert.equal(moved.base, false);
  assert.match(moved.message, /head is now head-ccc/);
  assert.match(moved.message, /drafts are kept/);

  const rebased = reviewSubmissionRevisionState(pinned, { headSha: identity.headSha, baseSha: "base-dddddddddd" });
  assert.equal(rebased.kind, "moved");
  assert.equal(rebased.base, true);

  const request = reviewSubmissionRequest("approve", "Looks right", []);
  assert.equal(reviewSubmissionRefusal({ ...open, request, revision: moved }), moved.message);
  assert.equal(reviewSubmissionConfirmation({ identity, request, revision: moved, pinned }).warning, moved.message);
  assert.equal(reviewSubmissionRevisionState(pinned, pinned).kind, "current");
});

test("an unrecorded or uncheckable revision is not reported as unchanged", () => {
  assert.equal(reviewSubmissionRevisionState(pinned, null).kind, "unknown");
  // A draft carried forward from the revision-keyed store never knew its base.
  assert.equal(reviewSubmissionRevisionState({ headSha: identity.headSha, baseSha: "" }, pinned).kind, "unknown");
});

test("a verdict the account may not give, and an empty one, are refused with a reason", () => {
  const request = reviewSubmissionRequest("approve", "", []);
  assert.match(reviewSubmissionRefusal({ ...open, request, canApprove: false }), /cannot approve/);
  assert.equal(reviewSubmissionRefusal({ ...open, request, restriction: "Read-only here." }), "Read-only here.");
  assert.match(reviewSubmissionRefusal({ ...open, request: reviewSubmissionRequest("request_changes", " ", []) }), /Write a summary/);
  assert.match(reviewSubmissionRefusal({ ...open, request: reviewSubmissionRequest("comment", "", []) }), /summary or save a line comment/);
  // An approval needs nothing written, and a comment review rides on its comments.
  assert.equal(reviewSubmissionRefusal({ ...open, request }), null);
  assert.equal(reviewSubmissionRefusal({ ...open, request: reviewSubmissionRequest("comment", "", reviewSubmissionComments([inline()], pinned)) }), null);
});

test("only saved drafts on the revision being submitted are carried", () => {
  const drafts = [inline(), inline({ id: "typing", saved: false }), inline({ id: "unsure", uncertain: true }),
    inline({ id: "older", pinned: { headSha: "head-cccccccccc", baseSha: "" } }),
    { id: "reply", saved: true, updatedAt: "x", publication: { action: "reply", threadId: "t1", body: "hi" } }];
  assert.deepEqual(reviewSubmissionComments(drafts, pinned).map((draft) => draft.id), ["c1"]);
});

test("the confirmation names the account, the pull request, the revision and what travels", () => {
  const request = reviewSubmissionRequest("request_changes", "Please split this", reviewSubmissionComments([inline()], pinned));
  const confirmation = reviewSubmissionConfirmation({ identity, request, revision: { kind: "current" }, pinned });
  assert.equal(confirmation.title, "Submit review: Request changes");
  assert.match(confirmation.detail, /request changes with 1 line comment/);
  assert.match(confirmation.detail, /example\/project #7 as reviewer/);
  assert.match(confirmation.detail, /commit head-aaa.* against base base-bbb/);
  assert.equal(confirmation.warning, null);
});

test("only a confirmed publication clears drafts; a refusal and an unanswered write keep them", () => {
  assert.deepEqual(reviewSubmissionRetention({ kind: "confirmed", ids: ["1"] }),
    { retain: false, uncertain: false, message: "Review published to GitHub." });
  assert.deepEqual(reviewSubmissionRetention({ kind: "refused", message: "Not permitted." }),
    { retain: true, uncertain: false, message: "Not permitted." });
  assert.deepEqual(reviewSubmissionRetention({ kind: "uncertain", message: "Could not be confirmed." }),
    { retain: true, uncertain: true, message: "Could not be confirmed." });
});


test("a draft from an earlier head is kept and listed, never drawn on today's lines", () => {
  const drafts = [inline(), inline({ id: "older", pinned: { headSha: "head-cccccccccc", baseSha: "" } }),
    inline({ id: "legacy", pinned: undefined }),
    { id: "reply", saved: true, updatedAt: "x", publication: { action: "reply", threadId: "t1", body: "hi" } }];
  const placed = reviewPrDraftPlacement(drafts, pinned);
  assert.deepEqual(placed.onThisRevision.map((draft) => draft.id), ["c1", "legacy"]);
  assert.deepEqual(placed.onAnEarlierRevision.map((draft) => draft.id), ["older"]);
  assert.equal(reviewPrDraftRevisionLabel(placed.onAnEarlierRevision[0]), "Written against head-ccc");
  assert.equal(reviewPrDraftRevisionLabel(placed.onThisRevision[1]), "Written against an unrecorded revision");
});

test("a confirmed submission clears every comment it carried, and nothing edited since", () => {
  const first = inline();
  const second = inline({ id: "c2" });
  const carried = reviewSubmissionComments([first, second], pinned);
  assert.equal(carried.length, 2);
  // The second was edited while the write was in flight, so it is not the
  // object that went out and must survive.
  const edited = { ...second, updatedAt: "2026-09-15T01:00:00Z" };
  const remaining = acknowledgePrSubmission([first, edited], carried);
  assert.deepEqual(remaining.map((draft) => draft.id), ["c2"]);
  assert.equal(remaining[0].updatedAt, "2026-09-15T01:00:00Z");
});
