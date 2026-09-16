import assert from "node:assert/strict";
import test from "node:test";
import { resolveReviewMenuTargets } from "./desktop-review-menu.ts";

const listing = {
  targets: [{ id: "cursor", label: "Cursor", kind: "editor", hidden: false, available: true }],
  preferredTargetId: "cursor",
  mode: "editor",
};

test("the applications reach the menu when they arrive in the window", async () => {
  assert.deepEqual(await resolveReviewMenuTargets(Promise.resolve(listing), 50), { listing });
});

test("a listing slower than the window opens the menu without it", async () => {
  const slow = new Promise((resolve) => { setTimeout(() => resolve(listing), 300); });
  const started = Date.now();
  assert.equal(await resolveReviewMenuTargets(slow, 20), null);
  assert.ok(Date.now() - started < 200);
});

test("a listing that could not be read reads as no applications, not as waiting", async () => {
  assert.deepEqual(await resolveReviewMenuTargets(Promise.resolve(null), 50), { listing: null });
});
