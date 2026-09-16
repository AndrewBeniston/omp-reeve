import assert from "node:assert/strict";
import test from "node:test";
import {
  EXTERNAL_EDITOR_RETENTION_MS,
  forgetExternalEditorListings,
  requestExternalEditors,
} from "./external-editor-listing-cache.ts";
import { resolveReviewMenuTargets } from "./desktop-review-menu.ts";

const listing = {
  targets: [{ id: "cursor", label: "Cursor", kind: "editor", hidden: false, available: true }],
  preferredTargetId: "cursor",
  mode: "editor",
};

const slowFetcher = (delayMs, calls) => (filePath) => {
  calls.push(filePath);
  return new Promise((resolve) => { setTimeout(() => resolve(listing), delayMs); });
};

test("a slow listing misses its own menu and serves the next one", async () => {
  forgetExternalEditorListings();
  const calls = [];
  const fetcher = slowFetcher(120, calls);

  // The first menu opens before the server answers, and says it is looking.
  const first = requestExternalEditors("/repo/a.ts", fetcher);
  assert.equal(await resolveReviewMenuTargets(first, 10), null);

  // The request still runs, so the answer is in hand for the next menu.
  assert.deepEqual(await first, listing);
  const second = requestExternalEditors("/repo/a.ts", fetcher);
  assert.deepEqual(await resolveReviewMenuTargets(second, 10), { listing });
  assert.deepEqual(calls, ["/repo/a.ts"]);
});

test("two menus during one request share it", async () => {
  forgetExternalEditorListings();
  const calls = [];
  const fetcher = slowFetcher(20, calls);
  const [one, two] = await Promise.all([
    requestExternalEditors("/repo/b.ts", fetcher),
    requestExternalEditors("/repo/b.ts", fetcher),
  ]);
  assert.deepEqual(one, listing);
  assert.deepEqual(two, listing);
  assert.deepEqual(calls, ["/repo/b.ts"]);
});

test("a listing that could not be read is asked for again", async () => {
  forgetExternalEditorListings();
  const calls = [];
  const fetcher = (filePath) => { calls.push(filePath); return Promise.resolve(null); };
  assert.equal(await requestExternalEditors("/repo/c.ts", fetcher), null);
  assert.equal(await requestExternalEditors("/repo/c.ts", fetcher), null);
  assert.deepEqual(calls, ["/repo/c.ts", "/repo/c.ts"]);
});

test("a listing is asked for again once it is old, and each file is kept apart", async () => {
  forgetExternalEditorListings();
  const calls = [];
  const fetcher = (filePath) => { calls.push(filePath); return Promise.resolve(listing); };
  await requestExternalEditors("/repo/d.ts", fetcher, 1_000);
  await requestExternalEditors("/repo/d.ts", fetcher, 1_000 + EXTERNAL_EDITOR_RETENTION_MS - 1);
  await requestExternalEditors("/repo/d.ts", fetcher, 1_000 + EXTERNAL_EDITOR_RETENTION_MS);
  await requestExternalEditors("/repo/e.ts", fetcher, 1_000);
  assert.deepEqual(calls, ["/repo/d.ts", "/repo/d.ts", "/repo/e.ts"]);
});
