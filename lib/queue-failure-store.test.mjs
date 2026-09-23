import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  sanitizeErrorSummary,
  readSessionQueueFailures,
  recordQueueFailure,
  removeQueueFailure,
  clearSessionQueueFailures,
} = await jiti.import("./queue-failure-store.ts");

test("sanitizeErrorSummary strips user home paths and authorization details", () => {
  const raw = new Error("Failed to connect to /Users/andrewbeniston/secret/key with Bearer abc12345");
  const safe = sanitizeErrorSummary(raw);
  assert.doesNotMatch(safe, /andrewbeniston/);
  assert.doesNotMatch(safe, /abc12345/);
  assert.ok(safe.length > 0);
  assert.ok(safe.length <= 200);
});

test("sanitizeErrorSummary provides fallback for empty error", () => {
  assert.equal(sanitizeErrorSummary(null), "This queued message could not be sent");
  assert.equal(sanitizeErrorSummary(""), "This queued message could not be sent");
});

test("records, reads, and deletes failed queue items for a session", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "reeve-queue-test-"));
  try {
    const failure = recordQueueFailure({
      id: "queue-item-1",
      sessionId: "session-alpha",
      kind: "followUp",
      text: "Draft message",
      position: 1,
      errorSummary: "Network timeout",
    }, tempDir);

    assert.equal(failure.id, "queue-item-1");
    assert.equal(failure.status, "failed");
    assert.equal(failure.position, 1);
    assert.equal(failure.errorSummary, "Network timeout");
    assert.ok(failure.failedAt);

    const stored = readSessionQueueFailures("session-alpha", tempDir);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, "queue-item-1");
    assert.equal(stored[0].text, "Draft message");
    assert.equal(stored[0].status, "failed");

    // Reading a different session returns empty array
    assert.deepEqual(readSessionQueueFailures("session-beta", tempDir), []);

    // Remove failure
    const removed = removeQueueFailure("session-alpha", "queue-item-1", tempDir);
    assert.equal(removed, true);
    assert.deepEqual(readSessionQueueFailures("session-alpha", tempDir), []);

    // Record and clear
    recordQueueFailure({
      id: "queue-item-2",
      sessionId: "session-alpha",
      kind: "steer",
      text: "Second failure",
      position: 0,
      errorSummary: "API error",
    }, tempDir);
    clearSessionQueueFailures("session-alpha", tempDir);
    assert.deepEqual(readSessionQueueFailures("session-alpha", tempDir), []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
