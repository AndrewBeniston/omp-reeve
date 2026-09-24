import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { buildModelSelectorState, INITIAL_MODEL_MENU_STATE, reduceModelMenuState, resetModelOverride } = await createJiti(import.meta.url).import("./index.ts");
const { enLocale } = await createJiti(import.meta.url).import("../i18n/messages/en.ts");
const { resolveVisibleModels } = await createJiti(import.meta.url).import("../model-scope.ts");
const label = (key) => enLocale.messages[key] ?? key;

const registry = [
  { provider: "alpha", id: "same", name: "Alpha", thinkingLevels: ["max", "off", "inherit", "high", "medium", "low", "minimal", "xhigh", "off", "ultra"] },
  { provider: "beta", id: "same", name: "Beta", thinkingLevels: ["medium", "high"] },
  { provider: "alpha", id: "same", name: "Alpha again", thinkingLevels: ["high", "off"] },
];
const roles = [{ role: "default", resolved: { provider: "alpha", modelId: "same" } }];

test("builds unique model and effort selections in OMP order", () => {
  const state = buildModelSelectorState({ registry, roles, currentModel: { provider: "alpha", modelId: "same" }, currentThinkingLevel: "high" }, label);

  assert.deepEqual(state.steps.map((step) => step.thinkingLevel), ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(state.steps.map((step) => step.id), [
    "alpha/same:none", "alpha/same:minimal", "alpha/same:low", "alpha/same:medium",
    "alpha/same:high", "alpha/same:xhigh", "alpha/same:max",
  ]);
  assert.equal(state.steps[0].effortLabel, "None");
  assert.equal(state.steps[0].effort, "none");
  assert.deepEqual(state.steps.map((step) => step.sliderLabel), ["None", "Minimal", "Low", "Medium", "High", "Extra high", "Max"]);
  assert.equal(state.steps[6].effortLabel, "Max");
  assert.equal(state.steps.some((step) => step.effortLabel === "Ultra"), false);
  assert.equal(state.selections.length, 9);
  assert.equal(state.currentStep?.id, "alpha/same:high");
  assert.equal(state.reset, undefined);
});

test("keeps providers distinct when their model ids match", () => {
  const alpha = buildModelSelectorState({ registry, roles, currentModel: { provider: "alpha", modelId: "same" }, currentThinkingLevel: "medium" }, label);
  const beta = buildModelSelectorState({ registry, roles, currentModel: { provider: "beta", modelId: "same" }, currentThinkingLevel: "medium" }, label);

  assert.equal(alpha.currentStep?.id, "alpha/same:medium");
  assert.equal(beta.currentStep?.id, "beta/same:medium");
});

test("names API and subscription routes without creating an unavailable subscription variant", () => {
  const state = buildModelSelectorState({
    registry: [
      { provider: "openai", id: "gpt-example", name: "GPT Example", thinkingLevels: ["medium"] },
      { provider: "openai-codex", id: "gpt-example", name: "GPT Example", thinkingLevels: ["medium"] },
      { provider: "openai", id: "gpt-example-pro", name: "GPT Example Pro", thinkingLevels: ["high"] },
    ],
    roles: [],
    currentModel: { provider: "openai-codex", modelId: "gpt-example" },
    currentThinkingLevel: "medium",
  }, label);

  assert.deepEqual(state.modelsByProvider.map((group) => [group.provider, group.label]), [
    ["openai", "OpenAI API"],
    ["openai-codex", "ChatGPT subscription"],
  ]);
  assert.equal(state.currentRouteLabel, "ChatGPT subscription");
  assert.deepEqual(state.modelsByProvider.find((group) => group.provider === "openai-codex")?.options.map((option) => option.modelId), ["gpt-example"]);
});

test("resolves Default and clears an explicit model override", () => {
  const input = { registry, roles, currentModel: { provider: "beta", modelId: "same" }, currentThinkingLevel: "medium", explicitModelOverride: true };
  const state = buildModelSelectorState(input, label);

  assert.deepEqual(state.defaultRow, {
    label: "Default",
    description: "Recommended set of models",
    model: { provider: "alpha", modelId: "same" },
  });
  assert.deepEqual(state.reset, { model: { provider: "alpha", modelId: "same" }, role: "default" });
  const resetInput = resetModelOverride(input);
  assert.equal(resetInput.explicitModelOverride, false);
  const resetState = buildModelSelectorState(resetInput, label);
  assert.deepEqual(resetState.currentModel, { provider: "alpha", modelId: "same" });
  assert.equal(resetState.reset, undefined);
  assert.equal(resetModelOverride(resetInput), null);
});

test("Default's check follows its resolved effort", () => {
  const pinnedRoles = [{ role: "default", resolved: { provider: "alpha", modelId: "same", thinkingLevel: "high" } }];
  const medium = buildModelSelectorState({ registry, roles: pinnedRoles, currentModel: { provider: "alpha", modelId: "same" }, currentThinkingLevel: "medium" }, label);
  const high = buildModelSelectorState({ registry, roles: pinnedRoles, currentModel: { provider: "alpha", modelId: "same" }, currentThinkingLevel: "high" }, label);

  assert.equal(medium.defaultRowSelected, false);
  assert.equal(high.defaultRowSelected, true);
  assert.equal(high.modelRowsByProvider.find((group) => group.provider === "alpha")?.options[0]?.selectionId, "alpha/same:high");
});

test("uses a scope pattern pin as the current step when thinking is inherited", async () => {
  const scope = await resolveVisibleModels({ getAvailable: () => registry }, ["alpha/same:xhigh"]);
  const state = buildModelSelectorState({ registry, roles, currentModel: { provider: "alpha", modelId: "same" }, currentThinkingLevel: "inherit", thinkingLevelPins: scope.thinkingLevelPins }, label);
  assert.equal(state.currentStep?.id, "alpha/same:xhigh");
});

test("keeps the menu stage and filter in one state transition", () => {
  const opened = reduceModelMenuState(INITIAL_MODEL_MENU_STATE, { type: "toggle" });
  assert.deepEqual(opened, { open: true, submenu: null, filter: "" });
  const filtered = reduceModelMenuState(
    reduceModelMenuState(opened, { type: "submenu", value: "model" }),
    { type: "filter", value: "opus" },
  );
  assert.deepEqual(filtered, { open: true, submenu: "model", filter: "opus" });
  assert.deepEqual(reduceModelMenuState(filtered, { type: "toggle" }), INITIAL_MODEL_MENU_STATE);
});
