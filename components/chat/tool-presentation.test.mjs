import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  classifyTool,
  getDiffStats,
  getResultDiff,
  getResultText,
  getTerminalCommand,
  getToolPreview,
  isEmptyResultText,
} = await jiti.import("./tool-presentation.ts");

test("classifies every tool name one time", () => {
  const cases = [
    ["read", "read"],
    ["cat", "read"],
    ["write", "write"],
    ["glob", "glob"],
    ["grep", "grep"],
    ["edit", "edit"],
    ["str_replace_editor", "edit"],
    ["bash", "bash"],
    ["bash (local)", "bash"],
    ["todo", "todo"],
    ["eval", "eval"],
    ["functions.task", "task"],
    ["browser", "browser"],
    ["inspect_image", "image"],
    ["unknown_tool", "generic"],
  ];

  for (const [name, kind] of cases) {
    assert.equal(classifyTool(name).kind, kind, name);
  }
});

test("derives the routing flags from the single classification", () => {
  const localBash = classifyTool("bash (local)");

  assert.equal(localBash.kind, "bash");
  assert.equal(localBash.isBash, true);
  assert.equal(localBash.isLocal, true);
  assert.equal(classifyTool("edit").isEdit, true);
  assert.equal(classifyTool("edit_file").isEdit, true);
  assert.equal(classifyTool("pre-edit").isEdit, false);
  assert.equal(classifyTool("project_todo").isTodo, true);
  assert.equal(classifyTool("todo_create").isTodo, false);
  assert.equal(classifyTool("exec_command").kind, "bash");
  assert.equal(classifyTool("exec_command").isBash, false);
  assert.equal(classifyTool("eval_run").isEval, false);
  assert.equal(classifyTool("project_eval").isEval, true);
  assert.equal(classifyTool("project_read").usesIntentPreview, true);
  assert.equal(classifyTool("bash").isLocal, false);
});

test("preserves the terminal route for every bash input", () => {
  assert.equal(getTerminalCommand(classifyTool("bash"), { command: "ls -la" }), "ls -la");
  assert.equal(getTerminalCommand(classifyTool("bash"), { command: "" }), "");
  assert.equal(getTerminalCommand(classifyTool("bash"), {}), "");
  assert.equal(getTerminalCommand(classifyTool("exec_command"), { cmd: "ls" }), null);
  assert.equal(getTerminalCommand(classifyTool("read"), { command: "ls" }), null);
});

test("builds the header preview from the tool input", () => {
  assert.equal(getToolPreview({ toolName: "read", input: { i: "Read the parser", path: "lib/patch.ts" } }), "Read the parser");
  assert.equal(getToolPreview({ toolName: "eval", input: { title: "Check the parser", code: "1" } }), "Check the parser");
  assert.equal(getToolPreview({ toolName: "eval_run", input: { code: "1", title: "Do not use" } }), "1");
  assert.equal(getToolPreview({ toolName: "bash", input: { command: "git status" } }), "git status");
  assert.equal(getToolPreview({ toolName: "read", input: { path: "DESIGN.md" } }), "DESIGN.md");
  assert.equal(getToolPreview({ toolName: "write", input: { file_path: "a.ts" } }), "a.ts");
  assert.equal(getToolPreview({ toolName: "glob", input: { pattern: "**/*.ts" } }), "**/*.ts");
  assert.equal(getToolPreview({ toolName: "grep", input: { query: "needle" } }), "needle");
  assert.equal(getToolPreview({ toolName: "other", input: { first: "value" } }), "value");
  assert.equal(getToolPreview({ toolName: "other", input: {} }), "");
  assert.equal(getToolPreview({ toolName: "other", input: null }), "");
  assert.equal(getToolPreview({ toolName: "read", input: { path: "x".repeat(200) } }).length, 120);
});

test("reads the tool result text, the empty state, and the error state", () => {
  const result = { role: "toolResult", toolCallId: "1", content: [{ type: "text", text: "line one" }, { type: "image" }, { type: "text", text: "line two" }] };

  assert.equal(getResultText(result), "line one\nline two");
  assert.equal(getResultText(undefined), null);
  assert.equal(isEmptyResultText(null), false);
  assert.equal(isEmptyResultText(""), true);
  assert.equal(isEmptyResultText("(no output)"), true);
  assert.equal(isEmptyResultText("output"), false);
});

test("reads a patch, a diff, and the diff stats", () => {
  assert.deepEqual(getResultDiff({ details: { patch: "@@\n+a" } }), { text: "@@\n+a" });
  assert.deepEqual(getResultDiff({ details: { diff: "@@\n-a" } }), { text: "@@\n-a" });
  assert.equal(getResultDiff({ details: {} }), null);
  assert.equal(getResultDiff({}), null);
  assert.deepEqual(getDiffStats("+++ a\n--- b\n+added\n-removed\n context"), { added: 1, removed: 1 });
});
