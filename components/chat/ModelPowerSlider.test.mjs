import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { DomEvent, React, click, focused, mount, press, settle, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ModelPowerSlider } = await jiti.import("./ModelPowerSlider.tsx");
const { ChatInput, shouldCycleComposerEffort } = await jiti.import("../ChatInput.tsx");
const { Menu } = await jiti.import("../ui/Menu.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const h = React.createElement;

const steps = [
  { id: "model:minimal", model: { provider: "test", modelId: "model" }, thinkingLevel: "minimal", effort: "minimal", effortLabel: "Minimal", sliderLabel: "Minimal" },
  { id: "model:medium", model: { provider: "test", modelId: "model" }, thinkingLevel: "medium", effort: "medium", effortLabel: "Medium", sliderLabel: "Medium" },
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

test("the effort header centers the effort and model name and owns the model trigger", async () => {
  let opened = false;
  const view = await renderSlider({ onOpenModels() { opened = true; } });
  try {
    const header = view.container.querySelector("[data-model-effort-header]");
    assert.ok(header);
    const modelTrigger = header.querySelector("[data-model-menu-row='model']");
    assert.equal(modelTrigger.getAttribute("aria-label"), "Select model");
    assert.equal(textOf(header.querySelector("[data-model-effort-label]")), "Minimal");
    assert.equal(textOf(header.querySelector("[data-model-effort-name]")), "Model");
    assert.ok(modelTrigger.querySelector("svg"));
    await click(modelTrigger);
    assert.equal(opened, true);
  } finally {
    await view.unmount();
  }
});

test("the CSS uses the reference track, fill, tick, and thumb geometry", async () => {
  const { readFile } = await import("node:fs/promises");
  const powerCss = await readFile(new URL("./ModelPowerSlider.module.css", import.meta.url), "utf8");
  assert.match(powerCss, /\.track\s*\{[^}]*--power-thumb:\s*28px;[^}]*--power-motion:\s*0\.3s cubic-bezier\(0\.23, 1, 0\.32, 1\);/);
  assert.match(powerCss, /\.rail\s*\{[^}]*height:\s*24px;[^}]*border-radius:\s*12px;/);
  assert.match(powerCss, /\.rail::before\s*\{[^}]*width:\s*calc\(var\(--power-thumb\) \/ 2 \+ \(100% - var\(--power-thumb\)\) \* var\(--ui-power-progress, 0\)\);[^}]*transition:\s*width var\(--power-motion\);/);
  assert.match(powerCss, /\.dot,\s*\.thumb\s*\{[^}]*left:\s*calc\(var\(--power-thumb\) \/ 2 \+ \(100% - var\(--power-thumb\)\) \* var\(--ui-power-position, 0\.5\)\);/);
  assert.match(powerCss, /\.dot\s*\{[^}]*width:\s*4px;[^}]*height:\s*4px;/);
  assert.match(powerCss, /\.thumb\s*\{[^}]*width:\s*var\(--power-thumb\);[^}]*background:\s*var\(--ui-power-thumb\);[^}]*transition:\s*left var\(--power-motion\)/);
  assert.match(powerCss, /\.sliderHeader\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*36px minmax\(0, 1fr\) 36px;/);
});

test("the slider dots use evenly spaced zero-to-one positions", async () => {
  const view = await renderSlider();
  try {
    const positions = Array.from(view.container.querySelectorAll("[data-power-dot]"), (dot) => {
      const propsKey = Object.keys(dot).find((key) => key.startsWith("__reactProps$"));
      return propsKey ? dot[propsKey].style["--ui-power-position"] : null;
    });
    assert.deepEqual(positions, ["0", "0.3333333333333333", "0.6666666666666666", "1"]);
    assert.equal(positions.every((position, index) => index === 0 || Number(position) > Number(positions[index - 1])), true);
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
    assert.deepEqual(view.selections, ["auto"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Auto, 1 of 4.");

    const right = await press(control, "ArrowRight");
    assert.equal(right.defaultPrevented, true);
    assert.deepEqual(view.selections, ["auto", "minimal"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Minimal, 2 of 4.");
  } finally {
    await view.unmount();
  }
});

test("the Power announcement uses a one-based position for a middle step", async () => {
  const view = await renderSlider();
  try {
    await press(view.container.querySelector("[aria-label='Power']"), "ArrowRight");
    assert.deepEqual(view.selections, ["medium"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Medium, 3 of 4.");
    assert.equal(view.container.querySelector("[role='status']").getAttribute("aria-live"), "polite");
  } finally {
    await view.unmount();
  }
});

test("the slider selects a step from a pointer release", async () => {
  const view = await renderSlider();
  try {
    const track = view.container.querySelector("[data-power-track]");
    assert.ok(track);
    track.getBoundingClientRect = () => ({ left: 100, width: 200 });
    await React.act(async () => {
      track.dispatchEvent(new DomEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 9, clientX: 200 }));
      track.dispatchEvent(new DomEvent("pointerup", { bubbles: true, cancelable: true, button: 0, pointerId: 9, clientX: 200 }));
    });
    assert.deepEqual(view.selections, ["medium"]);
  } finally {
    await view.unmount();
  }
});

test("Right Arrow wraps from the selected last step to the first step", async () => {
  const view = await renderSlider({ currentStepId: steps[2].id });
  try {
    await press(view.container.querySelector("[aria-label='Power']"), "ArrowRight");
    assert.deepEqual(view.selections, ["auto"]);
    assert.equal(textOf(view.container.querySelector("[role='status']")), "Model Auto, 1 of 4.");
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

test("the model effort list keeps Auto selectable when the selector has no current step", async () => {
  const view = await renderSlider({
    steps: [],
    modelSteps: steps,
    currentStepId: undefined,
    effortLabel: "Auto",
  });
  try {
    const power = view.container.querySelector("[data-model-power-view]");
    assert.ok(power);
    assert.ok(power.querySelector("[data-slider-row]"));
    assert.equal(power.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "auto");
    assert.deepEqual(
      Array.from(power.querySelectorAll("[data-power-dot]"), (dot) => dot.getAttribute("data-step-id")),
      ["auto", "model:minimal", "model:medium", "model:max"],
    );

    await press(power.querySelector("[aria-label='Power']"), "ArrowRight");
    assert.deepEqual(view.selections, ["minimal"]);
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

test("the effort header has no reset control", async () => {
  const view = await renderSlider({ explicitModelOverride: true, effortOverride: true });
  try {
    assert.equal(view.container.querySelector("[data-reset-control]"), null);
    assert.equal(view.container.querySelector("[aria-label='Reset to default']"), null);
  } finally {
    await view.unmount();
  }
});

test("the usage warning shows under the slider only on the max step", async () => {
  const top = steps.find((step) => step.thinkingLevel === "max");
  const view = await renderSlider({ currentStepId: top.id });
  try {
    assert.equal(view.container.querySelector("[data-usage-warning]")?.getAttribute("data-visible"), "true");
  } finally {
    await view.unmount();
  }
  const lower = await renderSlider({ currentStepId: steps[1].id });
  try {
    assert.equal(lower.container.querySelector("[data-usage-warning]")?.getAttribute("data-visible"), "false");
  } finally {
    await lower.unmount();
  }
});

test("usage warning CSS includes 1.1s shimmer playing one time and reduced-motion override", async () => {
  const { readFile } = await import("node:fs/promises");
  const powerCss = await readFile(new URL("./ModelPowerSlider.module.css", import.meta.url), "utf8");

  assert.match(powerCss, /\.usageWarningText\s*\{[^}]*animation:\s*usageWarningShimmer\s+1\.1s\s+ease-out\s+1;/);
  assert.match(powerCss, /@keyframes\s+usageWarningShimmer\s*\{/);
  assert.match(powerCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.usageWarningText\s*\{[^}]*animation:\s*none;/);
});
