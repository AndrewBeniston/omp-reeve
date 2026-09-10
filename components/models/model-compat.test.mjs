import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  effectiveCompat,
  fillEmptyModelFields,
  hasDeepseekCompat,
  setDeepseekCompat,
} = await jiti.import("./model-compat.ts");

test("the DeepSeek toggle writes both compat keys and removes both again", () => {
  const enabled = setDeepseekCompat({ id: "deepseek-chat" }, true);
  assert.equal(hasDeepseekCompat(enabled), true);
  assert.deepEqual(enabled.compat, {
    thinkingFormat: "deepseek",
    requiresReasoningContentOnAssistantMessages: true,
  });

  const disabled = setDeepseekCompat(enabled, false);
  assert.equal(hasDeepseekCompat(disabled), false);
  assert.equal(disabled.compat, undefined);
});

test("turning DeepSeek compat off keeps every other compat key", () => {
  const model = { id: "m", compat: { thinkingFormat: "deepseek", supportsStore: false } };
  assert.deepEqual(setDeepseekCompat(model, false).compat, { supportsStore: false });
});

test("a model compat value overrides the provider value", () => {
  const provider = { compat: { supportsDeveloperRole: false, supportsStore: true } };
  const model = { id: "m", compat: { supportsDeveloperRole: true } };
  assert.deepEqual(effectiveCompat(provider, model), {
    supportsDeveloperRole: true,
    supportsStore: true,
  });
  assert.deepEqual(effectiveCompat({}, { id: "m" }), {});
});

test("the catalog fill writes only the fields the model leaves empty", () => {
  const model = { id: "gpt-x", name: "Kept name", contextWindow: 1000, cost: { input: 9 } };
  const preset = {
    name: "Catalog name",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200000,
    maxTokens: 32000,
    cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
  };

  const filled = fillEmptyModelFields(model, preset);
  assert.equal(filled.model.name, "Kept name");
  assert.equal(filled.model.contextWindow, 1000);
  assert.equal(filled.model.cost.input, 9);
  assert.equal(filled.model.reasoning, true);
  assert.equal(filled.model.maxTokens, 32000);
  assert.deepEqual(filled.model.input, ["text", "image"]);
  assert.deepEqual(filled.model.cost, { input: 9, output: 2, cacheRead: 3, cacheWrite: 4 });
  // reasoning, input, maxTokens, output, cacheRead, cacheWrite.
  assert.equal(filled.appliedCount, 6);
});

test("the catalog fill reports zero when the model already holds every value", () => {
  const model = {
    id: "m",
    name: "n",
    reasoning: true,
    input: ["text"],
    contextWindow: 1,
    maxTokens: 2,
    cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
  };
  const filled = fillEmptyModelFields(model, { name: "other", contextWindow: 9, cost: { input: 8 } });

  assert.equal(filled.appliedCount, 0);
  assert.deepEqual(filled.model, model);
});

test("the catalog fill never mutates the model it received", () => {
  const model = { id: "m" };
  fillEmptyModelFields(model, { name: "Catalog name", cost: { input: 1 } });
  assert.deepEqual(model, { id: "m" });
});
