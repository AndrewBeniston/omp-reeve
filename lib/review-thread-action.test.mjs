import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { threadActionRecords, outstandingThreadAction } = await jiti.import("./review-thread-action.ts");

/** A comment somebody is still writing, which no thread action may disturb. */
const draft = {
  id: "draft", updatedAt: "2026-09-15T10:00:00Z", saved: true,
  publication: { action: "reply", threadId: "T1", body: "still writing this" },
};
/** The record a thread action writes immediately before it dispatches. */
const record = {
  id: "record", updatedAt: "2026-09-15T11:00:00Z", saved: true, uncertain: true,
  publication: { action: "resolve", threadId: "T1" },
};
const after = (result) => threadActionRecords([draft, record], record, result);

test("a confirmed thread action clears its own record and nothing else", () => {
  assert.deepEqual(after({ kind: "confirmed", ids: [] }), [draft]);
});

test("a refusal the host stated leaves nothing to retry", () => {
  // Nothing was written, so the record guarding against a second attempt has
  // nothing left to guard.
  assert.deepEqual(after({ kind: "refused", message: "not permitted" }), [draft]);
});

test("an answer that never arrived keeps the record, so nothing is sent blind", () => {
  assert.deepEqual(after({ kind: "uncertain", message: "unconfirmed" }), [draft, record]);
});

test("a draft written beside a thread action is never published or cleared by one", () => {
  for (const result of [
    { kind: "confirmed", ids: [] },
    { kind: "refused", message: "no" },
    { kind: "uncertain", message: "unknown" },
  ]) {
    const remaining = after(result);
    const kept = remaining.find((entry) => entry.id === "draft");
    assert.deepEqual(kept, draft, "a thread action changed a draft it does not own");
  }
});

test("a record edited after dispatch is not cleared by the answer to the old one", () => {
  const changed = { ...record, updatedAt: "2026-09-15T11:05:00Z" };
  assert.deepEqual(
    threadActionRecords([changed], record, { kind: "confirmed", ids: [] }),
    [changed],
  );
});

/*
 * Found by hand, against the fake host, on an unresolve nobody could confirm.
 *
 * The record was there and said so, and its own Publish button was disabled —
 * but the Unresolve button on the thread itself was still live, and pressing
 * it made a second record with a second identifier and sent the same mutation
 * again. The guard guarded the record and not the action.
 */
test("nothing aimed at a thread is offered again while a write to it is unconfirmed", () => {
  const pending = [record];
  for (const publication of [
    { action: "unresolve", threadId: "T1" },
    { action: "resolve", threadId: "T1" },
    { action: "reply", threadId: "T1", body: "another go" },
  ]) {
    assert.equal(outstandingThreadAction(pending, publication)?.id, "record",
      `${publication.action} was offered while a write to its thread was unconfirmed`);
  }
});

test("a comment with an unconfirmed write is left alone, however it is approached", () => {
  const pending = [{ ...record, id: "sent", publication: { action: "delete", commentId: "C1" }, uncertain: true }];
  assert.equal(outstandingThreadAction(pending, { action: "delete", commentId: "C1" })?.id, "sent");
  assert.equal(outstandingThreadAction(pending, { action: "edit", commentId: "C1", body: "x" })?.id, "sent");
});

test("the guard reaches only what the unconfirmed write was aimed at", () => {
  const pending = [record];
  assert.equal(outstandingThreadAction(pending, { action: "resolve", threadId: "T2" }), null);
  assert.equal(outstandingThreadAction(pending, { action: "delete", commentId: "C1" }), null);
  // A draft nobody has sent is not a guard. Only a write that may have landed is.
  assert.equal(outstandingThreadAction([draft], { action: "reply", threadId: "T1", body: "hi" }), null);
});

test("a submission is not a thread action and is never held by one", () => {
  const pending = [record];
  assert.equal(outstandingThreadAction(pending, { action: "review", event: "comment", body: "ship it" }), null);
  assert.equal(outstandingThreadAction(pending,
    { action: "inline", path: "a.ts", side: "additions", startLine: 1, endLine: 1, body: "here" }), null);
});
