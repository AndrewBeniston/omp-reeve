import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { readSessionHistoryPage } = await jiti.import("./session-history.ts");
const { createSessionHistoryState, applySessionHistoryResult, sessionHistoryRequest } = await jiti.import("./session-history-state.ts");

function entry(id, parentId) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: { role: "user", content: id },
  };
}

test("returns the newest Session entries in order with a preceding cursor", () => {
  const entries = [entry("a", null), entry("b", "a"), entry("c", "b"), entry("d", "c")];
  const page = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "d", cursor: null, pageSize: 2 });

  assert.equal(page.ok, true);
  assert.equal(page.sessionId, "session-a");
  assert.deepEqual(page.entries.map((item) => item.id), ["c", "d"]);
  assert.equal(typeof page.nextCursor, "string");
  assert.equal(page.exhausted, false);
});

test("loads only preceding entries and reports exhaustion", () => {
  const entries = [entry("a", null), entry("b", "a"), entry("c", "b"), entry("d", "c")];
  const newest = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "d", cursor: null, pageSize: 2 });
  assert.equal(newest.ok, true);

  const earlier = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "d", cursor: newest.nextCursor, pageSize: 2 });
  assert.equal(earlier.ok, true);
  assert.deepEqual(earlier.entries.map((item) => item.id), ["a", "b"]);
  assert.equal(earlier.nextCursor, null);
  assert.equal(earlier.exhausted, true);
});

test("exhaustion prevents another history request", () => {
  const sessionEntries = [entry("a", null)];
  const finalPage = readSessionHistoryPage({ sessionId: "session-a", entries: sessionEntries, leafId: "a", cursor: null });
  const state = applySessionHistoryResult(createSessionHistoryState("session-a"), finalPage);

  assert.equal(state.exhausted, true);
  assert.equal(sessionHistoryRequest(state), null);
});

test("ignores a repeated page after the cursor advances", () => {
  const entries = [entry("a", null), entry("b", "a"), entry("c", "b"), entry("d", "c")];
  const newest = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "d", cursor: null, pageSize: 2 });
  let state = createSessionHistoryState("session-a");

  state = applySessionHistoryResult(state, newest);
  state = applySessionHistoryResult(state, newest);

  assert.deepEqual(state.entries.map((item) => item.id), ["c", "d"]);
  assert.equal(state.cursor, newest.nextCursor);
});

test("preserves the cursor after a typed failure, then accepts a retry", () => {
  const entries = [entry("a", null), entry("b", "a"), entry("c", "b")];
  const newest = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "c", cursor: null, pageSize: 1 });
  let state = applySessionHistoryResult(createSessionHistoryState("session-a"), newest);
  const retryCursor = state.cursor;

  state = applySessionHistoryResult(state, {
    ok: false,
    sessionId: "session-a",
    cursor: retryCursor,
    error: { code: "read_failed", message: "Could not read Session history", retryable: true },
  });
  assert.equal(state.cursor, retryCursor);
  assert.equal(state.failure?.code, "read_failed");

  const earlier = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "c", cursor: retryCursor, pageSize: 1 });
  state = applySessionHistoryResult(state, earlier);
  assert.deepEqual(state.entries.map((item) => item.id), ["b", "c"]);
  assert.equal(state.failure, null);
});

test("rejects a cursor from another Session and ignores its response", () => {
  const entries = [entry("a", null), entry("b", "a"), entry("c", "b")];
  const pageA = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "c", cursor: null, pageSize: 1 });
  assert.equal(pageA.ok, true);

  const mismatch = readSessionHistoryPage({ sessionId: "session-b", entries, leafId: "c", cursor: pageA.nextCursor, pageSize: 1 });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, "cursor_session_mismatch");
  assert.equal(mismatch.cursor, pageA.nextCursor);

  const stateB = createSessionHistoryState("session-b");
  assert.deepEqual(applySessionHistoryResult(stateB, pageA), stateB);
});

test("keeps the selected branch when a later entry changes the active leaf", () => {
  const entries = [entry("a", null), entry("b", "a"), entry("c", "b")];
  const newest = readSessionHistoryPage({ sessionId: "session-a", entries, leafId: "c", cursor: null, pageSize: 1 });
  assert.equal(newest.ok, true);

  const branched = [...entries, entry("other", "a")];
  const earlier = readSessionHistoryPage({ sessionId: "session-a", entries: branched, leafId: "other", cursor: newest.nextCursor, pageSize: 2 });
  assert.equal(earlier.ok, true);
  assert.deepEqual(earlier.entries.map((item) => item.id), ["a", "b"]);
});
