import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { classifyActivityTool } = await createJiti(import.meta.url).import("./activity-classifier.ts");

const cases = [
  ["bash", {}, "command"],
  ["read", { path: "/tmp/notes.md" }, "read"],
  ["grep", { pattern: "needle" }, "search"],
  ["glob", { pattern: "**/*.ts" }, "list"],
  ["edit", { path: "/tmp/notes.md" }, "edit"],
  ["write", { path: "/tmp/notes.md" }, "edit"],
  ["web_search", { query: "activity rows" }, "web-search"],
  ["task", { prompt: "Review the change" }, "sub-agent"],
  ["sonic", { prompt: "Collect the values" }, "sub-agent"],
  ["origin", { url: "https://example.com" }, "command"],
  ["generate_image", { subject: "A chart" }, "edit"],
  ["tts", { text: "Ready" }, "unknown"],
  ["computer", { action: "capabilities" }, "application-control"],
  ["mcp__linear__list_issues", { team: "Reeve" }, "connector"],
  ["reeve_read_terminal", {}, "application-control"],
  ["future_omp_tool", {}, "unknown"],
];

for (const [name, input, kind] of cases) {
  test(`${name} classifies as ${kind}`, () => {
    assert.equal(classifyActivityTool(name, input).kind, kind);
  });
}

test("command classification retains empty and populated command input", () => {
  assert.deepEqual(classifyActivityTool("bash", { command: "" }), { kind: "command", command: "" });
  assert.deepEqual(classifyActivityTool("bash", { command: "  git status  " }), { kind: "command", command: "git status" });
});

test("activity classification retains interrupted execution data", () => {
  assert.deepEqual(
    classifyActivityTool("bash", { command: "bun test" }, { interrupted: true }),
    { kind: "command", command: "bun test", interrupted: true },
  );
});

test("application-control classification names the controlled surface", () => {
  assert.deepEqual(classifyActivityTool("reeve_read_terminal", {}), {
    kind: "application-control",
    surface: "terminal",
  });
  assert.deepEqual(classifyActivityTool("computer", { action: "capabilities" }), {
    kind: "application-control",
    surface: "desktop",
  });
});

test("known tools use one table row after case normalization", () => {
  assert.equal(classifyActivityTool("READ", { path: "/tmp/a" }).kind, "read");
  assert.equal(classifyActivityTool("read", { path: "/tmp/a" }).kind, "read");
});
