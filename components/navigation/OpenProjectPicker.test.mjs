import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, settle, installHarnessGlobals } from "../../test/dom-harness.mjs";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { OpenProjectPicker } = await jiti.import("./OpenProjectPicker.tsx");

test("native folder selection validates the path before navigation", async () => {
  installHarnessGlobals();
  const originalBridge = window.ompDesktop;
  const originalFetch = globalThis.fetch;
  const calls = [];
  window.ompDesktop = { selectDirectory: async () => "/selected" };
  globalThis.fetch = async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return { ok: true, json: async () => ({ cwd: "/canonical" }) };
  };
  let view;
  try {
    view = await mount(React.createElement(OpenProjectPicker, {
      onSelect: path => calls.push(path), onCancel: () => calls.push("cancel"),
    }));
    await settle();
    assert.deepEqual(calls, [["/api/cwd/validate", { cwd: "/selected" }], "/canonical"]);
  } finally {
    await view?.unmount();
    window.ompDesktop = originalBridge;
    globalThis.fetch = originalFetch;
  }
});

test("a dismissed picker ignores a late native selection", async () => {
  installHarnessGlobals();
  const originalBridge = window.ompDesktop;
  const originalFetch = globalThis.fetch;
  let resolvePicker;
  let requests = 0;
  window.ompDesktop = { selectDirectory: () => new Promise(resolve => { resolvePicker = resolve; }) };
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ cwd: "/late" }) }; };
  const navigations = [];
  try {
    const view = await mount(React.createElement(OpenProjectPicker, { onSelect: path => navigations.push(path), onCancel() {} }));
    await view.unmount();
    await React.act(async () => { resolvePicker("/late"); });
    await settle();
    assert.equal(requests, 0);
    assert.deepEqual(navigations, []);
  } finally { window.ompDesktop = originalBridge; globalThis.fetch = originalFetch; }
});
