import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, press, textOf, typeInto } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { QuestionRequestPanel } = await jiti.import("./QuestionRequestPanel.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;
const request = {
  type: "extension_ui_request",
  id: "ask-1",
  method: "ask",
  questions: [
    {
      id: "scope",
      header: "Scope",
      question: "Which folder should change?",
      options: [
        { label: "Source", description: "Change the application", preview: "components/" },
        { label: "Tests", description: "Change tests only" },
      ],
      recommended: 0,
    },
    {
      id: "checks",
      header: "Checks",
      question: "Which checks should run?",
      options: [{ label: "Tests" }, { label: "Lint" }],
      multi: true,
    },
  ],
};

async function mountPanel(onRespond = () => {}, panelRequest = request) {
  return mount(h(I18nProvider, null, h(QuestionRequestPanel, { request: panelRequest, onRespond })));
}

function findButton(root, label) {
  return Array.from(root.querySelectorAll("button")).find((button) => textOf(button) === label);
}

test("shows one Codex-style question at a time without selecting an answer", async () => {
  const view = await mountPanel();
  const panel = view.container.querySelector("[data-question-request-panel='true']");

  assert.ok(panel);
  assert.match(textOf(panel), /Question/);
  assert.match(textOf(panel), /Which folder should change\?/);
  assert.doesNotMatch(textOf(panel), /Which checks should run\?/);
  assert.equal(panel.querySelectorAll("[role='radio']").length, 2);
  assert.equal(panel.querySelector("[role='radio']").getAttribute("aria-checked"), "false");
  assert.match(textOf(panel), /Recommended/);
  assert.match(textOf(panel), /1 of 2/);

  await view.unmount();
});

test("keeps answers while moving through questions and submits the OMP response", async () => {
  const responses = [];
  const view = await mountPanel((receivedRequest, response) => responses.push([receivedRequest.id, response]));
  const panel = view.container.querySelector("[data-question-request-panel='true']");

  await click(panel.querySelectorAll("[role='radio']")[1]);
  await click(findButton(panel, "Next"));
  assert.match(textOf(panel), /Which checks should run\?/);

  const checks = panel.querySelectorAll("[role='checkbox']");
  await click(checks[0]);
  await click(checks[1]);
  await click(findButton(panel, "Send"));

  assert.equal(responses.length, 1);
  assert.equal(responses[0][0], "ask-1");
  const body = JSON.parse(responses[0][1].value);
  assert.deepEqual(body.results[0].selectedOptions, ["Tests"]);
  assert.deepEqual(body.results[1].selectedOptions, ["Tests", "Lint"]);

  await view.unmount();
});

test("supports number keys, custom answers, and Escape minimization", async () => {
  const responses = [];
  const view = await mountPanel((receivedRequest, response) => responses.push([receivedRequest.id, response]));
  let panel = view.container.querySelector("[data-question-request-panel='true']");

  await press(panel, "2");
  assert.equal(panel.querySelectorAll("[role='radio']")[1].getAttribute("aria-checked"), "true");
  await typeInto(panel.querySelector("input"), "Use both folders");
  assert.equal(panel.querySelector("input").value, "Use both folders");

  const escape = await press(panel, "Escape");
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.deepEqual(responses, []);
  const minimized = view.container.querySelector("[data-question-request-minimized='true']");
  assert.ok(minimized);

  await click(minimized);
  panel = view.container.querySelector("[data-question-request-panel='true']");
  assert.ok(panel);
  assert.equal(panel.querySelector("input").value, "Use both folders");

  await view.unmount();
});

test("Skip advances and submits earlier multi-question answers", async () => {
  const responses = [];
  const view = await mountPanel((receivedRequest, response) => responses.push([receivedRequest.id, response]));
  const panel = view.container.querySelector("[data-question-request-panel='true']");

  await click(panel.querySelectorAll("[role='radio']")[0]);
  await click(findButton(panel, "Next"));
  await click(findButton(panel, "Skip"));

  assert.equal(responses.length, 1);
  const body = JSON.parse(responses[0][1].value);
  assert.deepEqual(body.results[0].selectedOptions, ["Source"]);
  assert.deepEqual(body.results[1].selectedOptions, []);

  await view.unmount();
});

test("a single-choice click advances after the Codex 180 millisecond confirmation delay", async () => {
  const view = await mountPanel();
  const panel = view.container.querySelector("[data-question-request-panel='true']");

  await click(panel.querySelectorAll("[role='radio']")[0]);
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });

  assert.match(textOf(panel), /Which checks should run\?/);

  await view.unmount();
});

test("Skip minimizes an unanswered single question without cancelling it", async () => {
  const responses = [];
  const singleRequest = { ...request, questions: [request.questions[0]] };
  const view = await mountPanel((receivedRequest, response) => responses.push([receivedRequest.id, response]), singleRequest);
  const panel = view.container.querySelector("[data-question-request-panel='true']");

  await click(findButton(panel, "Skip"));

  assert.deepEqual(responses, []);
  assert.ok(view.container.querySelector("[data-question-request-minimized='true']"));

  await view.unmount();
});

test("a timed request submits recommended fallbacks before the OMP deadline", async () => {
  const responses = [];
  const timedRequest = { ...request, expiresAt: Date.now() + 250 };
  const view = await mountPanel((receivedRequest, response) => responses.push([receivedRequest.id, response]), timedRequest);
  const panel = view.container.querySelector("[data-question-request-panel='true']");
  const skipButton = Array.from(panel.querySelectorAll("button")).find((button) => textOf(button).startsWith("Skip"));

  assert.ok(skipButton);
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });

  assert.equal(responses.length, 1);
  const body = JSON.parse(responses[0][1].value);
  assert.deepEqual(body.results.map((result) => result.selectedOptions), [["Source"], ["Tests"]]);
  assert.deepEqual(body.results.map((result) => result.timedOut), [true, true]);

  await view.unmount();
});

test("the timeout and 180 millisecond selection timer can produce only one response", async () => {
  const responses = [];
  const singleRequest = { ...request, questions: [request.questions[0]], expiresAt: Date.now() + 150 };
  const view = await mountPanel((receivedRequest, response) => responses.push([receivedRequest.id, response]), singleRequest);
  const panel = view.container.querySelector("[data-question-request-panel='true']");

  await click(panel.querySelectorAll("[role='radio']")[1]);
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 240)); });

  assert.equal(responses.length, 1);

  await view.unmount();
});

test("routes only OMP ask requests above the composer", async () => {
  const chatWindowSource = await readFile(new URL("../ChatWindow.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./question-request-panel.module.css", import.meta.url), "utf8");

  assert.match(chatWindowSource, /displayedExtensionDialog\?\.method === "ask"[\s\S]*?<QuestionRequestPanel/);
  assert.match(chatWindowSource, /<ChatInput[\s\S]*?requestPending=\{displayedExtensionDialog\?\.method === "ask"\}/);
  assert.match(chatWindowSource, /displayedExtensionDialog\.method !== "ask"[\s\S]*?<ExtensionDialog/);
  assert.match(chatWindowSource, /params\.has\("questionDebug"\)/);
  assert.match(css, /max-width: var\(--thread-content-max-width\)/);
  assert.match(css, /\.skipButton\.skipButton\s*\{[^}]*background:\s*transparent;/);
  assert.match(css, /\.minimizedPrompt\s*\{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|\brgba?\(/i);
  assert.doesNotMatch(css, /\bInter\b/);
});
