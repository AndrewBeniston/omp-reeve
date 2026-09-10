import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createJiti } from "jiti";
import {
  DomEvent,
  domDocument,
  domWindow,
  mount,
} from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { registerAbortHandler, useGlobalKeyboardShortcuts } = await jiti.import("./useKeyboardShortcuts.ts");
const h = React.createElement;

function Shortcuts({ onNewSession, activeCwd }) {
  useGlobalKeyboardShortcuts({ onNewSession, activeCwd });
  return h("div", null, "chat");
}

async function send(key, init = {}) {
  const event = new DomEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await React.act(async () => { domWindow.dispatchEvent(event); });
  return event;
}

test("the global Escape shortcut ignores a key press that another handler took", async () => {
  let aborts = 0;
  registerAbortHandler(() => { aborts += 1; });
  const view = await mount(h(Shortcuts, {}));

  const handled = new DomEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  handled.preventDefault();
  await React.act(async () => { domWindow.dispatchEvent(handled); });
  assert.equal(aborts, 0, "A handled Escape must not stop the agent.");

  await send("Escape");
  assert.equal(aborts, 1, "An unhandled Escape must still stop the agent.");

  registerAbortHandler(null);
  await view.unmount();
});

test("the new session shortcut ignores a key press that another handler took", async () => {
  const sessions = [];
  const view = await mount(h(Shortcuts, {
    activeCwd: "/repo",
    onNewSession(cwd) { sessions.push(cwd); },
  }));

  const handled = new DomEvent("keydown", { key: "n", ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
  handled.preventDefault();
  await React.act(async () => { domWindow.dispatchEvent(handled); });
  assert.deepEqual(sessions, []);

  await send("n", { ctrlKey: true, altKey: true });
  assert.deepEqual(sessions, ["/repo"]);

  await view.unmount();
});

test("the global Escape shortcut still leaves an input and a textarea alone", async () => {
  let aborts = 0;
  registerAbortHandler(() => { aborts += 1; });
  const view = await mount(h(Shortcuts, {}));

  for (const tagName of ["INPUT", "TEXTAREA"]) {
    const element = domDocument.createElement(tagName);
    domDocument.body.appendChild(element);
    const event = new DomEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await React.act(async () => { element.dispatchEvent(event); });
    domDocument.body.removeChild(element);
  }
  assert.equal(aborts, 0);

  const button = domDocument.createElement("button");
  domDocument.body.appendChild(button);
  await React.act(async () => {
    button.dispatchEvent(new DomEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  domDocument.body.removeChild(button);
  assert.equal(aborts, 1, "A button target must still stop the agent.");

  registerAbortHandler(null);
  await view.unmount();
});
