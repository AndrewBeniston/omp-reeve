import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_REVIEW_SETTINGS,
  reviewSettings,
  severityFloorFor,
  shouldStartAutomaticReview,
  shouldStartAutomaticSecurityReview,
} from "./review-settings.ts";

test("every automatic review preference ships off", () => {
  assert.equal(DEFAULT_REVIEW_SETTINGS.automaticReview, false);
  assert.equal(DEFAULT_REVIEW_SETTINGS.automaticSecurityReview, false);
  assert.equal(DEFAULT_REVIEW_SETTINGS.exhaustiveReview, false);
  // Opening Review or reading a stored preference cannot arm anything.
  assert.deepEqual(reviewSettings(), DEFAULT_REVIEW_SETTINGS);
  assert.deepEqual(reviewSettings({ automaticReview: "yes" }), DEFAULT_REVIEW_SETTINGS);
});

test("a trigger only fires the action it was armed for", () => {
  const armed = reviewSettings({ automaticReview: true, reviewTrigger: "push" });
  assert.equal(shouldStartAutomaticReview(armed, { trigger: "push", withinUserStartedReview: false }), true);
  assert.equal(shouldStartAutomaticReview(armed, { trigger: "publish", withinUserStartedReview: false }), false);
  // Off is off, whatever just happened.
  assert.equal(shouldStartAutomaticReview(reviewSettings({ reviewTrigger: "push" }), { trigger: "push", withinUserStartedReview: false }), false);
});

test("the smart trigger never fires outside a review the human started", () => {
  const smart = reviewSettings({ automaticReview: true, reviewTrigger: "smart" });
  assert.equal(shouldStartAutomaticReview(smart, { trigger: "smart", withinUserStartedReview: false }), false);
  assert.equal(shouldStartAutomaticReview(smart, { trigger: "smart", withinUserStartedReview: true }), true);
  const smartSecurity = reviewSettings({ automaticSecurityReview: true, securityTrigger: "smart" });
  assert.equal(shouldStartAutomaticSecurityReview(smartSecurity, { trigger: "smart", withinUserStartedReview: false }), false);
});

test("a security review may ride on the code review that was asked for", () => {
  const settings = reviewSettings({ automaticSecurityReview: true });
  assert.equal(settings.securityTrigger, "with-code-review");
  assert.equal(shouldStartAutomaticSecurityReview(settings, { trigger: "with-code-review", withinUserStartedReview: true }), true);
  assert.equal(shouldStartAutomaticSecurityReview(settings, { trigger: "push", withinUserStartedReview: false }), false);
});

test("both severity floors are kept, each for the reviews it governs", () => {
  const settings = reviewSettings({ automaticSeverityFloor: "high", requestedSeverityFloor: "medium" });
  assert.equal(severityFloorFor(settings, "automatic"), "high");
  assert.equal(severityFloorFor(settings, "requested"), "medium");
});

test("the credit allowance is not a preference here", () => {
  // The row that says so lives with the fields; nothing about it is stored,
  // because there is nothing behind it to store.
  assert.equal("credits" in DEFAULT_REVIEW_SETTINGS, false);
});
