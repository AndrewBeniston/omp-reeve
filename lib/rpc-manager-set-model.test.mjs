import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");

// Stand-in for the SDK's ModelRegistry. `find` mirrors the real (provider, modelId)
// signature and fails the same way the SDK does when it is handed a single pre-joined
// "provider/modelId" selector — the regression that made the model picker unusable.
function createRegistry({ models, appearAfterRefresh = false }) {
  const findCalls = [];
  let refreshes = 0;
  let visible = appearAfterRefresh ? [] : models;

  return {
    findCalls,
    refreshCount: () => refreshes,
    registry: {
      find(...args) {
        findCalls.push(args);
        const [provider, modelId] = args;
        if (typeof modelId !== "string") {
          throw new TypeError("undefined is not an object (evaluating 'modelId.trim')");
        }
        const wantProvider = provider.trim().toLowerCase();
        const wantModel = modelId.trim().toLowerCase();
        return visible.find(
          (model) => model.provider.toLowerCase() === wantProvider && model.id.toLowerCase() === wantModel,
        );
      },
      getAll: () => models,
      getAvailable: () => visible,
      async refresh() {
        refreshes += 1;
        visible = models;
      },
    },
  };
}

function createWrapper(modelRegistry) {
  const setModelCalls = [];
  const fastModeCalls = [];
  const cycleThinkingCalls = [];
  let fastModeEnabled = false;
  const inner = {
    sessionId: "test-session",
    modelRegistry,
    async setModel(model, role) {
      setModelCalls.push([model, role]);
    },
    setFastMode(enabled) {
      fastModeCalls.push(enabled);
      fastModeEnabled = enabled;
      return true;
    },
    isFastModeEnabled() {
      return fastModeEnabled;
    },
    cycleThinkingLevel() {
      cycleThinkingCalls.push("cycle");
      return "medium";
    },
  };
  const eventBus = { on: () => () => {}, off: () => {}, emit: () => {} };
  return { wrapper: new AgentSessionWrapper(inner, eventBus), setModelCalls, fastModeCalls, cycleThinkingCalls };
}

test("set_model looks the model up with (provider, modelId), not a joined selector", async () => {
  const { registry, findCalls } = createRegistry({ models: [{ provider: "openai", id: "gpt-5" }] });
  const { wrapper, setModelCalls } = createWrapper(registry);

  const result = await wrapper.send({ type: "set_model", provider: "openai", modelId: "gpt-5" });

  assert.deepEqual(findCalls, [["openai", "gpt-5"]]);
  assert.deepEqual(result, { id: "gpt-5", provider: "openai", fastModeAvailable: true, fastModeEnabled: false });
  assert.deepEqual(setModelCalls, [[{ provider: "openai", id: "gpt-5" }, undefined]]);
});

test("set_model retries with both arguments after an offline refresh", async () => {
  const { registry, findCalls, refreshCount } = createRegistry({
    models: [{ provider: "litellm", id: "claude-opus-5" }],
    appearAfterRefresh: true,
  });
  const { wrapper } = createWrapper(registry);

  const result = await wrapper.send({ type: "set_model", provider: "litellm", modelId: "claude-opus-5" });

  assert.equal(refreshCount(), 1);
  assert.deepEqual(findCalls, [
    ["litellm", "claude-opus-5"],
    ["litellm", "claude-opus-5"],
  ]);
  assert.deepEqual(result, { id: "claude-opus-5", provider: "litellm", fastModeAvailable: false, fastModeEnabled: false });
});

test("set_model reports an unknown model instead of surfacing an SDK TypeError", async () => {
  const { registry } = createRegistry({ models: [{ provider: "openai", id: "gpt-5" }] });
  const { wrapper } = createWrapper(registry);

  await assert.rejects(
    wrapper.send({ type: "set_model", provider: "openai", modelId: "does-not-exist" }),
    /Model not found: openai\/does-not-exist/,
  );
});

test("set_model passes the role through when one is given", async () => {
  const { registry } = createRegistry({ models: [{ provider: "openai", id: "gpt-5" }] });
  const { wrapper, setModelCalls } = createWrapper(registry);

  const result = await wrapper.send({ type: "set_model", provider: "openai", modelId: "gpt-5", role: "plan" });

  assert.deepEqual(result, { id: "gpt-5", provider: "openai", role: "plan", fastModeAvailable: true, fastModeEnabled: false });
  assert.deepEqual(setModelCalls, [[{ provider: "openai", id: "gpt-5" }, "plan"]]);
});

test("set_fast_mode changes the current model family's service speed", async () => {
  const { registry } = createRegistry({ models: [{ provider: "openai", id: "gpt-5" }] });
  const { wrapper, fastModeCalls } = createWrapper(registry);

  const result = await wrapper.send({ type: "set_fast_mode", enabled: true });

  assert.deepEqual(fastModeCalls, [true]);
  assert.deepEqual(result, { supported: true, enabled: true });
});

test("cycle_thinking_level uses OMP's model-aware effort cycle", async () => {
  const { registry } = createRegistry({ models: [{ provider: "openai", id: "gpt-5" }] });
  const { wrapper, cycleThinkingCalls } = createWrapper(registry);

  const result = await wrapper.send({ type: "cycle_thinking_level" });

  assert.deepEqual(cycleThinkingCalls, ["cycle"]);
  assert.deepEqual(result, { supported: true, level: "medium" });
});
