import assert from "node:assert/strict";
import test from "node:test";
import { reviewComposerDelivery } from "./review-dispatch.ts";
import { reviewSettings } from "./review-settings.ts";
import {
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
const HUMAN_REQUEST = { mode: "uncommitted", base: null, message: "" };

test("a human-asked review the composer refuses is kept as a draft", () => {
  const delivery = reviewComposerDelivery(HUMAN_REQUEST, "busy");
  assert.equal(delivery.insertPrompt, true);
  assert.equal(delivery.outcome.kind, "error");
});

test("an automatic review the composer refuses writes nothing and defers", () => {
  const request = smartReviewRequest(smart, { kind: "uncommitted", comparisonBranch: null });
  const delivery = reviewComposerDelivery(request, "busy");
  assert.equal(delivery.insertPrompt, false);
  assert.equal(delivery.outcome.deferred, true);
});

test("an automatic review that cannot reach a composer does not ask again", () => {
  const request = smartReviewRequest(smart, { kind: "uncommitted", comparisonBranch: null });
  for (const submit of ["ignored", "unavailable"]) {
    const delivery = reviewComposerDelivery(request, submit);
    assert.equal(delivery.insertPrompt, false);
    assert.notEqual(delivery.outcome.deferred, true);
  }
});

/**
 * The live failure, as the two modules see it: the panel reads the Session as
 * idle, the composer still reads it as busy, and the follow-up must survive
 * that disagreement without touching the composer.
 */
test("busy then ready: one accepted review, no draft written, one follow-up spent", () => {
  const answers = ["busy", "busy", "sent"];
  let state = noteSmartReviewChange(armSmartReview(smart, "digest-a"), { fingerprint: "digest-b" });
  let asks = 0;
  let accepted = 0;
  let drafted = 0;

  for (let round = 0; round < 10 && smartReviewDue(state, quiet); round += 1) {
    const request = smartReviewRequest(smart, { kind: "uncommitted", comparisonBranch: null });
    const delivery = reviewComposerDelivery(request, answers[asks] ?? "sent");
    asks += 1;
    if (delivery.insertPrompt) drafted += 1;
    if (delivery.outcome.kind === "delivered") {
      accepted += 1;
      state = consumeSmartReview(state, { fingerprint: "digest-b" });
      break;
    }
    state = delivery.outcome.deferred === true ? deferSmartReview(state) : { ...state, armed: false };
  }

  assert.equal(asks, 3);
  assert.equal(accepted, 1);
  // The composer belongs to the human. The refused asks left it untouched.
  assert.equal(drafted, 0);
  // Exactly one follow-up was spent, by the review that actually started.
  assert.equal(state.followUpsLeft, SMART_REVIEW_FOLLOW_UP_LIMIT - 1);
});
