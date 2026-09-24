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

function rows(actions, agents = []) {
  return h(I18nProvider, null, h(MultiAgentActionRows, { actions, agents }));
}

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
