import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { DomEvent, React, click, domDocument, mount, press, settle, textOf, focused, typeInto } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const h = React.createElement;
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

async function mountComposer(props = {}) {
  const view = await mount(h(I18nProvider, null, h(ChatInput, {
    onSend() {},
    onAbort() {},
    isStreaming: false,
    ...props,
  })));
  await settle();
  view.container.querySelector("form").getBoundingClientRect = () => ({ top: 500, left: 20, width: 600, height: 120 });
  return view;
}

async function submitCommand(view, composerRef, command) {
  const editor = view.container.querySelector("[data-composer-editor]");
  assert.ok(editor, "the Composer renders an editor");
  await React.act(async () => { composerRef.current.insertText(`${command} `); });
  await settle();
  const form = view.container.querySelector("form");
  assert.ok(form, "the Composer renders a form");
  await React.act(async () => {
    form.dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

test("a new chat without a project shows the project selection message and does not send", async () => {
  const ref = React.createRef();
  const sent = [];
  const view = await mountComposer({
    ref,
    projectRequired: true,
    onSend: (message) => sent.push(message),
  });

  await submitCommand(view, ref, "Explain this project");

  assert.deepEqual(sent, []);
  assert.match(document.body.textContent, /Unable to send message/);
  assert.match(document.body.textContent, /Select a project to continue/);
  await view.unmount();
});

function triggerFor(container, label) {
  const trigger = container.querySelector(`[aria-label='${label}']`);
  assert.ok(trigger, `the composer renders the ${label} control`);
  if (label === "Model settings") {
    trigger.getBoundingClientRect = () => ({ top: 500, left: 20, width: 180, height: 24 });
  }
  return trigger;
}

function itemsOf(container) {
  return container.querySelectorAll("[role='menuitem'],[role='menuitemradio']");
}

function menuItem(label, menu = document.body) {
  const item = Array.from(menu.querySelectorAll("[role='menuitem'],[role='menuitemradio']"))
    .find(candidate => textOf(candidate).startsWith(label));
  assert.ok(item, `the menu contains ${label}`);
  return item;
}

function addMenu(label) {
  return document.body.querySelector(`[role='menu'][aria-label='${label}']`);
}

const modelProps = {
  model: { provider: "openai", modelId: "gpt-5.4" },
  modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
  onModelChange() {},
};

test("the model menu opens on the OMP power steps", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["max", "off", "high", "medium", "ultra"],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();

  const menu = document.body.querySelector("[role='menu'][aria-label='Model settings']");
  assert.ok(menu);
  assert.equal(menu.querySelector("[data-model-menu-row='effort']"), null);
  assert.equal(menu.querySelector("[aria-label='Select model']")?.getAttribute("aria-haspopup"), "menu");
  const dots = menu.querySelectorAll("[data-power-dot]");
  // The first position is Auto. It lets OMP pick the effort.
    assert.deepEqual(dots.map((dot) => dot.getAttribute("data-effort")), ["auto", "none", "medium", "high", "max"]);
  assert.deepEqual(dots.map((dot) => dot.getAttribute("data-filled")), ["true", "true", "true", "false", "false"]);
  assert.equal(menu.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "high");
  await click(menu.querySelector("[aria-label='Select model']"));
  await settle();
  assert.ok(document.body.querySelector("[data-model-submenu='model']"));

  await view.unmount();
});

test("the model menu switches between the power and flat model stages", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "medium",
    availableThinkingLevels: ["off", "medium", "high"],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const power = document.body.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.equal(power.querySelector("[data-stage-panel='top']"), null);
  assert.equal(power.querySelector("[data-stage-panel='slider']")?.getAttribute("data-stage-transition"), "enter");

  await click(document.body.querySelector("[aria-label='Select model']"));
  await settle();
  const list = document.body.querySelector("[data-model-list]");
  assert.equal(list?.getAttribute("data-stage-transition"), "enter");
  await view.unmount();
});

test("the model menu stage CSS records the reference timings", async () => {
  const { readFile } = await import("node:fs/promises");
  const [composer, slider, list] = await Promise.all([
    readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8"),
    readFile(new URL("./chat/ModelPowerSlider.module.css", import.meta.url), "utf8"),
    readFile(new URL("./chat/ModelList.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(composer, /transition:\s*max-height 0\.32s/);
  assert.match(composer, /\.modelMenuFooter\s*\{[^}]*border-top:[^;]*;[^}]*padding:\s*8px;/s);
  assert.match(slider, /animation-duration:\s*0\.32s, 0\.2s/);
  assert.match(slider, /animation-delay:\s*56ms, 56ms/);
  assert.match(slider, /data-stage-panel="slider"\]\[data-stage-transition="leave"\][\s\S]*?animation-delay:\s*16ms/);
  assert.match(slider, /translate[XY]\(-?10px\)/);
  assert.match(list, /stageListSlideEnter 0\.32s[^;]*40ms/);
  assert.match(list, /stageListFadeEnter 0\.2s[^;]*40ms/);
  assert.match(list, /translateX\(-?10px\)/);
  assert.match(slider, /prefers-reduced-motion:[\s\S]*?animation:\s*none !important/);
  assert.match(list, /prefers-reduced-motion:[\s\S]*?animation:\s*none !important/);
});

test("dragging the power thumb previews steps and selects one effort on release", async () => {
  const picked = [];
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "low",
    availableThinkingLevels: ["off", "low", "medium", "high", "max"],
    onThinkingLevelChange: (level) => picked.push(level),
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const track = document.body.querySelector("[data-power-track]");
  assert.ok(track);
  track.getBoundingClientRect = () => ({ left: 100, width: 200 });
  const pointer = async (type, clientX) => React.act(async () => {
    track.dispatchEvent(new DomEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 4,
      clientX,
    }));
  });

  await pointer("pointerdown", 150);
  await pointer("pointermove", 260);
  assert.equal(document.body.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "high");
  await pointer("pointermove", 280);
  assert.deepEqual(picked, []);
  assert.equal(document.body.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "max");
  assert.deepEqual(
    document.body.querySelectorAll("[data-power-dot]").map((dot) => dot.getAttribute("data-filled")),
    ["true", "true", "true", "true", "true", "false"],
  );
  await pointer("pointerup", 280);
  await pointer("pointerup", 280);
  assert.deepEqual(picked, ["max"]);
  await view.unmount();
});

test("the model control preserves the route when providers share a model name", async () => {
  const picked = [];
  const modelList = [
    { provider: "openai", id: "gpt-example", name: "GPT Example" },
    { provider: "openai-codex", id: "gpt-example", name: "GPT Example" },
    { provider: "openai", id: "gpt-example-pro", name: "GPT Example Pro" },
  ];
  const props = {
    model: { provider: "openai-codex", modelId: "gpt-example" },
    modelList,
    thinkingLevel: "medium",
    modelThinkingLevels: {
      "openai:gpt-example": ["medium"],
      "openai-codex:gpt-example": ["medium"],
      "openai:gpt-example-pro": ["high"],
    },
    onModelChange: (provider, modelId) => picked.push({ provider, modelId }),
  };
  const view = await mountComposer(props);
  const trigger = triggerFor(view.container, "Model settings");
  assert.match(trigger.getAttribute("title"), /ChatGPT subscription.*GPT Example/);

  await click(trigger);
  await settle();
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  const menu = document.body.querySelector("[data-model-submenu='model']");
  assert.deepEqual([...menu.querySelectorAll("[data-model-provider]")].map((heading) => heading.textContent), ["OpenAI API", "ChatGPT subscription"]);
  assert.deepEqual(itemsOf(menu).map(textOf), ["GPT Example", "GPT Example Pro", "GPT Example"]);
  const api = itemsOf(menu).find((item) => item.getAttribute("data-selection-id") === "openai/gpt-example:medium");
  const subscription = itemsOf(menu).find((item) => item.getAttribute("data-selection-id") === "openai-codex/gpt-example:medium");
  assert.equal(api.getAttribute("aria-checked"), "false");
  assert.equal(subscription.getAttribute("aria-checked"), "true");
  assert.equal(api.getAttribute("aria-label"), "OpenAI API, GPT Example");
  assert.equal(subscription.getAttribute("aria-label"), "ChatGPT subscription, GPT Example");

  await click(api);
  await settle();
  assert.deepEqual(picked, [{ provider: "openai", modelId: "gpt-example" }]);

  await view.render(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false,
    ...props, model: { provider: "openai", modelId: "gpt-example" },
  })));
  await settle();
  assert.match(triggerFor(view.container, "Model settings").getAttribute("title"), /OpenAI API.*GPT Example/);
  await view.unmount();
});

test("the model list starts with Default and selects OMP's default role", async () => {
  const roles = [];
  const view = await mountComposer({
    model: { provider: "openai", modelId: "gpt-example" },
    modelList: [
      { provider: "openai", id: "gpt-example", name: "GPT Example" },
      { provider: "anthropic", id: "claude-example", name: "Claude Example" },
    ],
    modelRoles: [{
      role: "default", name: "Default", hidden: false,
      resolved: { provider: "anthropic", modelId: "claude-example", thinkingLevel: "high" },
    }],
    onModelChange() {},
    onRoleModelChange: (role) => roles.push(role),
  });

  await click(triggerFor(view.container, "Model settings"));
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  const menu = document.body.querySelector("[data-model-submenu='model']");
  assert.ok(menu);
  assert.equal(textOf(menu.querySelector("[data-model-list-heading]")), "Select model");
  const first = itemsOf(menu)[0];
  assert.match(textOf(first), /^DefaultRecommended set of models$/);
  await click(first);
  assert.deepEqual(roles, ["default"]);
  await view.unmount();
});

test("Default uses the configured model when no role callback is available", async () => {
  const picked = [];
  const view = await mountComposer({
    model: { provider: "openai", modelId: "gpt-example" },
    modelList: [
      { provider: "openai", id: "gpt-example", name: "GPT Example" },
      { provider: "anthropic", id: "claude-example", name: "Claude Example" },
    ],
    modelRoles: [{
      role: "default", name: "Default", hidden: false,
      resolved: { provider: "anthropic", modelId: "claude-example" },
    }],
    onModelChange: (provider, modelId) => picked.push({ provider, modelId }),
  });

  await click(triggerFor(view.container, "Model settings"));
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  await click(itemsOf(document.body.querySelector("[data-model-submenu='model']"))[0]);

  assert.deepEqual(picked, [{ provider: "anthropic", modelId: "claude-example" }]);
  await view.unmount();
});

test("the model list check follows provider, model id, and effort", async () => {
  const props = {
    model: { provider: "openai-codex", modelId: "gpt-example" },
    modelList: [
      { provider: "openai", id: "gpt-example", name: "GPT Example" },
      { provider: "openai-codex", id: "gpt-example", name: "GPT Example" },
    ],
    modelThinkingLevels: {
      "openai:gpt-example": ["medium", "high"],
      "openai-codex:gpt-example": ["medium", "high"],
    },
    thinkingLevel: "high",
    onModelChange() {},
  };
  const view = await mountComposer(props);
  await click(triggerFor(view.container, "Model settings"));
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  const menu = document.body.querySelector("[data-model-submenu='model']");
  const api = itemsOf(menu).find((item) => item.getAttribute("data-selection-id") === "openai/gpt-example:high");
  const subscription = itemsOf(menu).find((item) => item.getAttribute("data-selection-id") === "openai-codex/gpt-example:high");
  assert.equal(api.getAttribute("aria-checked"), "false");
  assert.equal(subscription.getAttribute("aria-checked"), "true");
  assert.equal(subscription.getAttribute("data-selection-id"), "openai-codex/gpt-example:high");

  await view.render(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false,
    ...props, thinkingLevel: "auto",
  })));
  await settle();
  assert.equal(itemsOf(document.body.querySelector("[data-model-submenu='model']"))[1].getAttribute("aria-checked"), "true");
  await view.unmount();
});

test("the model control preserves provider-qualified names when the model list is absent", async () => {
  const picked = [];
  const view = await mountComposer({
    model: { provider: "openai-codex", modelId: "gpt-example" },
    modelNames: {
      "openai:gpt-example": "GPT Example",
      "openai-codex:gpt-example": "GPT Example",
    },
    onModelChange: (provider, modelId) => picked.push({ provider, modelId }),
  });
  await click(triggerFor(view.container, "Model settings"));
  await settle();
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  const api = itemsOf(document.body.querySelector("[data-model-submenu='model']"))[0];
  await click(api);
  assert.deepEqual(picked, [{ provider: "openai", modelId: "gpt-example" }]);
  await view.unmount();
});

test("the Add menu collects command arguments separately from the existing draft", async () => {
  const ref = React.createRef();
  const sent = [];
  const view = await mountComposer({ ref, onSend: text => sent.push(text),
    slashCommands: [{ name: "goal", source: "extension", description: "Set a goal", icon: "goal" }],
  });
  await React.act(async () => { ref.current.insertText("Keep this draft"); });
  await click(triggerFor(view.container, "Add files and more"));
  const goal = Array.from(document.body.querySelectorAll("[role='menuitem']"))
    .find(button => textOf(button).startsWith("Goal"));
  assert.ok(goal);
  await click(goal);
  const dialog = domDocument.querySelector("[role='dialog']");
  assert.ok(dialog);
  await settle();
  assert.equal(focused(), dialog.querySelector("input"), "the dialog owns focus after the Add menu closes");
  await typeInto(dialog.querySelector("input"), "Separate objective");
  await React.act(async () => { dialog.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true })); });
  assert.deepEqual(sent, ["/goal Separate objective"]);
  const form = view.container.querySelector("form");
  await React.act(async () => {
    form.dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(sent, ["/goal Separate objective", "Keep this draft"]);
  await view.unmount();
});

test("opening Add loads OMP commands in a new chat without typing a slash", async () => {
  let loads = 0;
  const view = await mountComposer({ draftKey: "new:/tmp/add-loader-test", onLoadSlashCommands: async () => { loads++; return []; } });
  assert.equal(loads, 0);
  await click(triggerFor(view.container, "Add files and more"));
  assert.equal(loads, 1);
  await view.unmount();
});

test("slash submission executes Compact without sending a message", async () => {
  const ref = React.createRef();
  const commands = [];
  const sent = [];
  const view = await mountComposer({ ref,
    onBuiltinCommand: async command => { commands.push(command); return { handled: true }; },
    onSend: text => sent.push(text),
  });
  await React.act(async () => { ref.current.insertText("/compact"); });
  await settle();
  await React.act(async () => {
    view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
  assert.deepEqual(commands, ["/compact"]);
  assert.deepEqual(sent, []);
  await view.unmount();
});

test("slash submission keeps the Name draft after an error", async () => {
  const ref = React.createRef();
  const commands = [];
  const sent = [];
  const view = await mountComposer({ ref, onSend: text => sent.push(text),
    onBuiltinCommand: async command => {
      commands.push(command);
      return commands.length === 1 ? { handled: true, error: "Temporary failure" } : { handled: true };
    },
  });
  await React.act(async () => { ref.current.insertText("/name Dedicated title"); });
  const submit = async () => {
    await React.act(async () => {
      view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
  };
  await submit();
  assert.deepEqual(commands, ["/name Dedicated title"]);
  assert.equal(view.container.querySelector("[data-composer-editor]").getAttribute("data-empty"), "false");
  assert.deepEqual(sent, []);
  await submit();
  assert.deepEqual(commands, ["/name Dedicated title", "/name Dedicated title"]);
  assert.equal(view.container.querySelector("[data-composer-editor]").getAttribute("data-empty"), "true");
  assert.deepEqual(sent, []);
  await view.unmount();
});

test("Select files returns keyboard focus to the composer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: [], skills: [], packages: [] }) });
  let view;
  try {
    view = await mountComposer({ cwd: "/tmp", onLoadSlashCommands: async () => [] });
    await click(triggerFor(view.container, "Add files and more"));
    await click(menuItem("Select files"));
    await settle();
    assert.notEqual(focused(), triggerFor(view.container, "Add files and more"));
    assert.ok(view.container.querySelector("[data-composer-editor]").contains(focused()));
  } finally { await view?.unmount(); globalThis.fetch = originalFetch; }
});

test("native attachment selection adds every chosen path as a row and preserves the draft", async () => {
  const originalBridge = globalThis.ompDesktop;
  const originalFetch = globalThis.fetch;
  const selections = [
    { path: "/tmp/notes.md", issuedAt: 123, signature: "a".repeat(64), kind: "file" },
    { path: "/tmp/folder with space", issuedAt: 123, signature: "b".repeat(64), kind: "folder" },
  ];
  globalThis.ompDesktop = { selectAttachmentsWithCapabilities: async () => selections };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: [], skills: [], packages: [] }) });
  const ref = React.createRef();
  const sent = [];
  let view;
  try {
    view = await mountComposer({ ref, cwd: "/tmp", onSend: (value, images, attachments) => sent.push({ value, images, attachments }), onLoadSlashCommands: async () => [] });
    await React.act(async () => { ref.current.insertText("See these"); });
    await settle();
    await click(triggerFor(view.container, "Add files and more"));
    await click(menuItem("Select files"));
    await settle();
    const rows = document.body.querySelector("[role='list'][aria-label='Local attachments']")?.querySelectorAll("[role='listitem']") ?? [];
    assert.equal(rows.length, 2);
    assert.match(textOf(rows[0]), /notes\.md.*File/);
    assert.match(textOf(rows[1]), /folder with space.*Folder/);
    await React.act(async () => {
      view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].value, "See these");
    assert.equal(sent[0].images, undefined);
    assert.deepEqual(sent[0].attachments.map(({ selection }) => selection), selections.map(({ path, issuedAt, signature }) => ({ path, issuedAt, signature })));
  } finally {
    await view?.unmount(); globalThis.ompDesktop = originalBridge; globalThis.fetch = originalFetch;
  }
});

test("the Add menu opens Goal arguments before sending a complete command", async () => {
  const ref = React.createRef();
  const sent = [];
  const view = await mountComposer({ ref, onSend: text => sent.push(text),
    slashCommands: [{ name: "goal", source: "extension", subcommands: [{ name: "status", description: "Show status" }] }],
  });
  await React.act(async () => { ref.current.insertText("Please use "); });
  await click(triggerFor(view.container, "Add files and more"));
  await click(menuItem("Goal"));
  await settle();
  assert.equal(sent.length, 0);
  const dialog = domDocument.querySelector("[role='dialog']");
  assert.ok(dialog);
  await typeInto(dialog.querySelector("input"), "status");
  await React.act(async () => { dialog.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true })); });
  assert.deepEqual(sent, ["/goal status"]);
  await React.act(async () => {
    view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(sent, ["/goal status", "Please use"]);
  await view.unmount();
});

test("the model menu shows supported power steps beside Speed and Advanced", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["low", "medium", "high", "xhigh", "max"],
    fastModeAvailable: true,
    onThinkingLevelChange() {},
  });

  const trigger = triggerFor(view.container, "Model settings");
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  await click(trigger);
  await settle();

  const menu = document.body.querySelector("[role='menu']");
  assert.ok(menu, "the model menu mounts");
  assert.equal(menu.getAttribute("aria-label"), "Model settings");
  assert.deepEqual(
    ["model", "speed", "advanced"].map((row) => {
      const item = menu.querySelector(`[data-model-menu-row='${row}']`);
      assert.ok(item, `the model menu contains the ${row} row`);
      return item.getAttribute("aria-haspopup");
    }),
    ["menu", "menu", "menu"],
  );
  assert.equal(menu.querySelector("[data-model-menu-row='effort']"), null);
  assert.deepEqual(menu.querySelectorAll("[data-power-dot]").map((dot) => dot.getAttribute("data-effort")), ["auto", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(menu.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "high");
  await view.unmount();
});

test("a large model menu renders provider groups with a filter", async () => {
  const view = await mountComposer({
    model: { provider: "openai", modelId: "model-0" },
    modelList: Array.from({ length: 9 }, (_, index) => ({
      provider: "openai",
      id: `model-${index}`,
      name: `Model ${index}`,
    })),
    onModelChange() {},
  });
  await click(triggerFor(view.container, "Model settings"));
  await settle();
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  assert.equal(itemsOf(document.body.querySelector("[data-model-list-scroller]")).length, 9);
  assert.equal(document.body.querySelector("input[aria-label='Search models']") != null, true);
  assert.deepEqual([...document.body.querySelectorAll("[data-model-provider]")].map((heading) => heading.textContent), ["OpenAI API"]);
  const search = document.body.querySelector("[data-model-search]");
  await typeInto(search, "Model 4");
  await settle();
  assert.deepEqual(itemsOf(document.body.querySelector("[data-model-list-scroller]")).map(textOf), ["Model 4"]);
  await view.unmount();
});

test("the model control and effort stage use the same friendly name", async () => {
  const view = await mountComposer({
    model: { provider: "opencode-go", modelId: "kimi-k2.5" },
    modelList: [
      { provider: "opencode-go", id: "deepseek-flash", name: "deepseek-flash" },
      { provider: "opencode-go", id: "kimi-k2.5", name: "kimi-k2.5" },
    ],
    modelThinkingLevels: { "opencode-go:kimi-k2.5": ["off", "high"] },
    thinkingLevel: "high",
    onModelChange() {},
    onThinkingLevelChange() {},
  });
  const trigger = triggerFor(view.container, "Model settings");
  assert.match(trigger.textContent, /Kimi K2\.5/);
  await click(trigger);
  await settle();
  assert.equal(textOf(document.body.querySelector("[data-model-effort-name]")), "Kimi K2.5");
  await view.unmount();
});

test("the model list uses the available menu height before the 316 px list cap", async () => {
  const previousHeight = window.innerHeight;
  window.innerHeight = 600;
  try {
    const view = await mountComposer({ ...modelProps });
    await click(triggerFor(view.container, "Model settings"));
    const menu = document.body.querySelector("[role='menu'][aria-label='Model settings']");
    const geometry = menu.parentNode.parentNode;
    const styleChanges = [];
    geometry.style.setProperty = (name, value) => styleChanges.push({ name, value });
    await click(document.body.querySelector("[data-model-menu-row='model']"));
    await settle();
    const submenu = document.body.querySelector("[data-model-submenu='model']");
    assert.ok(submenu);
    assert.deepEqual(styleChanges.find((change) => change.name === "--ui-scroll-offset"), {
      name: "--ui-scroll-offset", value: "492px",
    });
    await view.unmount();
  } finally {
    window.innerHeight = previousHeight;
  }
});

test("choosing a model opens the effort stage with the model under its effort label", async () => {
  const models = [];
  const efforts = [];
  const props = {
    model: { provider: "openai", modelId: "gpt-old" },
    modelList: [
      { provider: "openai", id: "gpt-old", name: "GPT Old" },
      { provider: "openai", id: "gpt-new", name: "GPT New" },
    ],
    modelThinkingLevels: { "openai:gpt-old": ["low", "high"], "openai:gpt-new": ["low", "high"] },
    thinkingLevel: "low",
    onModelChange: (provider, modelId) => models.push({ provider, modelId }),
    onThinkingLevelChange: (level) => efforts.push(level),
  };
  const view = await mountComposer(props);
  await click(triggerFor(view.container, "Model settings"));
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  const next = itemsOf(document.body.querySelector("[data-model-submenu='model']"))
    .find((item) => textOf(item) === "GPT New");
  await click(next);
  assert.deepEqual(models, [{ provider: "openai", modelId: "gpt-new" }]);
  await view.render(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false,
    ...props, model: { provider: "openai", modelId: "gpt-new" },
  })));
  await settle();
  const power = document.body.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.equal(textOf(power.querySelector("[data-model-effort-placeholder]")), "Select effort");
  assert.equal(textOf(power.querySelector("[data-model-effort-name]")), "GPT New");

  const track = power.querySelector("[data-power-track]");
  track.getBoundingClientRect = () => ({ left: 100, width: 200 });
  await React.act(async () => {
    track.dispatchEvent(new DomEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 6, clientX: 280 }));
    track.dispatchEvent(new DomEvent("pointerup", { bubbles: true, cancelable: true, button: 0, pointerId: 6, clientX: 280 }));
  });
  assert.deepEqual(efforts, ["high"]);
  await view.unmount();
});

test("choosing the current model opens effort without repeating the model change", async () => {
  const models = [];
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["low", "high"],
    onModelChange: (provider, modelId) => models.push({ provider, modelId }),
    onThinkingLevelChange() {},
  });
  await click(triggerFor(view.container, "Model settings"));
  await click(document.body.querySelector("[data-model-menu-row='model']"));
  await settle();
  const selected = itemsOf(document.body.querySelector("[data-model-submenu='model']"))[0];
  assert.equal(selected.getAttribute("aria-checked"), "true");
  await click(selected);
  await settle();

  assert.deepEqual(models, []);
  assert.equal(textOf(document.body.querySelector("[data-model-effort-placeholder]")), "Select effort");
  await view.unmount();
});

test("the Codex Speed submenu switches between Standard and Fast", async () => {
  const picked = [];
  const view = await mountComposer({
    ...modelProps,
    fastModeEnabled: false,
    fastModeAvailable: true,
    onFastModeChange: (enabled) => picked.push(enabled),
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  await click(document.body.querySelector("[data-model-menu-row='speed']"));
  await settle();

  const submenu = document.body.querySelector("[data-model-submenu='speed']");
  assert.ok(submenu);
  const items = itemsOf(submenu);
  assert.deepEqual(items.map(textOf), ["Standard", "Fast1.5x speed, more usage"]);
  assert.deepEqual(items.map((item) => item.getAttribute("aria-checked")), ["true", "false"]);
  await click(items[1]);
  await settle();

  assert.deepEqual(picked, [true]);
  assert.equal(document.body.querySelector("[role='menu']"), null);
  await view.unmount();
});

test("the model menu hides Speed when the selected model has no fast mode", async () => {
  const view = await mountComposer({
    ...modelProps,
    fastModeAvailable: false,
    onFastModeChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();

  assert.equal(document.body.querySelector("[data-model-menu-row='speed']"), null);
  await view.unmount();
});

test("an empty effort capability list reports that the model has no effort levels", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "auto",
    availableThinkingLevels: [],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const power = document.body.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.equal(power.querySelectorAll("[data-power-dot]").length, 0);
  assert.equal(textOf(power).includes("This model does not support effort levels"), true);
  await view.unmount();
});

test("missing effort capability data does not invent effort choices", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "auto",
    availableThinkingLevels: null,
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const power = document.body.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.equal(power.querySelectorAll("[data-power-dot]").length, 0);
  await view.unmount();
});

test("an automatic effort stays labelled while the slider has no current thumb", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "auto",
    availableThinkingLevels: ["low", "medium"],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const power = document.body.querySelector("[data-model-power-view]");
  assert.ok(power);
  // Auto is the first slider position, and the thumb rests on it.
  assert.equal(power.querySelectorAll("[data-power-dot]").length, 3);
  assert.equal(power.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "auto");
  assert.match(textOf(power), /Auto/);
  await view.unmount();
});

test("the power slider excludes a current level that the selected model does not report", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "max",
    availableThinkingLevels: ["low", "high"],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const power = document.body.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.deepEqual(power.querySelectorAll("[data-power-dot]").map((dot) => dot.getAttribute("data-effort")), ["auto", "low", "high"]);
  // An unreported level has no position, so the thumb rests on Auto.
  assert.equal(power.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "auto");
  await view.unmount();
});

test("Escape from a nested menu returns focus to its parent row", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["low", "high"],
    onThinkingLevelChange() {},
  });
  const trigger = triggerFor(view.container, "Model settings");

  await click(trigger);
  await settle();
  const modelRow = document.body.querySelector("[data-model-menu-row='model']");
  await click(modelRow);
  await settle();
  const modelMenu = document.body.querySelector("[data-model-submenu='model']");
  const activeItem = itemsOf(modelMenu).find((item) => item.getAttribute("aria-checked") === "true");
  await press(activeItem, "Escape");
  await settle();

  assert.equal(document.body.querySelector("[role='menu'][aria-label='Model settings']"), null);
  assert.equal(document.body.querySelector("[data-model-submenu='model']"), null);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("the model pill menu contains tool presets and keeps its callback", async () => {
  const presets = [];
  const view = await mountComposer({
    ...modelProps,
    toolPreset: "default",
    onToolPresetChange: (preset) => presets.push(preset),
  });

  const trigger = triggerFor(view.container, "Model settings");
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  await click(trigger);
  await settle();

  const menu = document.body.querySelector("[role='menu']");
  assert.ok(menu, "the model menu mounts");
  assert.equal(menu.getAttribute("aria-label"), "Model settings");

  await click(menu.querySelector("[data-model-menu-row='advanced']"));
  await settle();

  const advanced = document.body.querySelector("[data-model-submenu='advanced']");
  const section = advanced?.querySelector("[data-menu-section='tools']");
  assert.ok(section, "the model menu contains tool presets");
  const items = itemsOf(section);
  assert.deepEqual(items.map((item) => item.getAttribute("role")), ["menuitemradio", "menuitemradio", "menuitemradio"]);
  assert.deepEqual(items.map((item) => item.getAttribute("aria-checked")), ["false", "true", "false"]);
  await click(items[2]);
  await settle();

  assert.deepEqual(presets, ["full"]);
  assert.equal(document.body.querySelector("[role='menu']"), null);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("the Advanced menu preserves OMP's Auto and Off effort modes", async () => {
  const picked = [];
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["low", "medium", "high"],
    onThinkingLevelChange: (level) => picked.push(level),
    onToolPresetChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  await click(document.body.querySelector("[data-model-menu-row='advanced']"));
  await settle();

  const advanced = document.body.querySelector("[data-model-submenu='advanced']");
  const modes = advanced?.querySelector("[data-menu-section='effort-modes']");
  assert.ok(modes);
  const items = itemsOf(modes);
  assert.deepEqual(items.map(textOf), ["Auto", "None"]);
  await click(items[0]);
  await settle();

  assert.deepEqual(picked, ["auto"]);
  await view.unmount();
});

test("the Advanced icon opens its menu on click only, and a second click closes it", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["low", "medium", "high"],
    onThinkingLevelChange() {},
    onToolPresetChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const icon = document.body.querySelector("[data-model-power-view]").querySelector("[data-model-menu-row='advanced']");
  assert.ok(icon, "the Advanced icon sits inside the effort popup");
  assert.equal(icon.getAttribute("aria-label"), "Advanced");
  await React.act(async () => {
    icon.dispatchEvent(new DomEvent("mouseover", { bubbles: true }));
    icon.dispatchEvent(new DomEvent("mouseenter", { bubbles: false }));
    icon.dispatchEvent(new DomEvent("pointerenter", { bubbles: false }));
  });
  await settle();
  assert.equal(document.body.querySelector("[data-model-submenu='advanced']"), null, "hover opens nothing");

  await click(icon);
  await settle();
  assert.ok(document.body.querySelector("[data-model-submenu='advanced']"), "click opens the menu");
  assert.equal(icon.getAttribute("aria-expanded"), "true");

  await click(document.body.querySelector("[data-model-power-view]").querySelector("[data-model-menu-row='advanced']"));
  await settle();
  assert.equal(document.body.querySelector("[data-model-submenu='advanced']"), null, "a second click closes the menu");
  await view.unmount();
});

test("the model pill menu keeps the selected tool preset when it is chosen again", async () => {
  const presets = [];
  const view = await mountComposer({
    ...modelProps,
    toolPreset: "default",
    onToolPresetChange: (preset) => presets.push(preset),
  });

  const trigger = triggerFor(view.container, "Model settings");
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  await click(trigger);
  await settle();

  await click(document.body.querySelector("[data-model-menu-row='advanced']"));
  await settle();

  const advanced = document.body.querySelector("[data-model-submenu='advanced']");
  const items = itemsOf(advanced?.querySelector("[data-menu-section='tools']"));
  await click(items[1]);
  await settle();

  assert.deepEqual(presets, []);
  assert.equal(document.body.querySelector("[role='menu']"), null);
  assert.equal(domDocument.activeElement, trigger);
  await view.unmount();
});

test("the Session menu contains metrics and Compact without completion sound", async () => {
  const compact = [];
  const view = await mountComposer({
    sessionStats: {
      sessionId: "session-1",
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 0,
      toolResults: 0,
      totalMessages: 2,
      tokens: { input: 1200, output: 340, cacheRead: 5600, cacheWrite: 70, total: 7210 },
      cost: 0.0123,
    },
    contextUsage: { tokens: 7000, contextWindow: 128000, percent: 5.5 },
    onCompact: () => compact.push("compact"),
  });

  const trigger = triggerFor(view.container, "Context donut: 6%");
  await click(trigger);
  await settle();
  const menu = document.body.querySelector("[role='menu'][aria-label='Session menu']");
  assert.ok(menu);
  for (const value of ["Input 1,200", "Output 340", "Cache Read 5,600", "Cache Write 70", "Cost $0.0123"]) {
    assert.equal(textOf(menu).includes(value), true, value);
  }
  const items = itemsOf(menu);
  const compactItem = items.find((item) => textOf(item).includes("Compact"));
  const soundItem = items.find((item) => item.getAttribute("role") === "menuitemradio");
  assert.ok(compactItem);
  assert.equal(soundItem, undefined);
  await click(compactItem);
  await settle();
  assert.deepEqual(compact, ["compact"]);
  await view.unmount();
});

test("the /session action opens the Session menu through ChatInput", async () => {
  const composerRef = React.createRef();
  const commands = [];
  const view = await mountComposer({
    ref: composerRef,
    contextUsage: { tokens: 7000, contextWindow: 128000, percent: 5.5 },
    onBuiltinCommand: async (command) => {
      commands.push(command);
      return { handled: true, action: "openSessionStats" };
    },
  });

  await submitCommand(view, composerRef, "/session");

  assert.deepEqual(commands, ["/session"]);
  assert.ok(document.body.querySelector("[role='menu'][aria-label='Session menu']"));
  await view.unmount();
});

test("the /session action reports missing context usage before the first reply", async () => {
  const composerRef = React.createRef();
  const view = await mountComposer({
    ref: composerRef,
    onBuiltinCommand: async () => ({ handled: true, action: "openSessionStats" }),
  });

  await submitCommand(view, composerRef, "/session");

  assert.equal(
    document.body.querySelectorAll("[aria-label]").find((element) => element.getAttribute("aria-label").startsWith("Context donut")),
    undefined,
  );
  const status = document.body.querySelector("[role='status']");
  assert.ok(status);
  assert.equal(textOf(status), "No context usage yet");
  await view.unmount();
});

test("the /session status clears when the Context donut becomes available", async () => {
  const composerRef = React.createRef();
  const props = {
    ref: composerRef,
    onSend() {},
    onAbort() {},
    isStreaming: false,
    onBuiltinCommand: async () => ({ handled: true, action: "openSessionStats" }),
  };
  const view = await mount(h(I18nProvider, null, h(ChatInput, props)));
  await settle();

  await submitCommand(view, composerRef, "/session");
  assert.equal(textOf(document.body.querySelector("[role='status']")), "No context usage yet");

  await view.render(h(I18nProvider, null, h(ChatInput, {
    ...props,
    contextUsage: { tokens: 7000, contextWindow: 128000, percent: 5.5 },
  })));
  await settle();

  assert.equal(document.body.querySelector("[role='status']"), null);
  assert.ok(document.body.querySelector("[aria-label='Context donut: 6%']"));
  await view.unmount();
});

test("the Context donut disables Compact during an active run", async () => {
  const view = await mountComposer({
    isStreaming: true,
    onCompact() {},
    contextUsage: { tokens: 7000, contextWindow: 128000, percent: 5.5 },
  });
  await click(triggerFor(view.container, "Context donut: 6%"));
  await settle();
  const compactItem = itemsOf(document.body.querySelector("[role='menu'][aria-label='Session menu']"))
    .find((item) => textOf(item).includes("Compact"));
  assert.ok(compactItem);
  assert.equal(compactItem.hasAttribute("disabled"), true);
  await view.unmount();
});

test("the restricted mode pill invokes the trust dialog callback", async () => {
  const calls = [];
  const view = await mountComposer({
    projectTrust: { requiresTrust: true, trusted: false },
    onProjectTrustClick: () => calls.push("trust"),
  });
  await click(triggerFor(view.container, "Restricted mode"));
  assert.deepEqual(calls, ["trust"]);
  await view.unmount();
});
