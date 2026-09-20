import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * Read against the source, the way the other checks on this hook are written:
 * both failures here are about the order of two awaits and an early return,
 * which is what the source says and what a rendered harness would not.
 */
const source = readFileSync(new URL("./useAgentSession.ts", import.meta.url), "utf8");

test("only OMP's own approval event counts, never a dialog", () => {
  const respond = source.slice(
    source.indexOf("const respondToExtensionUi"),
    source.indexOf("const sendExtensionCustomInput"),
  );
  // Answering a dialog counts nothing: an extension may ask the same
  // Approve-or-Deny question for its own reasons.
  assert.doesNotMatch(respond, /recordManualApproval/);
  assert.doesNotMatch(respond, /setApprovalAsked/);
  // A response that never arrived leaves the prompt on screen to answer again.
  const failure = respond.slice(respond.indexOf("} catch"));
  assert.match(failure, /setExtensionDialog\(\(current\) => current \?\? request\)/);

  // The count moves on the typed event, and only when it says approved.
  const approval = source.slice(source.indexOf("case \"tool_approval\""), source.indexOf("case \"extension_ui_request\""));
  assert.match(approval, /phase === "requested"[\s\S]*setApprovalAsked\(true\)/);
  assert.match(approval, /phase !== "resolved"[\s\S]*setApprovalAsked\(false\)/);
  assert.match(approval, /event\.approved === true[\s\S]*recordManualApproval/);
});

test("accepting the offer clears it only when the setting was written", () => {
  const accept = source.slice(
    source.indexOf("const handleApprovalNudgeAccept"),
    source.indexOf("const handleApprovalNudgeDismiss"),
  );
  assert.match(accept, /if \(!await handleApprovalModeChange\(mode\)\) return;/);
  const returned = accept.indexOf("return;");
  assert.ok(accept.indexOf("clearApprovalNudge") > returned, "the count is cleared after that check, not before");
  // And the writer reports what happened rather than swallowing it.
  const change = source.slice(source.indexOf("const handleApprovalModeChange"), source.indexOf("const handleFastModeChange"));
  assert.match(change, /Promise<boolean>/);
  assert.match(change, /return false;/);
  assert.match(change, /return true;/);
});

test("the offer rides inside the pending approval dialog, and only that one", () => {
  const correlation = source.slice(
    source.indexOf("const approvalDialogId"),
    source.indexOf("const handleApprovalNudgeAccept"),
  );
  // A stamped question is the only one the offer may appear inside, and the
  // approval it names must still be waiting.
  assert.match(correlation, /approvalAsked/);
  assert.match(correlation, /method === "select"/);
  assert.match(correlation, /extensionDialog\.approvalToolCallId/);
});
