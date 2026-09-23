import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { SubagentGroupSummary } = await jiti.import("./SubagentActivityRow.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const subagent = (index, overrides = {}) => ({
  id: `agent-${index}`,
  index,
  agent: `Agent ${index}`,
  agentSource: "project",
  status: "running",
  lastUpdate: index,
  ...overrides,
});

test("renders an aria-live sentence, at most four avatars, and an independent hidden count", async () => {
  let overflowOpened = 0;
  const view = await mount(h(I18nProvider, null, h(SubagentGroupSummary, {
    subagents: Array.from({ length: 5 }, (_, index) => subagent(index)),
    fallbackName: "Agent",
    onOpenAll: () => { overflowOpened += 1; },
  })));
  const summary = view.container.querySelector("[data-subagent-summary]");
  assert.equal(summary?.getAttribute("aria-live"), "polite");
  assert.equal(summary?.querySelectorAll("[data-avatar-seed]").length, 4);
  assert.equal(summary?.querySelector("[data-subagent-summary-sentence]")?.textContent, "Agent 0, Agent 1 and 3 more started working");
  await click(summary?.querySelector("[data-subagent-summary-more]"));
  assert.equal(overflowOpened, 1);
  await view.unmount();
});

test("uses native buttons for every name when the group can open agents", async () => {
  const opened = [];
  const view = await mount(h(I18nProvider, null, h(SubagentGroupSummary, {
    subagents: [subagent(0), subagent(1)],
    fallbackName: "Agent",
    onOpen: (id) => opened.push(id),
  })));
  const names = view.container.querySelectorAll("[data-subagent-summary-name]");
  assert.equal(names.length, 2);
  assert.deepEqual([...names].map((node) => node.tagName), ["BUTTON", "BUTTON"]);
  await click(names[1]);
  assert.deepEqual(opened, ["agent-1"]);
  await view.unmount();
});
