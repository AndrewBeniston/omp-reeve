import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ActivityRow } = await jiti.import("./ActivityRow.tsx");
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
