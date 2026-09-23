import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { MultiAgentActionHeader } = await jiti.import("./MultiAgentActionHeader.tsx");
const { computeMultiAgentActionHeader } = await jiti.import("../../lib/transcript/multi-agent-action-header.ts");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

test("computes distinct sorted ids and uses the action count as fallback", () => {
  const model = computeMultiAgentActionHeader({
    actions: [
      { kind: "spawn", state: "completed", receiverThreadIds: ["z", "a"] },
      { kind: "spawn", state: "completed", receiverThreadIds: ["a"], agentIds: ["m"] },
    ],
  });
  assert.deepEqual(model, { kind: "spawn", state: "completed", agentIds: ["a", "m", "z"], count: 3 });
  assert.equal(computeMultiAgentActionHeader({ actions: [{ kind: "spawn", state: "completed" }], actionCount: 4 })?.count, 4);
});

test("uses in-progress, failed, then interrupted precedence", () => {
  assert.equal(computeMultiAgentActionHeader({ actions: [{ kind: "spawn", state: "failed" }, { kind: "spawn", state: "inProgress" }] })?.state, "inProgress");
  assert.equal(computeMultiAgentActionHeader({ actions: [{ kind: "spawn", state: "failed" }, { kind: "spawn", state: "interrupted" }] })?.state, "failed");
  assert.equal(computeMultiAgentActionHeader({ actions: [{ kind: "spawn", state: "interrupted" }, { kind: "spawn", state: "completed" }] })?.state, "interrupted");
});

test("renders the verb and plural count suffix", async () => {
  const view = await mount(h(I18nProvider, null, h(MultiAgentActionHeader, {
    input: { actions: [{ kind: "spawn", state: "completed", receiverThreadIds: ["a", "b"] }] },
  })));
  assert.equal(view.container.querySelector("[data-multi-agent-action-header]")?.textContent, "Created 2 agents");
  await view.unmount();
});
