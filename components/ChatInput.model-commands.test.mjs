import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { previousModelNameForWarning } = await jiti.import("../lib/model-selector/index.ts");
const { buildModelCommandSections, rememberModelConfiguration } = await jiti.import("../lib/model-selector/commands.ts");

test("a model change after a turn names the model being left", () => {
  const current = { provider: "alpha", modelId: "first" };
  const next = { provider: "beta", modelId: "second" };
  const registry = [{ provider: "alpha", id: "first", name: "First Model" }];

  assert.equal(previousModelNameForWarning(current, next, true, registry), "First Model");
  assert.equal(previousModelNameForWarning(current, next, false, registry), null);
  assert.equal(previousModelNameForWarning(current, current, true, registry), null);
});

test("the model command lists recent configurations before catalog matches", () => {
  const models = [
    { provider: "alpha", modelId: "first", name: "First Model" },
    { provider: "beta", modelId: "second", name: "Second Model" },
  ];
  const recent = rememberModelConfiguration([], { model: models[1], thinkingLevel: "high" });
  const result = buildModelCommandSections(models, recent, "", (key) => ({
    "composer.modelSlashCommand.recent.title": "Recent configurations",
    "composer.modelSlashCommand.matchingModels.title": "Matching models",
    "chat.effortHigh": "High",
  })[key] ?? key);

  assert.deepEqual(result.sections.map(({ title }) => title), ["Recent configurations", "Matching models"]);
  assert.equal(result.sections[0].items[0].label, "Second Model");
  assert.deepEqual(result.choices.get(result.sections[0].items[0].id), {
    model: { provider: "beta", modelId: "second" }, thinkingLevel: "high",
  });
  assert.deepEqual(result.sections[1].items.map(({ label }) => label), ["First Model", "Second Model"]);
});
