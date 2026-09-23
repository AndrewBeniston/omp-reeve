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

  const menu = view.container.querySelector("[role='menu'][aria-label='Model settings']");
  assert.ok(menu);
  assert.equal(menu.querySelector("[data-model-menu-row='effort']"), null);
  assert.equal(menu.querySelector("[aria-label='Select model']")?.getAttribute("aria-haspopup"), "menu");
  const dots = menu.querySelectorAll("[data-power-dot]");
  assert.deepEqual(dots.map((dot) => dot.getAttribute("data-effort")), ["none", "medium", "high", "max"]);
  assert.deepEqual(dots.map((dot) => dot.getAttribute("data-filled")), ["true", "true", "false", "false"]);
  assert.equal(menu.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "high");
  await click(menu.querySelector("[aria-label='Select model']"));
  await settle();
  assert.ok(view.container.querySelector("[data-model-submenu='model']"));

  await view.unmount();
});

test("the model menu exposes the stage transition panels", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "medium",
    availableThinkingLevels: ["off", "medium", "high"],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  const slider = view.container.querySelector("[data-model-power-view]");
  assert.equal(slider?.getAttribute("data-stage-transition"), "enter");
  assert.equal(slider?.querySelector("[data-stage-panel='top']")?.getAttribute("data-stage-transition"), "enter");
  assert.equal(slider?.querySelector("[data-stage-panel='slider']")?.getAttribute("data-stage-transition"), "enter");

  await click(view.container.querySelector("[aria-label='Select model']"));
  await settle();
  const list = view.container.querySelector("[data-model-list]");
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
  const track = view.container.querySelector("[data-power-track]");
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
  assert.equal(view.container.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "high");
  await pointer("pointermove", 280);
  assert.deepEqual(picked, []);
  assert.equal(view.container.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "max");
  assert.deepEqual(
    view.container.querySelectorAll("[data-power-dot]").map((dot) => dot.getAttribute("data-filled")),
    ["true", "true", "true", "true", "false"],
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
  assert.match(textOf(trigger), /ChatGPT subscription.*GPT Example/);

  await click(trigger);
  await settle();
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  const menu = view.container.querySelector("[data-model-submenu='model']");
  assert.match(textOf(menu), /OpenAI API/);
  assert.match(textOf(menu), /ChatGPT subscription/);
  const apiGroup = Array.from(menu.querySelectorAll("[data-model-provider]"))
    .find((group) => group.getAttribute("data-model-provider") === "openai");
  const subscriptionGroup = Array.from(menu.querySelectorAll("[data-model-provider]"))
    .find((group) => group.getAttribute("data-model-provider") === "openai-codex");
  assert.deepEqual(itemsOf(subscriptionGroup).map(textOf), ["GPT Example"]);
  assert.equal(itemsOf(subscriptionGroup)[0].getAttribute("aria-checked"), "true");

  await click(itemsOf(apiGroup)[0]);
  await settle();
  assert.deepEqual(picked, [{ provider: "openai", modelId: "gpt-example" }]);

  await view.render(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false,
    ...props, model: { provider: "openai", modelId: "gpt-example" },
  })));
  await settle();
  assert.match(textOf(triggerFor(view.container, "Model settings")), /OpenAI API.*GPT Example/);
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
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  const menu = view.container.querySelector("[data-model-submenu='model']");
  assert.ok(menu);
  assert.equal(textOf(menu.querySelector("[data-model-list-heading]")), "Select model");
  const first = itemsOf(menu)[0];
  assert.match(textOf(first), /^DefaultRecommended set of models$/);
  await click(first);
  assert.deepEqual(roles, ["default"]);
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
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  const api = itemsOf(view.container.querySelector("[data-model-provider='openai']"))[0];
  const subscription = itemsOf(view.container.querySelector("[data-model-provider='openai-codex']"))[0];
  assert.equal(api.getAttribute("aria-checked"), "false");
  assert.equal(subscription.getAttribute("aria-checked"), "true");
  assert.equal(subscription.getAttribute("data-selection-id"), "openai-codex/gpt-example:high");

  await view.render(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false,
    ...props, thinkingLevel: "auto",
  })));
  await settle();
  assert.equal(itemsOf(view.container.querySelector("[data-model-provider='openai-codex']"))[0].getAttribute("aria-checked"), "false");
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
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  const apiGroup = view.container.querySelector("[data-model-provider='openai']");
  assert.ok(apiGroup);
  await click(itemsOf(apiGroup)[0]);
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
  await click(triggerFor(view.container, "Add"));
  const goal = Array.from(view.container.querySelectorAll("[role='menuitem']"))
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
  await click(triggerFor(view.container, "Add"));
  assert.equal(loads, 1);
  await view.unmount();
});

test("Add executes Compact without sending or clearing the existing draft", async () => {
  const ref = React.createRef();
  const commands = [];
  const sent = [];
  const view = await mountComposer({ ref,
    onBuiltinCommand: async command => { commands.push(command); return { handled: true }; },
    onSend: text => sent.push(text),
  });
  await React.act(async () => { ref.current.insertText("Keep this unfinished message"); });
  await click(triggerFor(view.container, "Add"));
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("More commands")));
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Compact")));
  await settle();
  assert.deepEqual(commands, ["/compact"]);
  assert.deepEqual(sent, []);
  await React.act(async () => {
    view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
  });
  assert.deepEqual(sent, ["Keep this unfinished message"]);
  await view.unmount();
});

test("Name retries its own arguments without consuming the message draft", async () => {
  const ref = React.createRef();
  const commands = [];
  const sent = [];
  const view = await mountComposer({ ref, onSend: text => sent.push(text),
    onBuiltinCommand: async command => {
      commands.push(command);
      return commands.length === 1 ? { handled: true, error: "Temporary failure" } : { handled: true };
    },
  });
  await React.act(async () => { ref.current.insertText("Explain this failure"); });
  await click(triggerFor(view.container, "Add"));
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("More commands")));
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Name")));
  const dialog = domDocument.querySelector("[role='dialog']");
  await typeInto(dialog.querySelector("input"), "Dedicated title");
  const submit = async () => React.act(async () => { dialog.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true })); });
  await submit();
  assert.match(textOf(dialog), /Temporary failure/);
  assert.deepEqual(sent, []);
  await submit();
  assert.deepEqual(commands, ["/name Dedicated title", "/name Dedicated title"]);
  await React.act(async () => { view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true })); });
  assert.deepEqual(sent, ["Explain this failure"]);
  await view.unmount();
});

test("Files and folders returns keyboard focus to the composer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: [], skills: [], packages: [] }) });
  let view;
  try {
    view = await mountComposer({ cwd: "/tmp", onLoadSlashCommands: async () => [] });
    await click(triggerFor(view.container, "Add"));
    await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Files and folders")));
    const files = Array.from(view.container.querySelectorAll("[role='menuitem']"))
      .find(button => textOf(button) === "Files and folders");
    await click(files);
    await settle();
    assert.notEqual(focused(), triggerFor(view.container, "Add"));
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
    await click(triggerFor(view.container, "Add"));
    await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Files and folders")));
    await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button) === "Files and folders"));
    await settle();
    const rows = view.container.querySelector("[role='list'][aria-label='Local attachments']")?.querySelectorAll("[role='listitem']") ?? [];
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

test("the Add menu opens command submenus before inserting a complete command", async () => {
  const ref = React.createRef();
  const sent = [];
  const view = await mountComposer({ ref, onSend: text => sent.push(text),
    slashCommands: [{ name: "goal", source: "extension", subcommands: [{ name: "status", description: "Show status" }] }],
  });
  await React.act(async () => { ref.current.insertText("Please use "); });
  await click(triggerFor(view.container, "Add"));
  await click(Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find(button => textOf(button).startsWith("Goal")));
  assert.equal(sent.length, 0);
  const status = Array.from(view.container.querySelectorAll("[role='menuitem']"))
    .find(button => textOf(button).startsWith("Status"));
  assert.ok(status);
  await click(status);
  assert.equal(sent.length, 0);
  const dialog = domDocument.querySelector("[role='dialog']");
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

  const menu = view.container.querySelector("[role='menu']");
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
  assert.deepEqual(menu.querySelectorAll("[data-power-dot]").map((dot) => dot.getAttribute("data-effort")), ["low", "medium", "high", "xhigh", "max"]);
  assert.equal(menu.querySelector("[data-power-thumb]")?.getAttribute("data-step"), "high");
  await view.unmount();
});

test("a large model menu gives focus to its filter", async () => {
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
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  assert.equal(itemsOf(view.container.querySelector("[data-model-list-scroller]")).length, 9);
  const filter = view.container.querySelector("[aria-label='Filter models…']");
  assert.ok(filter);
  assert.equal(domDocument.activeElement, filter);
  await typeInto(filter, "model 8");
  await settle();
  assert.deepEqual(itemsOf(view.container.querySelector("[data-model-submenu='model']")).map(textOf), ["Model 8"]);
  await view.unmount();
});

test("the model list uses the available menu height before the 316 px list cap", async () => {
  const previousHeight = window.innerHeight;
  window.innerHeight = 600;
  try {
    const view = await mountComposer({ ...modelProps });
    await click(triggerFor(view.container, "Model settings"));
    const menu = view.container.querySelector("[role='menu'][aria-label='Model settings']");
    const geometry = menu.parentNode.parentNode;
    const styleChanges = [];
    geometry.style.setProperty = (name, value) => styleChanges.push({ name, value });
    await click(view.container.querySelector("[data-model-menu-row='model']"));
    await settle();
    const submenu = view.container.querySelector("[data-model-submenu='model']");
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
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  const next = itemsOf(view.container.querySelector("[data-model-provider='openai']"))
    .find((item) => textOf(item) === "GPT New");
  await click(next);
  assert.deepEqual(models, [{ provider: "openai", modelId: "gpt-new" }]);
  await view.render(h(I18nProvider, null, h(ChatInput, { onSend() {}, onAbort() {}, isStreaming: false,
    ...props, model: { provider: "openai", modelId: "gpt-new" },
  })));
  await settle();
  const power = view.container.querySelector("[data-model-power-view]");
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
  await click(view.container.querySelector("[data-model-menu-row='model']"));
  await settle();
  const selected = itemsOf(view.container.querySelector("[data-model-provider='openai']"))[0];
  assert.equal(selected.getAttribute("aria-checked"), "true");
  await click(selected);
  await settle();

  assert.deepEqual(models, []);
  assert.equal(textOf(view.container.querySelector("[data-model-effort-placeholder]")), "Select effort");
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
  await click(view.container.querySelector("[data-model-menu-row='speed']"));
  await settle();

  const submenu = view.container.querySelector("[data-model-submenu='speed']");
  assert.ok(submenu);
  const items = itemsOf(submenu);
  assert.deepEqual(items.map(textOf), ["Standard", "Fast1.5x speed, more usage"]);
  assert.deepEqual(items.map((item) => item.getAttribute("aria-checked")), ["true", "false"]);
  await click(items[1]);
  await settle();

  assert.deepEqual(picked, [true]);
  assert.equal(view.container.querySelector("[role='menu']"), null);
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

  assert.equal(view.container.querySelector("[data-model-menu-row='speed']"), null);
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
  const power = view.container.querySelector("[data-model-power-view]");
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
  const power = view.container.querySelector("[data-model-power-view]");
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
  const power = view.container.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.equal(power.querySelectorAll("[data-power-dot]").length, 2);
  assert.equal(power.querySelector("[data-power-thumb]"), null);
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
  const power = view.container.querySelector("[data-model-power-view]");
  assert.ok(power);
  assert.deepEqual(power.querySelectorAll("[data-power-dot]").map((dot) => dot.getAttribute("data-effort")), ["low", "high"]);
  assert.equal(power.querySelector("[data-power-thumb]"), null);
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
  const modelRow = view.container.querySelector("[data-model-menu-row='model']");
  await click(modelRow);
  await settle();
  const modelMenu = view.container.querySelector("[data-model-submenu='model']");
  const activeItem = itemsOf(modelMenu).find((item) => item.getAttribute("aria-checked") === "true");
  await press(activeItem, "Escape");
  await settle();

  assert.ok(view.container.querySelector("[role='menu'][aria-label='Model settings']"));
  assert.equal(view.container.querySelector("[data-model-submenu='model']"), null);
  assert.equal(domDocument.activeElement, modelRow);
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

  const menu = view.container.querySelector("[role='menu']");
  assert.ok(menu, "the model menu mounts");
  assert.equal(menu.getAttribute("aria-label"), "Model settings");

  await click(menu.querySelector("[data-model-menu-row='advanced']"));
  await settle();

  const advanced = view.container.querySelector("[data-model-submenu='advanced']");
  const section = advanced?.querySelector("[data-menu-section='tools']");
  assert.ok(section, "the model menu contains tool presets");
  const items = itemsOf(section);
  assert.deepEqual(items.map((item) => item.getAttribute("role")), ["menuitemradio", "menuitemradio", "menuitemradio"]);
  assert.deepEqual(items.map((item) => item.getAttribute("aria-checked")), ["false", "true", "false"]);
  await click(items[2]);
  await settle();

  assert.deepEqual(presets, ["full"]);
  assert.equal(view.container.querySelector("[role='menu']"), null);
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
  await click(view.container.querySelector("[data-model-menu-row='advanced']"));
  await settle();

  const advanced = view.container.querySelector("[data-model-submenu='advanced']");
  const modes = advanced?.querySelector("[data-menu-section='effort-modes']");
  assert.ok(modes);
  const items = itemsOf(modes);
  assert.deepEqual(items.map(textOf), ["Auto", "None"]);
  await click(items[0]);
  await settle();

  assert.deepEqual(picked, ["auto"]);
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

  await click(view.container.querySelector("[data-model-menu-row='advanced']"));
  await settle();

  const advanced = view.container.querySelector("[data-model-submenu='advanced']");
  const items = itemsOf(advanced?.querySelector("[data-menu-section='tools']"));
  await click(items[1]);
  await settle();

  assert.deepEqual(presets, []);
  assert.equal(view.container.querySelector("[role='menu']"), null);
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
  const menu = view.container.querySelector("[role='menu'][aria-label='Session menu']");
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
  assert.ok(view.container.querySelector("[role='menu'][aria-label='Session menu']"));
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
    view.container.querySelectorAll("[aria-label]").find((element) => element.getAttribute("aria-label").startsWith("Context donut")),
    undefined,
  );
  const status = view.container.querySelector("[role='status']");
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
  assert.equal(textOf(view.container.querySelector("[role='status']")), "No context usage yet");

  await view.render(h(I18nProvider, null, h(ChatInput, {
    ...props,
    contextUsage: { tokens: 7000, contextWindow: 128000, percent: 5.5 },
  })));
  await settle();

  assert.equal(view.container.querySelector("[role='status']"), null);
  assert.ok(view.container.querySelector("[aria-label='Context donut: 6%']"));
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
  const compactItem = itemsOf(view.container.querySelector("[role='menu'][aria-label='Session menu']"))
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
