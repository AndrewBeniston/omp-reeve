import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_REVIEW_DISPLAY_PREFERENCES, reviewDisplayPreferences } from "./review-display-preferences.ts";
import { sanitizeReviewSelection } from "./review-selection.ts";

test("the shipped defaults are the ones R4 read from the reference", () => {
  assert.equal(DEFAULT_REVIEW_DISPLAY_PREFERENCES.hideWhitespace, false, "whitespace is shown until it is hidden");
  assert.equal(DEFAULT_REVIEW_DISPLAY_PREFERENCES.wordDiffs, false);
  assert.equal(DEFAULT_REVIEW_DISPLAY_PREFERENCES.loadFullFiles, true);
});

test("a tab stored before a preference existed restores on that preference's default", () => {
  const stored = { expanded: false, wordDiffs: true, loadFullFiles: false };
  assert.deepEqual(reviewDisplayPreferences(stored), {
    expanded: false, wordDiffs: true, loadFullFiles: false, hideWhitespace: false,
  });
});

test("a value that is not a boolean never becomes one", () => {
  const resolved = reviewDisplayPreferences({ hideWhitespace: "yes", loadFullFiles: 1, wordDiffs: null });
  assert.equal(resolved.hideWhitespace, false);
  assert.equal(resolved.loadFullFiles, true);
  assert.equal(resolved.wordDiffs, false);
});

test("a restored selection carries every preference the diff reads", () => {
  const selection = sanitizeReviewSelection({
    kind: "uncommitted",
    displayPreferences: { wordDiffs: true, hideWhitespace: true, unknownKey: "ignored" },
  });
  assert.deepEqual(selection.displayPreferences, {
    expanded: true, wordDiffs: true, loadFullFiles: true, hideWhitespace: true,
  });
});
