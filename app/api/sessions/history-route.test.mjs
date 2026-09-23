import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET } = await jiti.import("./[id]/history/route.ts");
const { cacheSessionPath, invalidateSessionPathCache } = await jiti.import("../../../lib/session-reader.ts");

function session(entries) {
  const manager = {
    getEntries: () => entries,
    getLeafId: () => entries.at(-1)?.id ?? null,
  };
  return { isAlive: () => true, inner: { sessionManager: manager } };
}

function entries(count) {
  return Array.from({ length: count }, (_, index) => ({
    type: "message",
    id: `entry-${index}`,
    parentId: index === 0 ? null : `entry-${index - 1}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: { role: "user", content: `message ${index}` },
  }));
}

async function request(id, cursor = null) {
  const url = new URL(`http://localhost/api/sessions/${id}/history`);
  if (cursor !== null) url.searchParams.set("cursor", cursor);
  const response = await GET(new Request(url, { headers: { host: "localhost" } }), {
    params: Promise.resolve({ id }),
  });
  return { response, body: await response.json() };
}

test("the history route pages entries for one Session", async (t) => {
  const previousRegistry = globalThis.__ompSessions;
  globalThis.__ompSessions = new Map([["session-a", session(entries(52))]]);
  t.after(() => { globalThis.__ompSessions = previousRegistry; });

  const newest = await request("session-a");
  assert.equal(newest.response.status, 200);
  assert.equal(newest.body.sessionId, "session-a");
  assert.equal(newest.body.entries.length, 50);
  assert.equal(newest.body.entries[0].id, "entry-2");
  assert.equal(newest.body.exhausted, false);

  const earlier = await request("session-a", newest.body.nextCursor);
  assert.equal(earlier.response.status, 200);
  assert.deepEqual(earlier.body.entries.map((entry) => entry.id), ["entry-0", "entry-1"]);
  assert.equal(earlier.body.exhausted, true);
  assert.equal(earlier.body.nextCursor, null);
});

test("the route preserves the cursor on a read failure and accepts a retry", async (t) => {
  const previousRegistry = globalThis.__ompSessions;
  const sessionEntries = entries(52);
  const currentSession = session(sessionEntries);
  globalThis.__ompSessions = new Map([["session-a", currentSession]]);
  t.after(() => { globalThis.__ompSessions = previousRegistry; });

  const newest = await request("session-a");
  const cursor = newest.body.nextCursor;
  currentSession.inner.sessionManager.getEntries = () => { throw new Error("private file path"); };

  const failed = await request("session-a", cursor);
  assert.equal(failed.response.status, 500);
  assert.deepEqual(failed.body, {
    ok: false,
    sessionId: "session-a",
    cursor,
    error: { code: "read_failed", message: "Could not read Session history", retryable: true },
  });

  currentSession.inner.sessionManager.getEntries = () => sessionEntries;
  const retried = await request("session-a", failed.body.cursor);
  assert.equal(retried.response.status, 200);
  assert.deepEqual(retried.body.entries.map((entry) => entry.id), ["entry-0", "entry-1"]);
});

test("the route rejects a cursor from another Session", async (t) => {
  const previousRegistry = globalThis.__ompSessions;
  globalThis.__ompSessions = new Map([
    ["session-a", session(entries(52))],
    ["session-b", session(entries(52))],
  ]);
  t.after(() => { globalThis.__ompSessions = previousRegistry; });

  const first = await request("session-a");
  const second = await request("session-b", first.body.nextCursor);
  assert.equal(second.response.status, 400);
  assert.equal(second.body.error.code, "cursor_session_mismatch");
  assert.equal(second.body.cursor, first.body.nextCursor);
  assert.equal(second.body.sessionId, "session-b");
});

test("the route reads a persisted Session without a live agent", async (t) => {
  const previousRegistry = globalThis.__ompSessions;
  globalThis.__ompSessions = new Map();
  const dir = mkdtempSync(join(tmpdir(), "reeve-history-route-"));
  const filePath = join(dir, "session.jsonl");
  const id = "persisted-history-session";
  const content = [
    { type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd: dir },
    ...entries(52),
  ].map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(filePath, content);
  cacheSessionPath(id, filePath);
  t.after(() => {
    invalidateSessionPathCache(id);
    globalThis.__ompSessions = previousRegistry;
    rmSync(dir, { recursive: true, force: true });
  });

  const newest = await request(id);
  assert.equal(newest.response.status, 200);
  assert.equal(newest.body.entries.length, 50);
  const earlier = await request(id, newest.body.nextCursor);
  assert.equal(earlier.response.status, 200);
  assert.deepEqual(earlier.body.entries.map((item) => item.id), ["entry-0", "entry-1"]);
});
