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

test("falls back to role and current models when the enabled scope is empty", () => {
  const state = buildModelSelectorState({
    registry: [],
    roles: [
      { role: "default", resolved: { provider: "alpha", modelId: "same" } },
      { role: "smol", resolved: { provider: "beta", modelId: "same" } },
      { role: "plan", resolved: { provider: "beta", modelId: "same" } },
    ],
    currentModel: { provider: "beta", modelId: "same" },
    currentThinkingLevel: "high",
  }, label);

  assert.deepEqual(state.modelRowsByProvider.flatMap((group) => group.options.map((option) => `${option.provider}/${option.modelId}`)), [
    "alpha/same",
    "beta/same",
  ]);
  assert.equal(state.modelRowsByProvider.flatMap((group) => group.options).find((option) => option.provider === "beta")?.selected, true);
});

test("shows only visible role models in role order when no enabled scope is configured", () => {
  const state = buildModelSelectorState({
    registry: [
      { provider: "registry", id: "unlisted", name: "Unlisted", thinkingLevels: ["off"] },
      { provider: "beta", id: "current", name: "Current", thinkingLevels: ["off", "low", "high"] },
      { provider: "alpha", id: "default", name: "Default", thinkingLevels: ["medium"] },
      { provider: "beta", id: "smol", name: "Smol", thinkingLevels: ["low"] },
    ],
    roles: [
      { role: "default", hidden: false, resolved: { provider: "alpha", modelId: "default", name: "Default" } },
      { role: "smol", hidden: false, resolved: { provider: "beta", modelId: "smol", name: "Smol" } },
      { role: "slow", hidden: false, resolved: { provider: "alpha", modelId: "default", name: "Default" } },
      { role: "advisor", hidden: true, resolved: { provider: "registry", id: "unlisted", name: "Unlisted" } },
    ],
    currentModel: { provider: "beta", modelId: "current" },
    currentThinkingLevel: "high",
    modelScopeConfigured: false,
  }, label);

  assert.deepEqual(state.models.map(({ provider, modelId }) => `${provider}/${modelId}`), [
    "alpha/default",
    "beta/smol",
    "beta/current",
  ]);
  assert.deepEqual(state.modelRowsByProvider.flatMap((group) => group.options.map((option) => `${option.provider}/${option.modelId}`)), [
    "alpha/default",
    "beta/smol",
    "beta/current",
  ]);
  assert.deepEqual(state.steps.map((step) => step.thinkingLevel), ["off", "low", "high"]);
});

test("shows exactly the scoped registry when an enabled scope is configured", () => {
  const state = buildModelSelectorState({
    registry: [
      { provider: "alpha", id: "allowed", name: "Allowed", thinkingLevels: ["low"] },
      { provider: "beta", id: "same", name: "Other provider", thinkingLevels: ["high"] },
    ],
    roles: [{ role: "default", hidden: false, resolved: { provider: "alpha", modelId: "allowed" } }],
    currentModel: { provider: "beta", modelId: "same" },
    currentThinkingLevel: "high",
    modelScopeConfigured: true,
  }, label);

  assert.deepEqual(state.models.map(({ provider, modelId }) => `${provider}/${modelId}`), [
    "alpha/allowed",
    "beta/same",
  ]);
  assert.deepEqual(state.modelRowsByProvider.flatMap((group) => group.options.map((option) => `${option.provider}/${option.modelId}`)), [
    "alpha/allowed",
    "beta/same",
  ]);
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
