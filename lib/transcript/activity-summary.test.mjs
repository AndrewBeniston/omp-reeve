import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { composeActivitySummary } = await jiti.import("./activity-summary.ts");
const { enLocale } = await jiti.import("../i18n/messages/en.ts");

const t = (key, params = {}) => enLocale.messages[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
const call = (toolName, input = {}, extra = {}) => ({ block: { type: "toolCall", toolCallId: toolName, toolName, input }, ...extra });

test("composes ordered plural summary segments", () => {
  const calls = [
    call("edit", { path: "one.ts" }),
    call("read", { path: "one.ts" }),
    call("read", { path: "two.ts" }),
    call("bash", { command: "bun test" }),
    call("bash", { command: "bun run typecheck" }),
    call("mcp__github__list_issues"),
    call("list_mcp_resources"),
    call("web_search", { query: "Reeve" }),
    call("mcp__github__get_issue", {}, { metadata: { source: "github" } }),
    call("mcp__linear__get_issue", {}, { metadata: { source: "linear" } }),
    call("create_visualization"),
  ];
  assert.equal(
    composeActivitySummary({ calls, locale: "en", t }),
    "Edited a file, read files, ran commands, called a tool, loaded a tool, searched the web, used github and linear as 2 integrations, created a visualization",
  );
});

test("uses singular forms and the empty fallback", () => {
  assert.equal(composeActivitySummary({ calls: [call("bash")], locale: "en", t }), "Ran a command");
  assert.equal(composeActivitySummary({ calls: [], locale: "en", t }), "Worked");
});

test("deduplicates sources and localizes the browser", () => {
  const browser = { metadata: { source: "browser" } };
  assert.equal(composeActivitySummary({ calls: [call("mcp__browser__a", {}, browser), call("mcp__browser__b", {}, browser)], locale: "en", t }), "Used the browser");
});
