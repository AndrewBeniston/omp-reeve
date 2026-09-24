import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { MultiAgentActionRows } = await jiti.import("./MultiAgentActionRow.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const agent = (id, name, status = "running") => ({
  id,
  index: 0,
  agent: name,
  agentSource: "project",
  status,
  lastUpdate: 0,
});

function rows(actions, agents = [], modelList = []) {
  return h(I18nProvider, null, h(MultiAgentActionRows, { actions, agents, modelList }));
}

test("the agent chip removes one leading at sign", async () => {
  const view = await mount(rows([{ kind: "spawn", state: "completed", receiverThreadIds: ["agent-a"], agentName: "@Alpha" }]));
  assert.equal(view.container.querySelector("[data-agent-chip]")?.textContent, "Alpha");
  await view.unmount();
});

test("a non-default agent role appears in parentheses", async () => {
  const view = await mount(rows([{ kind: "spawn", state: "completed", receiverThreadIds: ["agent-a"], agentName: "Alpha", role: "reviewer" }]));
  assert.equal(view.container.querySelector("[data-agent-chip]")?.textContent, "Alpha (reviewer)");
  await view.unmount();
});

test("a known agent model supplies its model tooltip", async () => {
  const view = await mount(rows([{ kind: "spawn", state: "completed", receiverThreadIds: ["agent-a"], agentName: "Alpha", model: "gpt-4o" }], [], [{ id: "gpt-4o", name: "GPT-4o", provider: "openai" }]));
  assert.equal(view.container.querySelector("[data-agent-chip]")?.textContent, "Alpha");
  assert.equal(view.container.querySelector("[role='tooltip']")?.textContent, "GPT-4o");
  await view.unmount();
});

test("an unknown agent model supplies no tooltip", async () => {
  const view = await mount(rows([{ kind: "spawn", state: "completed", receiverThreadIds: ["agent-a"], agentName: "Alpha", model: "missing" }], [], [{ id: "gpt-4o", name: "GPT-4o", provider: "openai" }]));
  assert.equal(view.container.querySelector("[role='tooltip']"), null);
  await view.unmount();
});

test("prompt text stays on one line", async () => {
  const view = await mount(rows([{ kind: "interrupt", state: "inProgress", receiverThreadIds: ["agent-a"], prompt: "A long prompt" }]));
  const input = view.container.querySelector("[data-multi-agent-action-text='input']");
  assert.ok(input);
  assert.equal(input.getAttribute("data-overflow"), "false");
  await view.unmount();
});

test("the prompt tooltip opens only when the text overflows", async () => {
  const view = await mount(rows([{ kind: "interrupt", state: "inProgress", receiverThreadIds: ["agent-a"], prompt: "A long prompt" }]));
  const input = view.container.querySelector("[data-multi-agent-action-text='input']");
  assert.ok(input);
  assert.equal(view.container.querySelector("[role='tooltip']"), null);
  Object.defineProperty(input, "scrollWidth", { configurable: true, value: 200 });
  Object.defineProperty(input, "clientWidth", { configurable: true, value: 100 });
  await view.render(rows([{ kind: "interrupt", state: "inProgress", receiverThreadIds: ["agent-a"], prompt: "A different prompt" }]));
  const updatedInput = view.container.querySelector("[data-multi-agent-action-text='input']");
  assert.ok(updatedInput);
  assert.equal(updatedInput.getAttribute("data-overflow"), "true");
  assert.equal(view.container.querySelector("[role='tooltip']")?.textContent, "Input: A different prompt");
  await view.unmount();
});

test("renders a per-agent state and message from the action state map", async () => {
  const view = await mount(h(I18nProvider, null, h(MultiAgentActionRows, {
    actions: [{ kind: "spawn", state: "completed", receiverThreadIds: ["agent-a"] }],
    agents: [agent("agent-a", "Alpha", "running")],
    perAgentStates: new Map([["agent-a", { state: "errored", message: "Missing dependency" }]]),
  })));
  assert.equal(view.container.querySelector("[data-multi-agent-action-text='label']")?.textContent, "Created Alpha (errored: Missing dependency)");
  await view.unmount();
});

test("completed spawn instructions use the created-with-instructions row", async () => {
  const view = await mount(rows(
    [{ kind: "spawn", state: "completed", receiverThreadIds: ["agent-a"], prompt: "Build the thing" }],
    [agent("agent-a", "Alpha")],
  ));
  assert.equal(view.container.querySelector("[data-multi-agent-action-row]")?.textContent, "Created Alpha with the instructions: Build the thing");
  await view.unmount();
});

test("send input with prompt text uses the messaged-with-prompt row", async () => {
  const view = await mount(rows(
    [{ kind: "sendInput", state: "completed", receiverThreadIds: ["agent-a"], prompt: "Review the change" }],
    [agent("agent-a", "Alpha")],
  ));
  assert.equal(view.container.querySelector("[data-multi-agent-action-row]")?.textContent, "Messaged Alpha: Review the change");
  await view.unmount();
});

test("other actions use the generic row and an optional input line", async () => {
  const view = await mount(rows(
    [{ kind: "interrupt", state: "inProgress", receiverThreadIds: ["agent-a"], prompt: "Check the branch" }],
    [agent("agent-a", "Alpha")],
  ));
  assert.equal(view.container.querySelector("[data-multi-agent-action-text='label']")?.textContent, "Interrupting Alpha (running)");
  assert.equal(view.container.querySelector("[data-multi-agent-action-text='input']")?.textContent, "Input: Check the branch");
  await view.unmount();
});

test("close and resume suppress the per-agent state suffix", async () => {
  for (const kind of ["close", "resume"]) {
    const view = await mount(rows(
      [{ kind, state: "inProgress", receiverThreadIds: ["agent-a"], agentState: "running" }],
      [agent("agent-a", "Alpha")],
    ));
    assert.equal(view.container.querySelector("[data-multi-agent-action-row]")?.textContent, `${kind === "close" ? "Closing" : "Resuming"} Alpha`);
    await view.unmount();
  }
});

test("unknown agent identifiers use the generic fallback row", async () => {
  const view = await mount(rows([{ kind: "spawn", state: "completed", receiverThreadIds: ["unknown-agent"], prompt: "Check agents" }]));
  assert.equal(view.container.querySelector("[data-multi-agent-action-text='label']")?.textContent, "Created");
  assert.equal(view.container.querySelector("[data-multi-agent-action-text='input']")?.textContent, "Input: Check agents");
  await view.unmount();
});
