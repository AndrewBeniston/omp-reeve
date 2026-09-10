import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

import { DomEvent, React, click, domDocument, mount, press, tabbable, textOf, typeInto } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ExtensionDialog, ExtensionCustomPanel } = await jiti.import("./ExtensionDialogs.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

const askRequest = {
  type: "extension_ui_request",
  id: "ask-1",
  method: "ask",
  questions: [{
    id: "q1",
    header: "Scope",
    question: "Which folder do you want?",
    options: [{ label: "Source" }, { label: "Tests", description: "Only the tests" }],
    recommended: 0,
  }],
};

const planRequest = {
  type: "extension_ui_request",
  id: "plan-1",
  method: "plan_review",
  title: "Refactor the parser",
  planFilePath: "/tmp/plan.md",
  planContent: "Step one",
};

const confirmRequest = {
  type: "extension_ui_request",
  id: "confirm-1",
  method: "confirm",
  title: "Delete the branch",
  message: "This removes the branch.",
};

const inputRequest = {
  type: "extension_ui_request",
  id: "input-1",
  method: "input",
  title: "Name the session",
  placeholder: "Session name",
};

const editorRequest = {
  type: "extension_ui_request",
  id: "editor-1",
  method: "editor",
  title: "Edit the message",
  prefill: "Draft",
};

const customRequest = {
  type: "extension_ui_request",
  id: "custom-1",
  method: "custom",
  lines: ["first line", "second line"],
};

async function mountWithTrigger(element) {
  const view = await mount(h(I18nProvider, null, h("div", null, h("button", { type: "button" }, "Open"), element)));
  return view;
}

function surface() {
  return domDocument.body.querySelector("[role='dialog']");
}

function backdrop() {
  return surface().parentElement;
}

async function mouseDown(target) {
  const event = new DomEvent("mousedown", { bubbles: true, cancelable: true, button: 0, detail: 1 });
  await React.act(async () => { target.dispatchEvent(event); });
  return event;
}

test("each dialog takes its name from its own heading", async () => {
  const view = await mountWithTrigger(h(ExtensionDialog, { request: askRequest, onRespond() {} }));
  const dialog = surface();
  const heading = dialog.querySelector(`#${dialog.getAttribute("aria-labelledby")}`);

  assert.ok(heading, "the dialog points at a real heading");
  assert.equal(heading.tagName, "H2");
  // The decorative mark stays out of the name.
  assert.equal(heading.querySelector("[aria-hidden='true']").getAttribute("aria-hidden"), "true");
  assert.match(textOf(heading), /Agent needs your input/);

  const described = dialog.querySelector(`#${dialog.getAttribute("aria-describedby")}`);
  assert.match(textOf(described), /Choose an option or provide a custom response\./);

  await view.unmount();
});

test("the question dialog traps Tab inside the surface", async () => {
  const view = await mountWithTrigger(h(ExtensionDialog, { request: askRequest, onRespond() {} }));
  const dialog = surface();
  const reachable = tabbable(dialog);
  const outside = view.container.querySelector("button");

  assert.ok(reachable.length >= 4, "the dialog exposes its options and its actions");
  assert.equal(reachable.includes(outside), false, "the trigger stays outside the trap");

  const last = reachable[reachable.length - 1];
  last.focus();
  const forward = await press(last, "Tab");
  assert.equal(forward.defaultPrevented, true);
  assert.equal(domDocument.activeElement, reachable[0]);

  const backward = await press(reachable[0], "Tab", { shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.equal(domDocument.activeElement, last);

  await view.unmount();
});

test("the question dialog cancels on Escape and on a backdrop click", async () => {
  const escapeCalls = [];
  const escapeView = await mountWithTrigger(h(ExtensionDialog, {
    request: askRequest,
    onRespond: (request, response) => escapeCalls.push([request.id, response]),
  }));
  const escapeEvent = await press(surface(), "Escape");

  assert.equal(escapeEvent.defaultPrevented, true);
  // The open dialog owns Escape, so the global abort shortcut cannot also react.
  assert.equal(escapeEvent.propagationStopped, true);
  assert.deepEqual(escapeCalls, [["ask-1", { cancelled: true }]]);
  await escapeView.unmount();

  const backdropCalls = [];
  const backdropView = await mountWithTrigger(h(ExtensionDialog, {
    request: askRequest,
    onRespond: (request, response) => backdropCalls.push([request.id, response]),
  }));
  await mouseDown(backdrop());

  assert.deepEqual(backdropCalls, [["ask-1", { cancelled: true }]]);
  await backdropView.unmount();
});

test("the question dialog returns focus to the trigger when it closes", async () => {
  const view = await mount(h(I18nProvider, null, h(DialogHost, { request: askRequest })));
  const trigger = view.container.querySelector("button");
  trigger.focus();
  assert.equal(domDocument.activeElement, trigger);

  await click(trigger);
  const dialog = surface();
  assert.ok(dialog, "the dialog opens");
  assert.equal(dialog.contains(domDocument.activeElement), true, "focus moves inside");

  await press(dialog, "Escape");
  assert.equal(surface(), null, "the dialog closes");
  assert.equal(domDocument.activeElement, trigger, "focus returns to the trigger");

  await view.unmount();
});

function DialogHost({ request }) {
  const [open, setOpen] = React.useState(false);
  return h(
    "div",
    null,
    h("button", { type: "button", onClick: () => setOpen(true) }, "Open"),
    open ? h(ExtensionDialog, { request, onRespond: () => setOpen(false) }) : null,
  );
}

test("the question dialog keeps its form, its selection, and its callbacks", async () => {
  const responses = [];
  const view = await mountWithTrigger(h(ExtensionDialog, {
    request: askRequest,
    onRespond: (request, response) => responses.push(response),
  }));
  const options = surface().querySelectorAll("[role='radio']");

  assert.equal(options.length, 2);
  assert.equal(options[0].getAttribute("aria-checked"), "true", "the recommended option starts selected");
  assert.equal(options[1].getAttribute("aria-checked"), "false");

  await click(options[1]);
  assert.equal(options[0].getAttribute("aria-checked"), "false");
  assert.equal(options[1].getAttribute("aria-checked"), "true");

  const submit = surface()
    .querySelectorAll("button")
    .find((button) => textOf(button) === "Submit answer");
  await click(submit);

  assert.equal(responses.length, 1);
  const payload = JSON.parse(responses[0].value);
  assert.equal(payload.kind, "submit");
  assert.deepEqual(payload.results[0].selectedOptions, ["Tests"]);

  await view.unmount();
});

test("the question dialog blocks the submit button until an answer exists", async () => {
  const emptyRequest = {
    ...askRequest,
    questions: [{ ...askRequest.questions[0], recommended: undefined }],
  };
  const view = await mountWithTrigger(h(ExtensionDialog, { request: emptyRequest, onRespond() {} }));
  const submit = surface()
    .querySelectorAll("button")
    .find((button) => textOf(button) === "Submit answer");

  assert.equal(submit.hasAttribute("disabled"), true);
  assert.equal(tabbable(surface()).includes(submit), false);

  await click(surface().querySelectorAll("[role='radio']")[0]);
  assert.equal(submit.hasAttribute("disabled"), false);

  await view.unmount();
});

test("the plan dialog refuses Escape and refuses a backdrop click", async () => {
  const responses = [];
  const view = await mountWithTrigger(h(ExtensionDialog, {
    request: planRequest,
    onRespond: (request, response) => responses.push(response),
  }));
  const dialog = surface();

  const escape = await press(dialog, "Escape");
  assert.equal(escape.defaultPrevented, false, "a non-dismissible dialog does not consume Escape");
  assert.equal(escape.propagationStopped, true, "the global shortcut still stays out");
  await mouseDown(backdrop());

  assert.deepEqual(responses, [], "the plan dialog stays open");
  assert.ok(surface(), "the surface remains");

  await view.unmount();
});

test("the plan dialog keeps the feedback field, the refine action, and the approve action", async () => {
  const responses = [];
  const view = await mountWithTrigger(h(ExtensionDialog, {
    request: planRequest,
    onRespond: (request, response) => responses.push(response),
  }));
  const dialog = surface();

  assert.match(textOf(dialog), /Refactor the parser/);
  assert.match(textOf(dialog), /\/tmp\/plan\.md/);
  assert.ok(dialog.querySelector("textarea"), "the feedback field stays");

  const buttons = dialog.querySelectorAll("button");
  const approve = buttons.find((button) => textOf(button) === "Approve and implement");
  assert.ok(buttons.find((button) => textOf(button) === "Continue planning"), "the refine action stays");
  assert.ok(approve, "the approve action stays");
  await click(approve);

  assert.equal(responses.length, 1);
  assert.deepEqual(JSON.parse(responses[0].value), { action: "approve" });

  await view.unmount();
});

test("the extension dialog keeps the confirm action and the cancel action", async () => {
  const responses = [];
  const view = await mountWithTrigger(h(ExtensionDialog, {
    request: confirmRequest,
    onRespond: (request, response) => responses.push(response),
  }));
  const dialog = surface();

  assert.match(textOf(dialog), /Delete the branch/);
  assert.match(textOf(dialog), /This removes the branch\./);

  const confirm = dialog.querySelectorAll("button").find((button) => textOf(button) === "Confirm");
  await click(confirm);
  assert.deepEqual(responses, [{ confirmed: true }]);

  await view.unmount();
});

test("the extension input dialog keeps Enter to submit", async () => {
  const responses = [];
  const view = await mountWithTrigger(h(ExtensionDialog, {
    request: inputRequest,
    onRespond: (request, response) => responses.push(response),
  }));
  const field = surface().querySelector("input");

  assert.equal(field.getAttribute("placeholder"), "Session name");
  await typeInto(field, "release");
  await press(field, "Enter");

  assert.deepEqual(responses, [{ value: "release" }]);

  await view.unmount();
});

for (const [method, request, selector] of [
  ["input", inputRequest, "input"],
  ["editor", editorRequest, "textarea"],
]) {
  test(`the extension ${method} dialog sends one cancellation for a real Escape event`, async () => {
    const protocolResponses = [];
    const view = await mountWithTrigger(h(ExtensionDialog, {
      request,
      onRespond: (responseRequest, response) => protocolResponses.push({
        type: "extension_ui_response",
        id: responseRequest.id,
        ...response,
      }),
    }));
    const field = surface().querySelector(selector);

    const escape = await press(field, "Escape");

    assert.equal(escape.defaultPrevented, true);
    assert.equal(escape.propagationStopped, true);
    assert.deepEqual(protocolResponses, [{
      type: "extension_ui_response",
      id: request.id,
      cancelled: true,
    }]);

    await view.unmount();
  });
}

test("the custom panel keeps Escape for the terminal and never closes on it", async () => {
  const sent = [];
  const view = await mountWithTrigger(h(ExtensionCustomPanel, {
    request: customRequest,
    onInput: (request, data) => sent.push(data),
  }));
  const field = surface().querySelector("textarea");

  assert.equal(domDocument.activeElement, field, "the terminal field takes focus");

  const escape = await press(field, "Escape");
  assert.equal(sent.includes("\u001b"), true, "Escape reaches the terminal");
  assert.equal(escape.defaultPrevented, true);
  assert.ok(surface(), "the panel stays open");

  await mouseDown(backdrop());
  assert.ok(surface(), "a backdrop click does not close the panel");

  await view.unmount();
});

test("the custom panel keeps its output and its close control", async () => {
  const sent = [];
  const view = await mountWithTrigger(h(ExtensionCustomPanel, {
    request: customRequest,
    onInput: (request, data) => sent.push(data),
  }));
  const dialog = surface();

  assert.match(textOf(dialog), /first line/);
  assert.match(textOf(dialog), /second line/);

  const close = dialog.querySelectorAll("button").find((button) => textOf(button) === "Close");
  await click(close);
  assert.equal(sent.includes("\u0003"), true, "Close sends the interrupt");

  await view.unmount();
});

test("each dialog keeps its own surface width in the transcript CSS module", async () => {
  const css = await readFile(new URL("./chat-window.module.css", import.meta.url), "utf8");

  // The repeated class name wins over the shared recipe class in any bundle order.
  assert.match(css, /\.questionDialog\.questionDialog \{[^}]*width: min\(720px, 100%\)/);
  assert.match(css, /\.planDialog\.planDialog \{[^}]*width: min\(820px, 100%\)/);
  assert.match(css, /\.extensionDialog\.extensionDialog \{[^}]*width: min\(560px, 100%\)/);
  assert.match(css, /\.customPanel\.customPanel \{[^}]*width: min\(920px, 100%\)/);
});
