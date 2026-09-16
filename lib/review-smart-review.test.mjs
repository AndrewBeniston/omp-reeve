import assert from "node:assert/strict";
import test from "node:test";
import { reviewSettings } from "./review-settings.ts";
import {
  IDLE_SMART_REVIEW,
  SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT,
  SMART_REVIEW_FOLLOW_UP_LIMIT,
  armSmartReview,
  consumeSmartReview,
  deferSmartReview,
  noteSmartReviewChange,
  smartReviewDue,
  smartReviewRequest,
} from "./review-smart-review.ts";

const smart = reviewSettings({ automaticReview: true, reviewTrigger: "smart" });
const quiet = {
  sessionRunning: false,
  panelVisible: true,
  scopeReviewable: true,
  resultReady: true,
  requestBusy: false,
};
const REVIEWED = "digest-a";
const CHANGED = "digest-b";

function armedWithChange(settings = smart) {
  return noteSmartReviewChange(armSmartReview(settings, REVIEWED), { fingerprint: CHANGED });
}

test("nothing is armed until the human arms it and starts a review", () => {
  // Off by default, and off when the trigger is any other one.
  assert.deepEqual(armSmartReview(reviewSettings(), REVIEWED), IDLE_SMART_REVIEW);
  assert.deepEqual(armSmartReview(reviewSettings({ automaticReview: true, reviewTrigger: "push" }), REVIEWED), IDLE_SMART_REVIEW);
  assert.equal(armSmartReview(smart, REVIEWED).armed, true);
  // An unarmed trigger ignores every change, so nothing can ever be due.
  assert.equal(smartReviewDue(noteSmartReviewChange(IDLE_SMART_REVIEW, { fingerprint: CHANGED }), quiet), false);
});

test("a change during the review is queued, not dropped, whoever made it", () => {
  // The Session is working, which says nothing about who edited the file.
  const queued = noteSmartReviewChange(armSmartReview(smart, REVIEWED), { fingerprint: CHANGED });
  assert.equal(queued.pendingChange, true);
  assert.equal(smartReviewDue(queued, { ...quiet, sessionRunning: true }), false);
  // It survives the run and becomes due once the Session settles.
  assert.equal(smartReviewDue(queued, quiet), true);
});

test("content that matches the last review is not a change", () => {
  const armed = armSmartReview(smart, REVIEWED);
  assert.equal(noteSmartReviewChange(armed, { fingerprint: REVIEWED }).pendingChange, false);
  // And after a follow-up, its own content stops being a reason to run again.
  const after = consumeSmartReview(armedWithChange(), { fingerprint: CHANGED });
  assert.equal(noteSmartReviewChange(after, { fingerprint: CHANGED }).pendingChange, false);
  assert.equal(noteSmartReviewChange(after, { fingerprint: "digest-c" }).pendingChange, true);
});

test("a burst of changes is one follow-up, and it waits for the turn to settle", () => {
  let state = armSmartReview(smart, REVIEWED);
  for (const fingerprint of ["b", "c", "d", "e", "f"]) state = noteSmartReviewChange(state, { fingerprint });
  assert.equal(smartReviewDue(state, { ...quiet, sessionRunning: true }), false);
  assert.equal(smartReviewDue(state, quiet), true);
  assert.equal(consumeSmartReview(state, { fingerprint: "f" }).pendingChange, false);
});

test("every condition is required, and an unknown run state is not idle", () => {
  const ready = armedWithChange();
  assert.equal(smartReviewDue(ready, quiet), true);
  // Nobody has said whether the Session is working: that must not read as quiet.
  assert.equal(smartReviewDue(ready, { ...quiet, sessionRunning: null }), false);
  assert.equal(smartReviewDue(ready, { ...quiet, panelVisible: false }), false);
  // A pull request or a fixed commit is not what an uncommitted review is about.
  assert.equal(smartReviewDue(ready, { ...quiet, scopeReviewable: false }), false);
  assert.equal(smartReviewDue(ready, { ...quiet, resultReady: false }), false);
  assert.equal(smartReviewDue(ready, { ...quiet, requestBusy: true }), false);
});

test("the trigger stops itself after a fixed number of follow-ups", () => {
  assert.equal(SMART_REVIEW_FOLLOW_UP_LIMIT, 2);
  let state = armedWithChange();
  let fired = 0;
  for (let round = 0; round < 10; round += 1) {
    if (!smartReviewDue(state, quiet)) break;
    fired += 1;
    // Each review changes the files again, which is the loop the bound stops.
    const fingerprint = `digest-${round}`;
    state = noteSmartReviewChange(consumeSmartReview(state, { fingerprint }), { fingerprint: `${fingerprint}-after` });
  }
  assert.equal(fired, SMART_REVIEW_FOLLOW_UP_LIMIT);
  assert.deepEqual(state, IDLE_SMART_REVIEW);
});

test("a follow-up asks about what the panel shows, as an automatic review", () => {
  assert.equal(smartReviewRequest(reviewSettings(), { kind: "uncommitted", comparisonBranch: null }), null);
  assert.deepEqual(smartReviewRequest(smart, { kind: "uncommitted", comparisonBranch: null }), {
    mode: "uncommitted", base: null, message: "", origin: "automatic", security: false,
  });
  assert.equal(smartReviewRequest(smart, { kind: "branch", comparisonBranch: "main" }).base, "main");
  // An armed security preference rides in the same turn.
  const withSecurity = reviewSettings({ automaticReview: true, reviewTrigger: "smart", automaticSecurityReview: true, securityTrigger: "smart" });
  assert.equal(smartReviewRequest(withSecurity, { kind: "uncommitted", comparisonBranch: null }).security, true);
});

test("a refused follow-up spends no allowance and is still due", () => {
  const refused = deferSmartReview(armedWithChange());
  // The composer reviewed nothing, so both the follow-up and the change stay.
  assert.equal(refused.followUpsLeft, SMART_REVIEW_FOLLOW_UP_LIMIT);
  assert.equal(refused.pendingChange, true);
  assert.equal(refused.attemptsLeft, SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT - 1);
  assert.equal(smartReviewDue(refused, quiet), true);
});

test("the asks are bounded, so a composer that never accepts stops the trigger", () => {
  let state = armedWithChange();
  let asks = 0;
  for (let round = 0; round < 10; round += 1) {
    if (!smartReviewDue(state, quiet)) break;
    asks += 1;
    state = deferSmartReview(state);
  }
  assert.equal(asks, SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT);
  assert.deepEqual(state, IDLE_SMART_REVIEW);
});

test("an accepted follow-up restores the asks for the next one", () => {
  // Refused once, then accepted: the second follow-up gets a whole allowance.
  const refused = deferSmartReview(armedWithChange());
  const accepted = consumeSmartReview(refused, { fingerprint: CHANGED });
  assert.equal(accepted.followUpsLeft, SMART_REVIEW_FOLLOW_UP_LIMIT - 1);
  assert.equal(accepted.attemptsLeft, SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT);
});

test("refusals never widen the bound of two after a manual arm", () => {
  let state = armedWithChange();
  let reviews = 0;
  for (let round = 0; round < 20; round += 1) {
    if (!smartReviewDue(state, quiet)) break;
    // Every follow-up is refused once before it is accepted.
    state = deferSmartReview(state);
    if (!smartReviewDue(state, quiet)) break;
    reviews += 1;
    const fingerprint = `digest-${round}`;
    state = noteSmartReviewChange(consumeSmartReview(state, { fingerprint }), { fingerprint: `${fingerprint}-after` });
  }
  assert.equal(reviews, SMART_REVIEW_FOLLOW_UP_LIMIT);
  assert.deepEqual(state, IDLE_SMART_REVIEW);
});
