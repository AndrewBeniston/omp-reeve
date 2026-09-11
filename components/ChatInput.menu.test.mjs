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

test("native attachment selection inserts every chosen path without replacing the draft", async () => {
  const originalBridge = globalThis.ompDesktop;
  const originalFetch = globalThis.fetch;
  globalThis.ompDesktop = { selectAttachments: async () => ["/tmp/notes.md", "/tmp/folder with space"] };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: [], skills: [], packages: [] }) });
  const ref = React.createRef();
  const sent = [];
  let view;
  try {
    view = await mountComposer({ ref, cwd: "/tmp", onSend: value => sent.push(value), onLoadSlashCommands: async () => [] });
    await React.act(async () => { ref.current.insertText("See these"); });
    // insertText places the caret in a requestAnimationFrame, so until a frame
    // has passed the caret is still at the start. Without this wait the menu
    // reads position zero and the paths land in front of the draft, which is
    // what made this flake in a full run but never on its own.
    await settle();
    await click(triggerFor(view.container, "Add"));
    await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button).startsWith("Files and folders")));
    await click(Array.from(view.container.querySelectorAll("[role='menuitem']")).find(button => textOf(button) === "Files and folders"));
    await settle();
    await React.act(async () => {
      view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0], /See these @\/tmp\/notes\.md @"\/tmp\/folder with space"/);
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

test("the Codex model menu opens supported effort levels and keeps its callback", async () => {
  const picked = [];
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "high",
    availableThinkingLevels: ["low", "medium", "high", "xhigh", "max"],
    fastModeAvailable: true,
    onThinkingLevelChange: (level) => picked.push(level),
  });

  const trigger = triggerFor(view.container, "Model settings");
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  await click(trigger);
  await settle();

  const menu = view.container.querySelector("[role='menu']");
  assert.ok(menu, "the model menu mounts");
  assert.equal(menu.getAttribute("aria-label"), "Model settings");
  assert.deepEqual(
    ["model", "effort", "speed", "advanced"].map((row) => {
      const item = menu.querySelector(`[data-model-menu-row='${row}']`);
      assert.ok(item, `the model menu contains the ${row} row`);
      return item.getAttribute("aria-haspopup");
    }),
    ["menu", "menu", "menu", "menu"],
  );

  await click(menu.querySelector("[data-model-menu-row='effort']"));
  await settle();

  const submenu = view.container.querySelector("[data-model-submenu='effort']");
  assert.ok(submenu, "the Effort row opens its submenu");
  assert.equal(submenu.getAttribute("aria-label"), "Effort");
  const items = itemsOf(submenu);
  assert.deepEqual(items.map(textOf), ["Light", "Medium", "High", "Extra High", "UltraConsumes usage limits faster"]);
  const checked = items.filter((item) => item.getAttribute("aria-checked") === "true");
  assert.equal(checked.length, 1);
  assert.equal(textOf(checked[0]), "High");

  assert.equal(checked[0].getAttribute("data-selected"), "true");
  await click(items[items.indexOf(checked[0]) + 1]);
  await settle();

  assert.deepEqual(picked, ["xhigh"]);
  assert.equal(view.container.querySelector("[role='menu']"), null);
  assert.equal(domDocument.activeElement, trigger);
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
  const filter = view.container.querySelector("[aria-label='Filter models…']");
  assert.ok(filter);
  assert.equal(domDocument.activeElement, filter);
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
  await click(view.container.querySelector("[data-model-menu-row='effort']"));
  await settle();

  const submenu = view.container.querySelector("[data-model-submenu='effort']");
  assert.ok(submenu);
  assert.equal(itemsOf(submenu).length, 0);
  assert.equal(textOf(submenu).includes("This model does not support effort levels"), true);
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
  await click(view.container.querySelector("[data-model-menu-row='effort']"));
  await settle();

  const submenu = view.container.querySelector("[data-model-submenu='effort']");
  assert.ok(submenu);
  assert.equal(itemsOf(submenu).length, 0);
  await view.unmount();
});

test("the Effort submenu excludes a current level that the selected model does not report", async () => {
  const view = await mountComposer({
    ...modelProps,
    thinkingLevel: "max",
    availableThinkingLevels: ["low", "high"],
    onThinkingLevelChange() {},
  });

  await click(triggerFor(view.container, "Model settings"));
  await settle();
  await click(view.container.querySelector("[data-model-menu-row='effort']"));
  await settle();

  const submenu = view.container.querySelector("[data-model-submenu='effort']");
  assert.ok(submenu);
  assert.deepEqual(itemsOf(submenu).map(textOf), ["Light", "High"]);
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
  const effortRow = view.container.querySelector("[data-model-menu-row='effort']");
  await click(effortRow);
  await settle();
  const effortMenu = view.container.querySelector("[data-model-submenu='effort']");
  const activeItem = itemsOf(effortMenu).find((item) => item.getAttribute("aria-checked") === "true");
  await press(activeItem, "Escape");
  await settle();

  assert.ok(view.container.querySelector("[role='menu'][aria-label='Model settings']"));
  assert.equal(view.container.querySelector("[data-model-submenu='effort']"), null);
  assert.equal(domDocument.activeElement, effortRow);
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
