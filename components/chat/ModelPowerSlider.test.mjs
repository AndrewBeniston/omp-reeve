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

test("the reset control is absent while no explicit model override exists", async () => {
  const view = await renderSlider({ explicitModelOverride: false });
  try {
    const reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.equal(reset, null);
    const resetByData = view.container.querySelector("[data-reset-control]");
    assert.equal(resetByData, null);
  } finally {
    await view.unmount();
  }
});

test("the reset control shows for an explicit override, measures 32 px, and carries accessible label and tooltip", async () => {
  const view = await renderSlider({ explicitModelOverride: true });
  try {
    const reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.ok(reset);
    assert.equal(reset.getAttribute("aria-label"), "Reset to default");
    assert.equal(reset.getAttribute("title"), "Reset to default");

    const sliderRow = view.container.querySelector("[data-slider-row]");
    assert.ok(sliderRow);
    assert.ok(sliderRow.contains(reset));

    const sliderStart = view.container.querySelector("[data-slider-start]");
    assert.ok(sliderStart);
    assert.ok(sliderStart.contains(reset));

    // Verify 32 px round geometry in CSS
    const { readFile } = await import("node:fs/promises");
    const powerCss = await readFile(new URL("./ModelPowerSlider.module.css", import.meta.url), "utf8");
    assert.match(powerCss, /\.resetControl\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/);
    assert.match(powerCss, /\.resetControl\s*\{[^}]*border-radius:\s*50%;/);
  } finally {
    await view.unmount();
  }
});

test("activating the reset control triggers onResetToDefault", async () => {
  let resetCalled = false;
  const view = await renderSlider({
    explicitModelOverride: true,
    onResetToDefault() {
      resetCalled = true;
    },
  });
  try {
    const reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.ok(reset);
    const { click } = await import("../../test/dom-harness.mjs");
    await click(reset);
    assert.equal(resetCalled, true);
  } finally {
    await view.unmount();
  }
});

test("selecting the top step replaces the reset control with the warning text and makes reset hidden and not focusable", async () => {
  const view = await renderSlider({
    explicitModelOverride: true,
    currentStepId: steps[2].id, // steps[2] is max
  });
  try {
    const warning = view.container.querySelector("[data-usage-warning]");
    assert.ok(warning);
    assert.equal(textOf(warning), "Consumes usage limits faster");

    const reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.ok(reset);
    assert.equal(reset.getAttribute("aria-hidden"), "true");
    assert.equal(reset.getAttribute("tabindex"), "-1");
    assert.equal(reset.hasAttribute("disabled"), true);
    assert.equal(reset.hasAttribute("hidden"), true);
  } finally {
    await view.unmount();
  }
});

test("keyboard navigation to top step replaces reset with warning, and moving away restores reset", async () => {
  const view = await renderSlider({
    explicitModelOverride: true,
    currentStepId: steps[0].id,
  });
  try {
    // Initially on minimal: reset visible, warning absent
    let reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.ok(reset);
    assert.equal(reset.hasAttribute("hidden"), false);
    assert.equal(reset.getAttribute("tabindex"), "0");
    assert.equal(view.container.querySelector("[data-usage-warning]"), null);

    // Left Arrow wraps to max (top step)
    const control = view.container.querySelector("[aria-label='Power']");
    await press(control, "ArrowLeft");

    // Top step active: warning shown, reset hidden and not focusable
    const warning = view.container.querySelector("[data-usage-warning]");
    assert.ok(warning);
    assert.equal(textOf(warning), "Consumes usage limits faster");
    reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.equal(reset.getAttribute("aria-hidden"), "true");
    assert.equal(reset.getAttribute("tabindex"), "-1");
    assert.equal(reset.hasAttribute("disabled"), true);

    // Right Arrow wraps to minimal (not top step): warning absent, reset restored
    await press(control, "ArrowRight");
    assert.equal(view.container.querySelector("[data-usage-warning]"), null);
    reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.equal(reset.hasAttribute("hidden"), false);
    assert.equal(reset.getAttribute("tabindex"), "0");
  } finally {
    await view.unmount();
  }
});

test("the warning text belongs to the actual top OMP step (max) and is absent on non-max last steps", async () => {
  const subSteps = steps.slice(0, 2); // minimal and medium, no max
  const view = await renderSlider({
    steps: subSteps,
    currentStepId: subSteps[1].id, // medium is the last step here
    explicitModelOverride: true,
  });
  try {
    // Medium is the last step in subSteps, but NOT the top OMP step (max)
    const warning = view.container.querySelector("[data-usage-warning]");
    assert.equal(warning, null);

    // Reset control remains visible
    const reset = view.container.querySelector("[aria-label='Reset to default']");
    assert.ok(reset);
    assert.equal(reset.hasAttribute("hidden"), false);
  } finally {
    await view.unmount();
  }
});

test("usage warning CSS includes 1.1s shimmer playing one time and reduced-motion override", async () => {
  const { readFile } = await import("node:fs/promises");
  const powerCss = await readFile(new URL("./ModelPowerSlider.module.css", import.meta.url), "utf8");

  assert.match(powerCss, /\.usageWarningText\s*\{[^}]*animation:\s*usageWarningShimmer\s+1\.1s\s+ease-out\s+1;/);
  assert.match(powerCss, /@keyframes\s+usageWarningShimmer\s*\{/);
  assert.match(powerCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.usageWarningText\s*\{[^}]*animation:\s*none;/);
});
