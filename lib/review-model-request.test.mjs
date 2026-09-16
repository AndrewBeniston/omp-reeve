import assert from "node:assert/strict";
import test from "node:test";
import { composeReviewRequest } from "./review-model-request.ts";
import { EXHAUSTIVE_REVIEW_PASS_LIMIT, reviewSettings } from "./review-settings.ts";

const settings = reviewSettings();

test("an uncommitted review names the three states it covers", () => {
  const request = composeReviewRequest({ mode: { kind: "uncommitted" }, settings });
  assert.match(request.prompt, /staged, unstaged and untracked/);
  assert.deepEqual(request.filter, { kind: "uncommitted" });
  assert.equal(request.delivery, "current-chat");
});

test("a branch review pins to the merge base and carries it in the filter", () => {
  const mergeBase = "c".repeat(40);
  const request = composeReviewRequest({ mode: { kind: "branch", base: "main", mergeBase }, settings });
  assert.match(request.prompt, new RegExp(mergeBase));
  // The base is named as the comparison, and the merge base as what to diff
  // against, so commits that landed on the base afterwards stay out of it.
  assert.match(request.prompt, /against main/);
  assert.deepEqual(request.filter, { kind: "branch", base: "main", mergeBase });
});

test("the human's message is last, so it reads as their instruction", () => {
  const request = composeReviewRequest({ mode: { kind: "uncommitted" }, message: "  focus on the SSE path  ", settings });
  assert.ok(request.prompt.endsWith("focus on the SSE path"));
  // A message never replaces the scope it was asked about.
  assert.match(request.prompt, /staged, unstaged and untracked/);
});

test("exhaustive review is bounded, and off by default", () => {
  assert.doesNotMatch(composeReviewRequest({ mode: { kind: "uncommitted" }, settings }).prompt, /exhaustively/);
  const exhaustive = composeReviewRequest({ mode: { kind: "uncommitted" }, settings: reviewSettings({ exhaustiveReview: true }) });
  assert.match(exhaustive.prompt, new RegExp(`at most ${EXHAUSTIVE_REVIEW_PASS_LIMIT} passes`));
});

test("the severity floor follows who asked, and reaches the prompt", () => {
  const stored = reviewSettings({ automaticSeverityFloor: "critical", requestedSeverityFloor: "medium" });
  const requested = composeReviewRequest({ mode: { kind: "uncommitted" }, settings: stored });
  assert.equal(requested.severityFloor, "medium");
  assert.match(requested.prompt, /medium severity and above/);
  const automatic = composeReviewRequest({ mode: { kind: "uncommitted" }, origin: "automatic", settings: stored });
  assert.equal(automatic.severityFloor, "critical");
  assert.match(automatic.prompt, /only critical/);
});

test("every finding is asked for with its severity, whatever the floor", () => {
  // The floor decides what is reported; the label is what makes a report
  // readable at a glance, and is the same ask at every floor.
  for (const floor of ["critical", "low"]) {
    const request = composeReviewRequest({
      mode: { kind: "uncommitted" },
      settings: reviewSettings({ requestedSeverityFloor: floor }),
    });
    assert.match(request.prompt, /Label each finding with its severity as critical, high, medium or low/);
  }
});

test("the security pass is included only when it was asked for", () => {
  assert.doesNotMatch(composeReviewRequest({ mode: { kind: "uncommitted" }, settings }).prompt, /security pass/);
  assert.match(composeReviewRequest({ mode: { kind: "uncommitted" }, security: true, settings }).prompt, /security pass/);
});
