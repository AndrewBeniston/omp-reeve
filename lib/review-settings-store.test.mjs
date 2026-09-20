import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_REVIEW_SETTINGS } from "./review-settings.ts";
import {
  REVIEW_CREDITS_PATH,
  REVIEW_SETTINGS_FIELDS,
  REVIEW_SETTING_PATHS,
  applyReviewSetting,
  readReviewSettings,
  writeReviewSettings,
} from "./review-settings-store.ts";

function fakeStorage(initial = {}) {
  const values = { ...initial };
  return { getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; }, values };
}

test("every preference has a field, and every field has a translated label", () => {
  const paths = REVIEW_SETTINGS_FIELDS.map((field) => field.path);
  for (const path of Object.values(REVIEW_SETTING_PATHS)) assert.ok(paths.includes(path), path);
  for (const field of REVIEW_SETTINGS_FIELDS) {
    assert.equal(field.owner, "browser");
    assert.match(field.label, /^settings\.review\./);
    assert.match(field.description, /^settings\.review\./);
    if (field.type === "select") assert.ok(field.options?.every((option) => option.label && !option.label.includes(".")));
  }
});

test("the credit row is shown, stated as unavailable, and stores nothing", () => {
  const credits = REVIEW_SETTINGS_FIELDS.find((field) => field.path === REVIEW_CREDITS_PATH);
  assert.equal(credits?.readOnly, true);
  // It is not one of the preferences, so a write against it changes nothing.
  assert.equal(Object.values(REVIEW_SETTING_PATHS).includes(REVIEW_CREDITS_PATH), false);
  assert.deepEqual(applyReviewSetting(DEFAULT_REVIEW_SETTINGS, REVIEW_CREDITS_PATH, true), DEFAULT_REVIEW_SETTINGS);
});

test("a preference round-trips, and a stored value outside the shape is refused", () => {
  const store = fakeStorage();
  const next = applyReviewSetting(DEFAULT_REVIEW_SETTINGS, REVIEW_SETTING_PATHS.reviewTrigger, "push");
  writeReviewSettings(next, store);
  assert.equal(readReviewSettings(store).reviewTrigger, "push");
  // A value no trigger uses falls back rather than being stored as itself.
  assert.equal(applyReviewSetting(next, REVIEW_SETTING_PATHS.reviewTrigger, "whenever").reviewTrigger, DEFAULT_REVIEW_SETTINGS.reviewTrigger);
});

test("no store, and an unreadable store, both read as the shipped defaults", () => {
  assert.deepEqual(readReviewSettings(null), DEFAULT_REVIEW_SETTINGS);
  assert.deepEqual(readReviewSettings(fakeStorage({ "reeve-review-settings": "{" })), DEFAULT_REVIEW_SETTINGS);
  // Which means opening the surface with nothing stored arms nothing.
  assert.equal(readReviewSettings(fakeStorage()).automaticReview, false);
});
