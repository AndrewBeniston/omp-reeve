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

test("renders the selected live Activity header", async () => {
  const view = await mount(h(I18nProvider, null, h(ActivityHeader, {
    input: {
      calls: [{ block: tool("read", { path: "notes.md" }) }],
      closed: false,
      inProgress: true,
      latestVisible: true,
      exploring: false,
    },
    summary: "Worked",
  })));
  assert.equal(view.container.querySelector("[data-live-activity-header='activity']")?.textContent, "Readingnotes.md");
  await view.unmount();
});
