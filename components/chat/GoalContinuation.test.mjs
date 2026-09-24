import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { DomEvent, domWindow, mount, React, settle } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { GoalPill } = await jiti.import("./GoalPill.tsx");
const { ChatInput } = await jiti.import("../ChatInput.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function makeGoal(status = "active") {
  return {
    id: "goal-one",
    objective: "Finish the film",
    status,
    tokensUsed: 700,
    timeUsedSeconds: 12,
    createdAt: 1_000,
    updatedAt: 2_000,
  };
}

function renderGoal(goal, props = {}) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(GoalPill, { goal, ...props })),
  );
}

test("a continuing Goal shows its continuation state in the pill", () => {
  const html = renderGoal(makeGoal(), { continuationPending: true });

  assert.match(html, /Continuing goal…/);
  assert.doesNotMatch(html, /Pursuing goal/);
});

test("a pending Goal continuation labels the Composer and blocks idle Send", async () => {
  const ref = React.createRef();
  const sent = [];
  const view = await mount(React.createElement(I18nProvider, null, React.createElement(ChatInput, {
    ref,
    onSend: (message) => sent.push(message),
    onAbort() {},
    isStreaming: false,
    continuationPending: true,
  })));

  try {
    await React.act(async () => { ref.current.insertText("Keep this draft"); });
    await settle();
    const editor = view.container.querySelector("[data-composer-editor]");
    const sendButton = view.container.querySelector("button[type='submit']");

    assert.equal(editor.getAttribute("data-empty"), "false");
    assert.equal(editor.getAttribute("data-placeholder"), "Continuing goal…");
    assert.equal(sendButton.getAttribute("aria-label"), "Continuing goal…");
    assert.notEqual(sendButton.getAttribute("disabled"), null);
    await React.act(async () => {
      view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
    });
    assert.equal(ref.current.submitText("External send"), "busy");
    assert.deepEqual(sent, []);
    assert.equal(editor.getAttribute("data-empty"), "false");
  } finally {
    await view.unmount();
  }
});

test("a pending Goal continuation keeps active-Turn steering available", async () => {
  const previousQueueMode = domWindow.localStorage.getItem("reeve-follow-up-queue-mode");
  domWindow.localStorage.setItem("reeve-follow-up-queue-mode", "steer");
  const ref = React.createRef();
  const steered = [];
  const view = await mount(React.createElement(I18nProvider, null, React.createElement(ChatInput, {
    ref,
    onSend() {},
    onAbort() {},
    onSteer: (message) => steered.push(message),
    isStreaming: true,
    continuationPending: true,
  })));

  try {
    await settle();
    await React.act(async () => { ref.current.insertText("Steer this Turn"); });
    await settle();
    await React.act(async () => {
      view.container.querySelector("form").dispatchEvent(new DomEvent("submit", { bubbles: true, cancelable: true }));
    });

    assert.deepEqual(steered, ["Steer this Turn"]);
  } finally {
    await view.unmount();
    if (previousQueueMode === null) domWindow.localStorage.removeItem("reeve-follow-up-queue-mode");
    else domWindow.localStorage.setItem("reeve-follow-up-queue-mode", previousQueueMode);
  }
});
