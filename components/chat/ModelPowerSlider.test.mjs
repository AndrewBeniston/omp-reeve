import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, focused, mount, press, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ModelPowerSlider } = await jiti.import("./ModelPowerSlider.tsx");
const { shouldCycleComposerEffort } = await jiti.import("../ChatInput.tsx");
const { Menu } = await jiti.import("../ui/Menu.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const steps = [
  { id: "model:minimal", model: { provider: "test", modelId: "model" }, thinkingLevel: "minimal", effort: "minimal", effortLabel: "Minimal", sliderLabel: "Minimal" },
  { id: "model:medium", model: { provider: "test", modelId: "model" }, thinkingLevel: "medium", effort: "medium", effortLabel: "Medium", sliderLabel: "Standard" },
  { id: "model:max", model: { provider: "test", modelId: "model" }, thinkingLevel: "max", effort: "max", effortLabel: "Max", sliderLabel: "Max" },
];

async function renderSlider(props = {}) {
  const triggerRef = React.createRef();
  const modelTriggerRef = React.createRef();
  const selections = [];
  const baseProps = {
    steps,
    currentStepId: steps[0].id,
    effortLabel: "Minimal",
    modelName: "Model",
    modelTriggerRef,
    modelMenuOpen: false,
    canSelectModel: true,
    canChangeEffort: true,
    onOpenModels() {},
    onSelectEffort(level) { selections.push(level); },
  };
  const tree = (overrides) => h(I18nProvider, null, h(Menu, {
    open: true,
    label: "Model settings",
    onClose() {},
    triggerRef,
  }, h(ModelPowerSlider, { ...baseProps, ...overrides })));
  const view = await mount(tree(props));
  return { ...view, selections, rerender: (overrides) => view.render(tree(overrides)) };
}

test("the menu reaches a hidden Power control with arrow instructions", async () => {
  const view = await renderSlider();
  try {
    const modelRow = view.container.querySelector("[data-model-menu-row='model']");
    assert.equal(focused(), modelRow);
    await press(modelRow, "ArrowDown");
    const control = focused();
    assert.equal(control.getAttribute("aria-label"), "Power");
    assert.equal(control.getAttribute("aria-keyshortcuts"), "ArrowLeft ArrowRight");
    const instructions = view.container.querySelector(`#${control.getAttribute("aria-describedby")}`);
    assert.equal(textOf(instructions), "Use Left and Right arrow keys to adjust power");
  } finally {
    await view.unmount();
  }
});

test("the Power arrows wrap and announce the selected model and effort", async () => {
  const view = await renderSlider();
  try {
    const control = view.container.querySelector("[aria-label='Power']");
    const left = await press(control, "ArrowLeft");
    assert.equal(left.defaultPrevented, true);
    assert.deepEqual(view.selections, ["max"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Max, 3 of 3. Consumes usage limits faster");

    const right = await press(control, "ArrowRight");
    assert.equal(right.defaultPrevented, true);
    assert.deepEqual(view.selections, ["max", "minimal"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Minimal, 1 of 3.");
  } finally {
    await view.unmount();
  }
});

test("the Power announcement uses a one-based position for a middle step", async () => {
  const view = await renderSlider();
  try {
    await press(view.container.querySelector("[aria-label='Power']"), "ArrowRight");
    assert.deepEqual(view.selections, ["medium"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Standard, 2 of 3.");
    assert.equal(view.container.querySelector("[role='status']").getAttribute("aria-live"), "polite");
  } finally {
    await view.unmount();
  }
});

test("Right Arrow wraps from the selected last step to the first step", async () => {
  const view = await renderSlider({ currentStepId: steps[2].id });
  try {
    await press(view.container.querySelector("[aria-label='Power']"), "ArrowRight");
    assert.deepEqual(view.selections, ["minimal"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Minimal, 1 of 3.");
  } finally {
    await view.unmount();
  }
});

test("the Power control stays disabled when effort cannot change", async () => {
  const view = await renderSlider({ canChangeEffort: false });
  try {
    const control = view.container.querySelector("[aria-label='Power']");
    assert.equal(control.hasAttribute("disabled"), true);
    await press(control, "ArrowRight");
    assert.deepEqual(view.selections, []);
  } finally {
    await view.unmount();
  }
});

test("a new model with fewer steps replaces a keyboard preview", async () => {
  const view = await renderSlider();
  try {
    await press(view.container.querySelector("[aria-label='Power']"), "ArrowLeft");
    const newSteps = [{ ...steps[0], id: "other:minimal", model: { provider: "test", modelId: "other" } }];
    await view.rerender({ steps: newSteps, currentStepId: newSteps[0].id, modelName: "Other" });
    assert.equal(view.container.querySelector("[data-power-thumb]").getAttribute("data-step"), "minimal");
  } finally {
    await view.unmount();
  }
});

test("Shift and Tab still cycles effort when no menu is open", () => {
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: true, isComposing: false, menuOpen: false, canCycle: true }), true);
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: true, isComposing: false, menuOpen: true, canCycle: true }), false);
});
