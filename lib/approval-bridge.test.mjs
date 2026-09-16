import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  APPROVAL_BRIDGE_SOURCE,
  approvalBridgeListeners,
  approvalSelectToolCallId,
  ensureApprovalBridgeExtension,
  registerApprovalBridge,
} from "./approval-bridge.ts";

test("the bridge listens for OMP's own approval events and nothing else", () => {
  // Registering a handler is what makes OMP emit these at all, so both must
  // be listened for by name.
  assert.match(APPROVAL_BRIDGE_SOURCE, /pi\.on\("tool_approval_requested"/);
  assert.match(APPROVAL_BRIDGE_SOURCE, /pi\.on\("tool_approval_resolved"/);
  // It reports what OMP said, and never decides for itself.
  assert.match(APPROVAL_BRIDGE_SOURCE, /approved: event\.approved === true/);
  assert.doesNotMatch(APPROVAL_BRIDGE_SOURCE, /Approve|Deny|select/);
});

test("each Session's listener is its own, and stops when it says so", () => {
  const seen = [];
  const stop = registerApprovalBridge("s1", (event) => seen.push(event));
  registerApprovalBridge("s2", () => seen.push("wrong session"));
  approvalBridgeListeners().get("s1")({ phase: "resolved", sessionId: "s1", approved: true });
  assert.deepEqual(seen, [{ phase: "resolved", sessionId: "s1", approved: true }]);
  stop();
  assert.equal(approvalBridgeListeners().has("s1"), false);
  assert.equal(approvalBridgeListeners().has("s2"), true);
  approvalBridgeListeners().delete("s2");
});

test("the extension is written once and rewritten only when it differs", async () => {
  const agentDir = await mkdtemp(path.join(tmpdir(), "reeve-bridge-"));
  const file = await ensureApprovalBridgeExtension(agentDir);
  assert.equal(await readFile(file, "utf8"), APPROVAL_BRIDGE_SOURCE);
  // A file OMP can load: the loader takes .ts and .js only.
  assert.match(file, /\.js$/);
  await writeFile(file, "// stale", "utf8");
  assert.equal(await ensureApprovalBridgeExtension(agentDir), file);
  assert.equal(await readFile(file, "utf8"), APPROVAL_BRIDGE_SOURCE);
});

test("a question is tied to an approval only when one approval is waiting", () => {
  const options = ["Approve", "Deny"];
  assert.equal(approvalSelectToolCallId(["call-1"], options), "call-1");
  // Two tools can wait at once, and OMP passes no id into the question.
  assert.equal(approvalSelectToolCallId(["call-1", "call-2"], options), null);
  assert.equal(approvalSelectToolCallId([], options), null);
});

test("another extension's Approve-or-Deny question is never tied to an approval", () => {
  assert.equal(approvalSelectToolCallId(["call-1"], ["Approve", "Deny", "Always"]), null);
  assert.equal(approvalSelectToolCallId(["call-1"], ["Deny", "Approve"]), null);
  assert.equal(approvalSelectToolCallId(["call-1"], ["Yes", "No"]), null);
});
