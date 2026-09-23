import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { groupConsecutiveActivityCalls } = await createJiti(import.meta.url).import("./repeat-collapsing.ts");

function call(id, overrides = {}) {
  return {
    block: { type: "toolCall", toolCallId: id, toolName: "mcp__github__list_issues", input: { state: "open" } },
    result: { role: "toolResult", toolCallId: id, content: [] },
    ...overrides,
  };
}

test("groups only consecutive identical qualifying calls", () => {
  const groups = groupConsecutiveActivityCalls([
    call("one"),
    call("two"),
    call("three", { block: { type: "toolCall", toolCallId: "three", toolName: "mcp__github__create_issue", input: {} } }),
  ]);

  assert.deepEqual(groups.map((group) => group.calls.length), [2, 1]);
  assert.deepEqual(groups[0].calls.map((item) => item.block.toolCallId), ["one", "two"]);
});

for (const [name, overrides] of [
  ["an error", { result: { role: "toolResult", toolCallId: "one", content: [], isError: true } }],
  ["an incomplete call", { result: undefined }],
  ["an interrupted result", { result: { role: "toolResult", toolCallId: "two", content: [], details: { status: "aborted" } } }],
  ["an explicit source", { metadata: { source: "browser" } }],
  ["an automatic approval review", { metadata: { automaticApprovalReview: true } }],
  ["computer use", { metadata: { server: "computer-use" } }],
]) {
  test(`does not group ${name}`, () => {
    const groups = groupConsecutiveActivityCalls([call("one"), call("two", overrides)]);
    assert.deepEqual(groups.map((group) => group.calls.length), [1, 1]);
  });
}

test("every identity tuple field separates calls", () => {
  const base = {};
  for (const field of ["server", "tool", "functionName", "pluginId", "connectorId", "linkId", "invocationResourceUri"]) {
    const groups = groupConsecutiveActivityCalls([
      call("one", { metadata: { ...base } }),
      call("two", { metadata: { ...base, [field]: "different" } }),
    ]);
    assert.deepEqual(groups.map((group) => group.calls.length), [1, 1], field);
  }
});
