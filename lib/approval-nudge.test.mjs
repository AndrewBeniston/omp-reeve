import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVAL_NUDGE_THRESHOLD,
  acceptApprovalNudge,
  approvalNudgeState,
  approvalNudgeVisible,
  clearApprovalNudge,
  dismissApprovalNudge,
  readApprovalNudgeState,
  recordManualApproval,
  writeApprovalNudgeState,
} from "./approval-nudge.ts";

const pending = { sessionId: "s1", approvalMode: "always-ask", hasPendingApproval: true };

function afterApprovals(count, sessionId = "s1") {
  let state = approvalNudgeState();
  for (let index = 0; index < count; index += 1) state = recordManualApproval(state, sessionId);
  return state;
}

test("the offer appears on the third manual approval, not before", () => {
  assert.equal(APPROVAL_NUDGE_THRESHOLD, 3);
  assert.equal(approvalNudgeVisible(afterApprovals(2), pending), false);
  assert.equal(approvalNudgeVisible(afterApprovals(3), pending), true);
});

test("the offer sits beside a pending request, in the asking mode, for that Session", () => {
  const state = afterApprovals(3);
  assert.equal(approvalNudgeVisible(state, { ...pending, hasPendingApproval: false }), false);
  assert.equal(approvalNudgeVisible(state, { ...pending, approvalMode: "write" }), false);
  assert.equal(approvalNudgeVisible(state, { ...pending, sessionId: "s2" }), false);
  assert.equal(approvalNudgeVisible(state, { ...pending, sessionId: null }), false);
});

test("accepting offers the existing middle mode and clears the count", () => {
  const { state, mode } = acceptApprovalNudge(afterApprovals(3), "s1");
  assert.equal(mode, "write");
  assert.equal(approvalNudgeVisible(state, pending), false);
  // Nothing else changes: the caller writes the setting, this records nothing
  // permanent, and a human who wants the offer again can earn it again.
  assert.equal(state.dismissed, false);
});

test("declining is permanent and applies to every Session", () => {
  const dismissed = dismissApprovalNudge();
  assert.equal(approvalNudgeVisible(dismissed, pending), false);
  assert.equal(approvalNudgeVisible(recordManualApproval(dismissed, "s2"), { ...pending, sessionId: "s2" }), false);
  // And it survives being written out and read back.
  assert.equal(approvalNudgeState(JSON.parse(JSON.stringify(dismissed))).dismissed, true);
});

test("clearing the offer restarts that Session's count and leaves others alone", () => {
  let state = afterApprovals(3);
  state = recordManualApproval(state, "s2");
  state = clearApprovalNudge(state, "s1");
  assert.equal(approvalNudgeVisible(state, pending), false);
  assert.equal(state.counts.s2, 1);
});

test("a decline survives a restart, and an unreadable store is not one", () => {
  const written = {};
  const store = { getItem: (key) => written[key] ?? null, setItem: (key, value) => { written[key] = value; } };
  writeApprovalNudgeState(dismissApprovalNudge(), store);
  assert.equal(readApprovalNudgeState(store).dismissed, true);
  // Nonsense in the store reads as a fresh state rather than throwing into
  // the composer that asked.
  written["reeve-approval-nudge"] = "{not json";
  assert.equal(readApprovalNudgeState(store).dismissed, false);
});
