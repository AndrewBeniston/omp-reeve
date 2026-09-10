import assert from "node:assert/strict";
import test from "node:test";

const {
  APPROVAL_MODES,
  approvalModeFromSettings,
  isApprovalMode,
} = await import("./approval-mode.ts");

test("maps every OMP approval mode into the composer order", () => {
  assert.deepEqual(APPROVAL_MODES, ["always-ask", "write", "yolo"]);
  assert.equal(isApprovalMode("always-ask"), true);
  assert.equal(isApprovalMode("write"), true);
  assert.equal(isApprovalMode("yolo"), true);
  assert.equal(isApprovalMode("full-access"), false);
});

test("reads the effective approval mode from the settings response", () => {
  assert.equal(approvalModeFromSettings({
    fields: [{ path: "tools.approvalMode", value: "write" }],
  }), "write");
  assert.equal(approvalModeFromSettings({ fields: [] }), null);
  assert.equal(approvalModeFromSettings({
    fields: [{ path: "tools.approvalMode", value: "invalid" }],
  }), null);
});
