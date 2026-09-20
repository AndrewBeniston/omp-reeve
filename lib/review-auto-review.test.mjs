import assert from "node:assert/strict";
import test from "node:test";
import { automaticReviewRequest, automaticReviewsFor } from "./review-auto-review.ts";
import { reviewSettings } from "./review-settings.ts";

const armed = (overrides) => reviewSettings({ automaticReview: true, ...overrides });

test("nothing follows a push or a publish until the human arms it", () => {
  const off = reviewSettings(null);
  assert.deepEqual(automaticReviewsFor(off, "push"), { code: false, security: false });
  assert.deepEqual(automaticReviewsFor(off, "publish"), { code: false, security: false });
});

test("a review follows only the act it was armed for", () => {
  const onPush = armed({ reviewTrigger: "push" });
  assert.equal(automaticReviewsFor(onPush, "push").code, true);
  assert.equal(automaticReviewsFor(onPush, "publish").code, false);
  const onPublish = armed({ reviewTrigger: "publish" });
  assert.equal(automaticReviewsFor(onPublish, "publish").code, true);
  assert.equal(automaticReviewsFor(onPublish, "push").code, false);
});

test("the smart trigger stays inside a review the human started", () => {
  const smart = armed({ reviewTrigger: "smart" });
  assert.equal(automaticReviewsFor(smart, "push").code, false);
  assert.equal(automaticReviewsFor(smart, "push", { withinUserStartedReview: true }).code, false);
});

test("a security review riding on a code review fires only when one does", () => {
  const riding = armed({
    reviewTrigger: "push",
    automaticSecurityReview: true,
    securityTrigger: "with-code-review",
  });
  assert.deepEqual(automaticReviewsFor(riding, "push"), { code: true, security: true });
  assert.deepEqual(automaticReviewsFor(riding, "publish"), { code: false, security: false });
});

test("a security review with its own trigger does not need a code review", () => {
  const alone = reviewSettings({
    automaticReview: false,
    automaticSecurityReview: true,
    securityTrigger: "publish",
  });
  assert.deepEqual(automaticReviewsFor(alone, "publish"), { code: false, security: true });
  assert.deepEqual(automaticReviewsFor(alone, "push"), { code: false, security: false });
});

test("an unarmed preference composes no request at all", () => {
  const scope = { kind: "uncommitted", comparisonBranch: null };
  assert.equal(automaticReviewRequest(reviewSettings(null), "push", scope), null);
  assert.equal(automaticReviewRequest(reviewSettings(null), "publish", scope), null);
});

test("a push review asks about what the panel is scoped to", () => {
  const settings = armed({ reviewTrigger: "push" });
  assert.deepEqual(automaticReviewRequest(settings, "push", { kind: "uncommitted", comparisonBranch: null }), {
    mode: "uncommitted", base: null, message: "", origin: "automatic", security: false,
  });
  assert.deepEqual(automaticReviewRequest(settings, "push", { kind: "branch", comparisonBranch: "main" }), {
    mode: "branch", base: "main", message: "", origin: "automatic", security: false,
  });
});

test("a publish review is pinned to the base the branch was published into", () => {
  const settings = armed({ reviewTrigger: "publish" });
  assert.deepEqual(
    automaticReviewRequest(settings, "publish", { kind: "uncommitted", comparisonBranch: null, publishedBase: "main" }),
    { mode: "branch", base: "main", message: "", origin: "automatic", security: false },
  );
  // The published base wins over whatever the panel happens to be comparing.
  assert.equal(
    automaticReviewRequest(settings, "publish", { kind: "branch", comparisonBranch: "develop", publishedBase: "main" }).base,
    "main",
  );
  // Without one, it falls back to the panel rather than inventing a base.
  assert.deepEqual(
    automaticReviewRequest(settings, "publish", { kind: "uncommitted", comparisonBranch: null, publishedBase: "  " }),
    { mode: "uncommitted", base: null, message: "", origin: "automatic", security: false },
  );
});

test("the security pass rides on the same request rather than a second turn", () => {
  const riding = armed({
    reviewTrigger: "publish",
    automaticSecurityReview: true,
    securityTrigger: "with-code-review",
  });
  const request = automaticReviewRequest(riding, "publish", { kind: "uncommitted", comparisonBranch: null, publishedBase: "main" });
  assert.deepEqual(request, { mode: "branch", base: "main", message: "", origin: "automatic", security: true });
});

test("a security preference armed on its own still carries its pass", () => {
  const alone = reviewSettings({
    automaticReview: false,
    automaticSecurityReview: true,
    securityTrigger: "push",
  });
  const request = automaticReviewRequest(alone, "push", { kind: "uncommitted", comparisonBranch: null });
  assert.equal(request.security, true);
  assert.equal(request.origin, "automatic");
});
