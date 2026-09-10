import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, settle, textOf, domDocument, press, typeInto, focused } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { CommandPalette } = await jiti.import("./CommandPalette.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const renderPalette = props => mount(React.createElement(I18nProvider, null, React.createElement(CommandPalette, props)));

test("keyboard navigation works from results and keeps typing in the search field", async () => {
  const originalFetch = globalThis.fetch;
  const prototype = Object.getPrototypeOf(domDocument.createElement("button"));
  const originalScroll = prototype.scrollIntoView;
  prototype.scrollIntoView = () => {};
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ sessions: [] }) });
  const calls = [];
  let view;
  try {
    view = await renderPalette({ actions: [
      { id: "a", label: "Alpha", group: "Commands", run: () => calls.push("a") },
      { id: "b", label: "Beta", group: "Commands", run: () => calls.push("b") },
      { id: "c", label: "Gamma", group: "Commands", run: () => calls.push("c") },
    ], onSelectSession() {}, onClose: () => calls.push("close") });
    await settle();
    const input = domDocument.querySelector("[role='combobox']");
    const rows = domDocument.querySelectorAll("[role='option']");
    await React.act(async () => { rows[0].focus(); });
    await press(rows[0], "ArrowDown");
    assert.equal(rows[1].getAttribute("aria-selected"), "true");
    assert.equal(focused(), input);
    await press(input, "Tab");
    assert.equal(rows[2].getAttribute("aria-selected"), "true");
    await press(input, "Tab", { shiftKey: true });
    assert.equal(rows[1].getAttribute("aria-selected"), "true");
    await press(input, "PageDown");
    assert.equal(rows[2].getAttribute("aria-selected"), "true");
    await press(input, "Enter");
    assert.deepEqual(calls, ["close", "c"]);
  } finally { await view?.unmount(); globalThis.fetch = originalFetch; prototype.scrollIntoView = originalScroll; }
});

test("late chat results do not change the command selected with the keyboard", async () => {
  const originalFetch = globalThis.fetch;
  const prototype = Object.getPrototypeOf(domDocument.createElement("button"));
  const originalScroll = prototype.scrollIntoView;
  prototype.scrollIntoView = () => {};
  let resolveFetch;
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  const calls = [];
  let view;
  try {
    view = await renderPalette({ actions: [
      { id: "a", label: "Alpha", group: "Commands", run: () => calls.push("a") },
      { id: "b", label: "Beta", group: "Commands", run: () => calls.push("b") },
    ], onSelectSession() {}, onClose() {} });
    const input = domDocument.querySelector("[role='combobox']");
    await press(input, "ArrowDown");
    await React.act(async () => resolveFetch({ ok: true, json: async () => ({ sessions: [
      { id: "chat", name: "Recent", firstMessage: "", cwd: "/project", modified: "2026-09-08" },
    ] }) }));
    await settle();
    await press(input, "Enter");
    assert.deepEqual(calls, ["b"]);
  } finally { await view?.unmount(); globalThis.fetch = originalFetch; prototype.scrollIntoView = originalScroll; }
});

test("the palette opens a recent chat and closes before navigation", async () => {
  const originalFetch = globalThis.fetch;
  const elementPrototype = Object.getPrototypeOf(domDocument.createElement("button"));
  const originalScroll = elementPrototype.scrollIntoView;
  elementPrototype.scrollIntoView = () => {};
  const calls = [];
  const session = { id: "one", name: "Recent work", firstMessage: "Hello", cwd: "/project", modified: "2026-09-08" };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ sessions: [session] }) });
  let view;
  try {
    view = await renderPalette({
      actions: [{ id: "new", label: "New chat", group: "Quick actions", run: () => calls.push("new") }],
      onSelectSession: selected => calls.push(selected.id), onClose: () => calls.push("close"),
    });
    await settle();
    const input = domDocument.querySelector("[role='combobox']");
    assert.ok(input);
    await press(input, "Enter");
    assert.deepEqual(calls, ["close", "one"]);
    const action = Array.from(domDocument.querySelectorAll("[role='option']")).find(row => textOf(row) === "New chat");
    await click(action);
    assert.deepEqual(calls.slice(-2), ["close", "new"]);
  } finally {
    await view?.unmount();
    globalThis.fetch = originalFetch;
    elementPrototype.scrollIntoView = originalScroll;
  }
});

test("file search opens a selected path in the current project", async () => {
  const originalFetch = globalThis.fetch;
  const prototype = Object.getPrototypeOf(domDocument.createElement("button"));
  const originalScroll = prototype.scrollIntoView;
  prototype.scrollIntoView = () => {};
  const calls = [];
  globalThis.fetch = async url => {
    assert.match(url, /\/api\/file-index\?cwd=/);
    return { ok: true, json: async () => ({ files: ["src/example.ts"] }) };
  };
  let view;
  try {
    view = await renderPalette({
      actions: [], fileSearchCwd: "/workspace", onSelectSession() {},
      onOpenFile: path => calls.push(path), onClose() {},
    });
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    await settle();
    await press(domDocument.querySelector("[role='combobox']"), "Enter");
    assert.deepEqual(calls, ["/workspace/src/example.ts"]);
  } finally {
    await view?.unmount(); globalThis.fetch = originalFetch; prototype.scrollIntoView = originalScroll;
  }
});

test("a failed chat request leaves commands usable and empty searches cannot execute them", async () => {
  const originalFetch = globalThis.fetch;
  const prototype = Object.getPrototypeOf(domDocument.createElement("button"));
  const originalScroll = prototype.scrollIntoView;
  prototype.scrollIntoView = () => {};
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  const calls = [];
  let view;
  try {
    view = await renderPalette({ actions: [
      { id: "new", label: "New chat", group: "Quick actions", run: () => calls.push("new") },
      { id: "settings", label: "General", group: "Settings", run: () => calls.push("settings") },
    ], onSelectSession() {}, onClose() {} });
    await settle();
    assert.match(textOf(domDocument.querySelector("[role='alert']")), /Could not load results/);
    const input = domDocument.querySelector("[role='combobox']");
    await press(input, "End");
    await press(input, "Enter");
    assert.deepEqual(calls, ["settings"]);
    await typeInto(input, "no-such-action");
    await press(input, "Enter");
    assert.deepEqual(calls, ["settings"]);
    assert.match(textOf(domDocument.querySelector("[role='listbox']")), /No results/);
  } finally {
    await view?.unmount(); globalThis.fetch = originalFetch; prototype.scrollIntoView = originalScroll;
  }
});
