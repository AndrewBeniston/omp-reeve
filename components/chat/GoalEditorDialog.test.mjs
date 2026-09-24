import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, click, typeInto, focused, DomEvent } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { GoalEditorDialog } = await jiti.import("./GoalEditorDialog.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const goal = {
  id: "goal-one",
  objective: "Finish the film",
  status: "active",
  tokenBudget: 1000,
  tokensUsed: 700,
  timeUsedSeconds: 12,
  createdAt: 1000,
  updatedAt: 2000,
};

async function open(props = {}) {
  const view = await mount(h(I18nProvider, null, h(GoalEditorDialog, {
    goal,
    onSave: async () => true,
    onClose() {},
    ...props,
  })));
  const root = view.container.ownerDocument.body.querySelectorAll('[role="dialog"]').at(-1);
  assert.ok(root);
  return { view, root, objective: root.querySelector("#goal-objective-edit"), budget: root.querySelector("#goal-budget-edit") };
}

test("the Goal editor saves objective and budget together through one update", async () => {
  const updates = [];
  const { view, root, objective, budget } = await open({ onSave: async (...args) => { updates.push(args); return true; } });
  try {
    assert.equal(focused(), objective);
    assert.equal(objective.getAttribute("rows"), "12");
    assert.equal(budget.value, "1000");
    await typeInto(objective, "Finish the final film");
    await typeInto(budget, "1500");
    await React.act(async () => { root.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(updates, [["Finish the final film", 1500]]);
  } finally { await view.unmount(); }
});

test("Cancel changes nothing and a failed update keeps the draft open", async () => {
  const updates = [];
  let closes = 0;
  const { view, root, objective } = await open({
    onSave: async (...args) => { updates.push(args); return false; },
    onClose: () => { closes += 1; },
  });
  try {
    await typeInto(objective, "Keep this draft");
    await click(root.querySelector('button[type="button"]'));
    assert.deepEqual(updates, []);
    assert.equal(closes, 1);

    const second = await open({ onSave: async (...args) => { updates.push(args); return false; } });
    await typeInto(second.objective, "Keep this draft");
    await React.act(async () => { second.root.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(updates, [["Keep this draft", 1000]]);
    assert.match(second.root.textContent, /Failed to save goal objective/);
    await second.view.unmount();
  } finally { await view.unmount(); }
});
