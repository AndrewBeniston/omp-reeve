import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ActivityHeader, ActivityRow } = await jiti.import("./ActivityRow.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const { activityRowContent } = await jiti.import("./transcript-rows.ts");
const h = React.createElement;

function tool(name, input = {}) {
  return { type: "toolCall", toolCallId: `call-${name}`, toolName: name, input };
}

test("every classifier kind uses the shared Activity row", () => {
  const calls = [
    tool("bash", { command: "bun test" }),
    tool("read", { path: "lib/example.ts" }),
    tool("grep", { query: "needle" }),
    tool("glob", { path: "components" }),
    tool("edit", { path: "file.ts" }),
    tool("web_search", { query: "Reeve" }),
    tool("task", { prompt: "Review this" }),
    tool("mcp__github__list_issues"),
    tool("computer", { action: "screenshot" }),
    tool("custom_tool"),
  ];
  const kinds = calls.map((block) => activityRowContent(block).classification.kind);
  assert.deepEqual(new Set(kinds), new Set([
    "command", "read", "search", "list", "edit", "web-search",
    "sub-agent", "connector", "application-control", "unknown",
  ]));
});

test("the action and detail stay in separate slots and only detail truncates", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("bash", { command: "a command that is long enough to truncate in the detail slot" }),
    result: { role: "toolResult", toolCallId: "call-bash", content: [] },
  })));
  const row = view.container.querySelector('[data-activity-kind="command"]');
  assert.ok(row);
  assert.equal(row?.querySelectorAll("[data-activity-slot]").length, 2);
  assert.equal(row?.querySelector('[data-activity-slot="action"]')?.textContent, "Ran");
  assert.equal(row?.querySelector('[data-activity-slot="detail"]')?.textContent, "a command that is long enough to truncate in the detail slot");
  await view.unmount();

  const css = readFileSync(new URL("./activity-row.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css.match(/\.action\s*\{[^}]*\}/s)?.[0] ?? "", /text-overflow|overflow/);
  assert.match(css.match(/\.detail\s*\{[^}]*\}/s)?.[0] ?? "", /overflow:\s*hidden/);
  assert.match(css.match(/\.detail\s*\{[^}]*\}/s)?.[0] ?? "", /text-overflow:\s*ellipsis/);
});

test("an interrupted command uses stopped text and icon", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("bash", { command: "bun test" }),
    interrupted: true,
  })));
  const row = view.container.querySelector('[data-activity-state="interrupted"]');
  assert.equal(row?.querySelector('[data-activity-slot="action"]')?.textContent, "Stopped");
  assert.equal(row?.querySelector('[data-activity-slot="detail"]')?.textContent, "bun test");
  assert.equal(row?.getAttribute("data-activity-kind"), "command");
  assert.ok(row?.querySelector('[data-activity-icon="stopped"]'));
  await view.unmount();
});

test("Activity strings exist in both locales and do not end with an ellipsis", () => {
  const keys = Object.keys(enLocale.messages).filter((key) => key.startsWith("transcript.activity."));
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(zhCNLocale.messages[key], `missing zh-CN string: ${key}`);
    assert.doesNotMatch(enLocale.messages[key], /(?:\.{3}|…)$/);
    assert.doesNotMatch(zhCNLocale.messages[key], /(?:\.{3}|…)$/);
  }
});

test("a grouped connector call renders a counted disclosure and reveals every call", async () => {
  const calls = [tool("mcp__github__list_issues"), tool("mcp__github__list_issues")];
  calls[1].toolCallId = "call-two";
  const results = calls.map((block) => ({ role: "toolResult", toolCallId: block.toolCallId, content: [] }));
  const view = await mount(h(I18nProvider, null, h(ActivityRow, { block: calls[0], result: results[0], groupedCalls: calls.map((block, index) => ({ block, result: results[index] })) })));
  const trigger = view.container.querySelector("[data-activity-repeats]");
  assert.ok(trigger);
  assert.equal(trigger?.getAttribute("aria-expanded"), "false");
  assert.equal(trigger?.querySelector("[data-activity-count]")?.textContent, "· 2 calls");
  assert.equal(trigger?.textContent, "mcp__github__list_issues· 2 calls");
  assert.equal(view.container.querySelectorAll("[data-activity-instance]").length, 0);
  await click(trigger);
  assert.equal(trigger?.getAttribute("aria-expanded"), "true");
  assert.equal(view.container.querySelectorAll("[data-activity-instance]").length, 2);
  await view.unmount();
});

test("a first-party label keeps the standalone call count segment", async () => {
  const calls = [tool("read", { path: "notes.md" }), tool("read", { path: "notes.md" })];
  calls[1].toolCallId = "call-two";
  const results = calls.map((block) => ({ role: "toolResult", toolCallId: block.toolCallId, content: [] }));
  const view = await mount(h(I18nProvider, null, h(ActivityRow, { block: calls[0], result: results[0], groupedCalls: calls.map((block, index) => ({ block, result: results[index] })) })));
  assert.equal(view.container.querySelector("[data-activity-repeats]")?.textContent, "Reading· 2 calls");
  assert.equal(view.container.querySelector("[data-activity-count]")?.textContent, "· 2 calls");
  await view.unmount();
});

function subagent(overrides = {}) {
  return {
    id: "agent-thread-1",
    index: 0,
    agent: "Reviewer",
    agentSource: "project",
    status: "running",
    lastUpdate: 1,
    ...overrides,
  };
}

test("sub-agent rows render lifecycle state and attach by parent tool call id", async () => {
  const states = [
    [subagent(), "Reviewer started working"],
    [subagent({ progress: { id: "agent-thread-1", index: 0, agent: "Reviewer", status: "running", task: "Review", recentTools: [], recentOutput: [], toolCount: 0, requests: 0, tokens: 0, cost: 0, durationMs: 1 } }), "Reviewer updated"],
    [subagent({ status: "aborted" }), "Reviewer interrupted"],
    [subagent({ status: "completed" }), "Reviewer finished"],
  ];
  for (const [snapshot, expected] of states) {
    const view = await mount(h(I18nProvider, null, h(ActivityRow, {
      block: tool("task"),
      subagents: [{ ...snapshot, parentToolCallId: "call-task" }],
    })));
    assert.equal(view.container.querySelector("[data-subagent-activity]")?.getAttribute("data-state") !== null, true);
    assert.match(view.container.querySelector("[data-subagent-activity]")?.textContent ?? "", new RegExp(`${expected}$`));
    await view.unmount();
  }

  const unrelated = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("task"),
    subagents: [subagent({ parentToolCallId: "another-call" })],
  })));
  assert.equal(unrelated.container.querySelector("[data-subagent-activity]"), null);
  await unrelated.unmount();
});

test("several sub-agents under one anchor render a grouped summary", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("task"),
    subagents: [
      subagent({ id: "one", agent: "One", parentToolCallId: "call-task" }),
      subagent({ id: "two", agent: "Two", parentToolCallId: "call-task" }),
    ],
  })));
  assert.equal(view.container.querySelector("[data-subagent-summary-sentence]")?.textContent, "One and Two started working");
  await view.unmount();
});

test("a multi-agent action renders one header and keeps existing sub-agent rows separate", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("task", { receiverThreadIds: ["agent-b", "agent-a"] }),
    result: { role: "toolResult", toolCallId: "call-task", content: [] },
    subagents: [
      subagent({ id: "agent-b", parentToolCallId: "call-task", status: "completed" }),
      subagent({ id: "agent-a", parentToolCallId: "call-task", status: "running" }),
    ],
  })));
  assert.equal(view.container.querySelectorAll("[data-multi-agent-action-header]").length, 1);
  assert.equal(view.container.querySelector("[data-multi-agent-action-header]")?.textContent, "Creating 2 agents");
  assert.equal(view.container.querySelectorAll("[data-subagent-summary]").length, 1);
  await view.unmount();
});

test("sub-agent rows use the fallback name and drop unusable names", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("task"),
    subagents: [
      subagent({ id: "blank", agent: "   ", parentToolCallId: "call-task" }),
      subagent({ id: "named-id", agent: "named-id", parentToolCallId: "call-task" }),
    ],
  })));
  const rows = view.container.querySelectorAll("[data-subagent-activity]");
  assert.equal(rows.length, 1);
  assert.match(rows[0]?.textContent ?? "", /Agent started working$/);
  await view.unmount();
});

test("grouped sub-agent names open the selected sub-agent", async () => {
  let opened = null;
  const view = await mount(h(I18nProvider, null, h(ActivityRow, {
    block: tool("task"),
    onOpenSubagent: (id) => { opened = id; },
    subagents: [
      subagent({ id: "active", agent: "Active", parentToolCallId: "call-task" }),
      subagent({ id: "background", agent: "Background", status: "completed", sessionFile: "/tmp/background.jsonl", parentToolCallId: "call-task" }),
      subagent({ id: "plain", agent: "Plain", status: "completed", parentToolCallId: "call-task" }),
      subagent({ id: "updated", agent: "Updated", status: "running", progress: { id: "updated", index: 1, agent: "Updated", status: "running", task: "Review", recentTools: [], recentOutput: [], toolCount: 0, requests: 0, tokens: 0, cost: 0, durationMs: 1 }, parentToolCallId: "call-task" }),
    ],
  })));
  const names = view.container.querySelectorAll("[data-subagent-summary-name]");
  assert.equal(names.length, 2);
  assert.deepEqual([...names].map((row) => row.textContent), ["Active", "Background"]);
  await click(names[0]);
  assert.equal(opened, "active");
  await view.unmount();
});

test("sub-agent avatar colors are stable and seeded by agent thread id", async () => {
  const first = await mount(h(I18nProvider, null, h(ActivityRow, { block: tool("task"), subagents: [subagent({ parentToolCallId: "call-task" })] })));
  const same = await mount(h(I18nProvider, null, h(ActivityRow, { block: tool("task"), subagents: [subagent({ parentToolCallId: "call-task" })] })));
  const different = await mount(h(I18nProvider, null, h(ActivityRow, { block: tool("task"), subagents: [subagent({ id: "other-thread", parentToolCallId: "call-task" })] })));
  const seed = first.container.querySelector("[data-avatar-seed]")?.getAttribute("data-avatar-seed");
  assert.ok(seed);
  assert.equal(same.container.querySelector("[data-avatar-seed]")?.getAttribute("data-avatar-seed"), seed);
  assert.notEqual(different.container.querySelector("[data-avatar-seed]")?.getAttribute("data-avatar-seed"), seed);
  await first.unmount();
  await same.unmount();
  await different.unmount();
});

test("renders the selected live Activity header", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityHeader, {
    input: {
      calls: [{ block: tool("read", { path: "notes.md" }) }],
      closed: false,
      inProgress: true,
      latestVisible: true,
      exploring: false,
    },
  })));
  assert.equal(view.container.querySelector("[data-live-activity-header='activity']")?.textContent, "Readingnotes.md");
  await view.unmount();
});

test("a completed Activity header renders its composed summary", async () => {
  const calls = [
    { block: tool("edit", { path: "one.ts" }) },
    { block: tool("read", { path: "one.ts" }) },
    { block: tool("read", { path: "two.ts" }) },
    { block: tool("bash", { command: "bun test" }) },
    { block: tool("bash", { command: "bun run typecheck" }) },
    { block: tool("mcp__github__list_issues"), result: { role: "toolResult", toolCallId: "call-list_issues", content: [] } },
    { block: tool("list_mcp_resources") },
    { block: tool("web_search", { query: "Reeve" }) },
    { block: tool("mcp__github__get_issue"), metadata: { source: "github" } },
    { block: tool("mcp__linear__get_issue"), metadata: { source: "linear" } },
    { block: tool("create_visualization") },
  ];
  const view = await mount(h(I18nProvider, null, h(ActivityHeader, {
    input: { calls, closed: true, inProgress: false, latestVisible: true, exploring: false },
  })));
  assert.equal(
    view.container.querySelector("[data-live-activity-header='summary']")?.textContent,
    "Edited a file, read files, ran commands, called a tool, loaded a tool, searched the web, used github and linear as 2 integrations, created a visualization",
  );
  await view.unmount();
});

test("a completed Activity header names the browser source and has an empty fallback", async () => {
  const browserCall = { block: tool("mcp__browser__navigate"), metadata: { source: "browser" } };
  const view = await mount(h(I18nProvider, null, h(ActivityHeader, {
    input: { calls: [browserCall, browserCall], closed: true, inProgress: false, latestVisible: true, exploring: false },
  })));
  assert.equal(view.container.querySelector("[data-live-activity-header='summary']")?.textContent, "Used the browser");
  await view.unmount();

  const empty = await mount(h(I18nProvider, null, h(ActivityHeader, {
    input: { calls: [], closed: true, inProgress: false, latestVisible: true, exploring: false },
  })));
  assert.equal(empty.container.querySelector("[data-live-activity-header='summary']")?.textContent, "Worked");
  await empty.unmount();
});
