import assert from "node:assert/strict";
import test from "node:test";
import { reviewPreviewRequestKey } from "./review-preview-client.ts";

const context = { tabId: "tab-1", owner: { projectRoot: "/p", worktreePath: "/p", sessionId: "s1" } };
const scope = { kind: "uncommitted" };
const key = (overrides = {}) => reviewPreviewRequestKey(
  overrides.context ?? context,
  overrides.scope ?? scope,
  overrides.path ?? "art/logo.png",
  "revision" in overrides ? overrides.revision : "abc",
);

test("a preview asked for twice at the same revision is the same request", () => {
  assert.equal(key(), key());
});

test("the revision moving is what makes it a different request", () => {
  // This is the regression: without the digest in the key, a file edited on
  // disk and picked up by a refresh kept the bytes fetched the first time.
  assert.notEqual(key(), key({ revision: "def" }));
  assert.notEqual(key(), key({ revision: undefined }));
});

test("owner, tab, scope and path each identify a different preview", () => {
  assert.notEqual(key(), key({ path: "art/other.png" }));
  assert.notEqual(key(), key({ scope: { kind: "staged" } }));
  assert.notEqual(key(), key({ context: { ...context, tabId: "tab-2" } }));
  // Two Sessions in one Worktree are two owners, and never share a preview.
  assert.notEqual(key(), key({ context: { ...context, owner: { ...context.owner, sessionId: "s2" } } }));
});
