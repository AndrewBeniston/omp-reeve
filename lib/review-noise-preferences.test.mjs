import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_REVIEW_NOISE_PREFERENCES, reviewNoisePreferences } from "./review-noise-preferences.ts";
import { sanitizeReviewSelection } from "./review-selection.ts";

test("both settings are off until the human turns them on", () => {
  assert.deepEqual(DEFAULT_REVIEW_NOISE_PREFERENCES, { richPreview: false, hideGenerated: false });
  assert.deepEqual(reviewNoisePreferences(), DEFAULT_REVIEW_NOISE_PREFERENCES);
  assert.deepEqual(reviewNoisePreferences({}), DEFAULT_REVIEW_NOISE_PREFERENCES);
});

test("a tab stored before a setting existed restores on the default, not on undefined", () => {
  assert.deepEqual(reviewNoisePreferences({ richPreview: true }), { richPreview: true, hideGenerated: false });
  assert.deepEqual(reviewNoisePreferences({ hideGenerated: "yes", richPreview: 1 }), DEFAULT_REVIEW_NOISE_PREFERENCES);
});

test("both settings survive a restart, and a hand-edited file cannot smuggle a non-boolean in", () => {
  const stored = { kind: "uncommitted", comparisonBranch: "", comparisonLabel: "", commit: "" };
  const restored = sanitizeReviewSelection({ ...stored, noisePreferences: { richPreview: true, hideGenerated: true } });
  assert.deepEqual(restored.noisePreferences, { richPreview: true, hideGenerated: true });

  assert.deepEqual(sanitizeReviewSelection({ ...stored, noisePreferences: { richPreview: "on" } }).noisePreferences,
    DEFAULT_REVIEW_NOISE_PREFERENCES);
  // A tab written before either setting existed carries neither, and the
  // panel falls back to the defaults rather than to undefined.
  assert.equal(sanitizeReviewSelection(stored).noisePreferences, undefined);
  assert.equal(sanitizeReviewSelection({ ...stored, noisePreferences: [] }).noisePreferences, undefined);
});
