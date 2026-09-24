import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, click, typeInto } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { GoalTab } = await jiti.import("./GoalTab.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

function goal(overrides = {}) {
  return {
    id: "goal-one", objective: "Finish the film", status: "active", tokenBudget: 1000,
    tokensUsed: 700, timeUsedSeconds: 12, createdAt: 1000, updatedAt: Date.now(), ...overrides,
  };
}

function wrap(props) {
  return h(I18nProvider, null, h(GoalTab, props));
}

test("the Goal tab shows the objective, saved time, Save, and Revert", async () => {
  const view = await mount(wrap({ goal: goal(), onSave: async () => true, onClose() {} }));
  try {
    assert.equal(view.container.querySelector("textarea").value, "Finish the film");
    assert.match(view.container.textContent, /Updated just now/);
    assert.match(view.container.textContent, /Revert/);
    assert.match(view.container.textContent, /Save/);
  } finally { await view.unmount(); }
});

test("Revert restores the saved objective and Save updates it", async () => {
  const updates = [];
  const original = goal();
  const props = { goal: original, onSave: async (...args) => { updates.push(args); return true; }, onClose() {} };
  const view = await mount(wrap(props));
  try {
    const editor = view.container.querySelector("textarea");
    await typeInto(editor, "Finish the final film");
    await click(view.container.querySelector('button[aria-label="Revert"], button'));
    assert.equal(editor.value, "Finish the film");
    await typeInto(editor, "Finish the final film");
    const save = [...view.container.querySelectorAll("button")].find((button) => button.textContent.includes("Save"));
    await click(save);
    assert.deepEqual(updates, [["Finish the final film", 1000]]);
  } finally { await view.unmount(); }
});

test("the Goal tab closes when the Goal completes or its identity changes", async () => {
  let closes = 0;
  const original = goal();
  const view = await mount(wrap({ goal: original, onSave: async () => true, onClose: () => { closes += 1; } }));
  try {
    await view.render(wrap({ goal: { ...original, status: "complete" }, onSave: async () => true, onClose: () => { closes += 1; } }));
    assert.equal(closes, 1);
    await view.render(wrap({ goal: { ...original, id: "goal-two" }, onSave: async () => true, onClose: () => { closes += 1; } }));
    assert.equal(closes, 2);
  } finally { await view.unmount(); }
});
