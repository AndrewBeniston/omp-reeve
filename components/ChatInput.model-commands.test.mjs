import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { DomEvent, React, click, domWindow, mount, settle, textOf } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { previousModelNameForWarning } = await jiti.import("../lib/model-selector/index.ts");
const { buildModelCommandSections, rememberModelConfiguration } = await jiti.import("../lib/model-selector/commands.ts");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const { useAgentSession } = await jiti.import("../hooks/useAgentSession.ts");
const { enLocale } = await jiti.import("../lib/i18n/messages/en.ts");
const { interpolateMessage } = await jiti.import("../lib/i18n/format.ts");
const h = React.createElement;
globalThis.Element.prototype.scrollIntoView ??= () => {};
const choose = async (option) => React.act(async () => {
  option.dispatchEvent(new DomEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
});

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

test("the model and reasoning commands update the Composer chip", async () => {
  domWindow.localStorage.removeItem("reeve-recent-model-configurations");
  const ref = React.createRef();
  const calls = [];
  function Harness() {
    const [model, setModel] = React.useState({ provider: "alpha", modelId: "first" });
    const [thinkingLevel, setThinkingLevel] = React.useState("medium");
    return h(I18nProvider, null, h(ChatInput, {
      ref, onSend() {}, onAbort() {}, isStreaming: false,
      model, thinkingLevel,
      modelList: [
        { provider: "alpha", id: "first", name: "First Model" },
        { provider: "beta", id: "second", name: "Second Model" },
      ],
      availableThinkingLevels: ["medium", "high"],
      onModelChange: async (provider, modelId) => { calls.push(`model:${provider}/${modelId}`); setModel({ provider, modelId }); },
      onThinkingLevelChange: async (level) => { calls.push(`reasoning:${level}`); setThinkingLevel(level); },
    }));
  }
  const view = await mount(h(Harness));
  try {
    await React.act(async () => { ref.current.insertText("/model "); });
    await settle();
    const sections = view.container.querySelector("[data-composer-autocomplete]")?.querySelectorAll("section") ?? [];
    assert.deepEqual(sections.map((section) => section.getAttribute("aria-label")), ["Recent configurations", "Matching models"]);
    const second = Array.from(sections[1].querySelectorAll("[role='option']"))
      .find((option) => textOf(option).includes("Second Model"));
    assert.ok(second);
    await choose(second);
    assert.deepEqual(calls, ["model:beta/second"]);
    assert.match(textOf(view.container.querySelector("[aria-label='Model settings']")), /Second Model/);

    await React.act(async () => { ref.current.insertText("/reasoning "); });
    await settle();
    const reasoning = Array.from(view.container.querySelector("[data-composer-autocomplete]")?.querySelectorAll("[role='option']") ?? [])
      .find((option) => textOf(option).includes("High"));
    assert.ok(reasoning);
    await choose(reasoning);
    assert.deepEqual(calls, ["model:beta/second", "reasoning:high"]);
    assert.match(textOf(view.container.querySelector("[aria-label='Model settings']")), /High/);
  } finally {
    await view.unmount();
  }
});

test("the compact Add menu omits model commands and preserves a message draft", async () => {
  domWindow.localStorage.removeItem("reeve-recent-model-configurations");
  const ref = React.createRef();
  const picks = [];
  const sent = [];
  const view = await mount(h(I18nProvider, null, h(ChatInput, {
    ref, onSend: (message) => sent.push(message), onAbort() {}, isStreaming: false,
    model: { provider: "alpha", modelId: "first" }, thinkingLevel: "medium",
    modelList: [
      { provider: "alpha", id: "first", name: "First Model" },
      { provider: "beta", id: "second", name: "Second Model" },
    ],
    onModelChange: (provider, modelId) => picks.push(`${provider}/${modelId}`),
  })));
  try {
    view.container.querySelector("form").getBoundingClientRect = () => ({ top: 500, left: 20, width: 600, height: 120 });
    await React.act(async () => { ref.current.insertText("Keep this draft"); });
    await click(view.container.querySelector("[aria-label='Add']"));
    const command = (prefix) => Array.from(domWindow.document.body.querySelectorAll("[role='menuitem']"))
      .find((item) => textOf(item).startsWith(prefix));
    assert.equal(command("Model"), undefined);
    assert.deepEqual(picks, []);
    await React.act(async () => {
      view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(sent, ["Keep this draft"]);
  } finally {
    await view.unmount();
  }
});

async function mountModelSession(initialMessages, failingCommand = null) {
  const originalFetch = globalThis.fetch;
  let currentModel = { provider: "alpha", modelId: "first" };
  let currentEffort = "medium";
  let latest;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.startsWith("/api/models")) return {
      ok: true, status: 200,
      json: async () => ({
        models: { "alpha:first": "First Model", "beta:second": "Second Model" },
        modelList: [
          { provider: "alpha", id: "first", name: "First Model" },
          { provider: "beta", id: "second", name: "Second Model" },
        ],
        defaultModel: currentModel, roles: [],
      }),
    };
    if (path.startsWith("/api/settings")) return { ok: true, status: 200, json: async () => ({ fields: [] }) };
    if (path === "/api/sessions/test-session/state") return {
      ok: true, status: 200, json: async () => ({ running: false }),
    };
    if (path.startsWith("/api/sessions/test-session?")) return {
      ok: true, status: 200,
      json: async () => ({
        sessionId: "test-session", leafId: null, tree: [], filePath: "/tmp/test-session.jsonl", totalActiveMs: 0,
        context: { messages: initialMessages, entryIds: [], model: currentModel, thinkingLevel: currentEffort },
      }),
    };
    if (path === "/api/agent/test-session" && options.method === "POST") {
      const command = JSON.parse(options.body);
      if (command.type === failingCommand) return {
        ok: false, status: 500, json: async () => ({ error: "Rejected for test" }),
      };
      if (command.type === "set_model") currentModel = { provider: command.provider, modelId: command.modelId };
      if (command.type === "set_thinking_level") currentEffort = command.level;
      return { ok: true, status: 200, json: async () => ({ success: true, data: { fastModeEnabled: false } }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  function Harness() {
    latest = useAgentSession({
      session: { id: "test-session", cwd: "/tmp" }, newSessionCwd: null,
      translate: (key, params) => interpolateMessage(enLocale.messages[key] ?? key, params),
    });
    return h("div");
  }
  const view = await mount(h(Harness));
  await settle();
  return { view, get session() { return latest; }, restore() { globalThis.fetch = originalFetch; } };
}

test("a completed model change warns after a turn, while an effort change does not", async () => {
  const mounted = await mountModelSession([{ role: "user", content: "Hello" }]);
  try {
    assert.equal(mounted.session.messages.length, 1);
    await React.act(async () => { await mounted.session.handleModelChange("beta", "second"); });
    assert.deepEqual(mounted.session.notices.map(({ type, message }) => ({ type, message })), [{
      type: "info",
      message: "Changing models mid-conversation will degrade performance. Start a new session for the best experience, or switch back to First Model.",
    }]);
    await React.act(async () => { await mounted.session.handleThinkingLevelChange("high"); });
    assert.equal(mounted.session.notices.length, 1);
  } finally {
    await mounted.view.unmount();
    mounted.restore();
  }
});

test("an empty Session has no model warning", async () => {
  const mounted = await mountModelSession([]);
  try {
    await React.act(async () => { await mounted.session.handleModelChange("beta", "second"); });
    assert.deepEqual(mounted.session.notices, []);
  } finally {
    await mounted.view.unmount();
    mounted.restore();
  }
});

test("failed model and effort updates show the generic danger notice", async () => {
  for (const command of ["set_model", "set_thinking_level"]) {
    const mounted = await mountModelSession([{ role: "user", content: "Hello" }], command);
    try {
      await React.act(async () => {
        if (command === "set_model") await mounted.session.handleModelChange("beta", "second");
        else await mounted.session.handleThinkingLevelChange("high");
      });
      assert.deepEqual(mounted.session.notices.map(({ type, message }) => ({ type, message })), [{
        type: "error", message: "Couldn't update model settings",
      }]);
    } finally {
      await mounted.view.unmount();
      mounted.restore();
    }
  }
});

test("the slash menu lists /model with title Model and /reasoning with title Reasoning", async () => {
  const ref = React.createRef();
  const view = await mount(h(I18nProvider, null, h(ChatInput, {
    ref, onSend() {}, onAbort() {}, isStreaming: false,
    model: { provider: "alpha", modelId: "first" }, thinkingLevel: "medium",
    modelList: [
      { provider: "alpha", id: "first", name: "First Model" },
      { provider: "beta", id: "second", name: "Second Model" },
    ],
  })));
  try {
    await React.act(async () => { ref.current.insertText("/"); });
    await settle();
    const options = Array.from(view.container.querySelectorAll("[role=option]"));
    const modelOption = options.find((opt) => textOf(opt).includes("Model"));
    assert.ok(modelOption, "Model option should be present");
    assert.match(textOf(modelOption), /^Model/);

    const reasoningOption = options.find((opt) => textOf(opt).includes("Reasoning"));
    assert.ok(reasoningOption, "Reasoning option should be present");
    assert.match(textOf(reasoningOption), /^Reasoning/);
  } finally {
    await view.unmount();
  }
});
