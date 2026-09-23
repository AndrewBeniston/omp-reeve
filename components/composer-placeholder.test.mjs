import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { selectComposerPlaceholder } = await jiti.import("./composer-placeholder.ts");
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

function renderChatInput(props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
        ...props,
      }),
    ),
  );
}

test("selects the working placeholder before later slots", () => {
  const calls = [];

  const placeholder = selectComposerPlaceholder({
    working: () => {
      calls.push("working");
      return "working";
    },
    callerOverride: () => {
      calls.push("caller override");
      return "override";
    },
    fallback: () => {
      calls.push("fallback");
      return "fallback";
    },
  });

  assert.equal(placeholder, "working");
  assert.deepEqual(calls, ["working"]);
});

test("selects a caller override before the fallback", () => {
  const calls = [];

  const placeholder = selectComposerPlaceholder({
    working: () => {
      calls.push("working");
      return undefined;
    },
    callerOverride: () => {
      calls.push("caller override");
      return "override";
    },
    fallback: () => {
      calls.push("fallback");
      return "fallback";
    },
  });

  assert.equal(placeholder, "override");
  assert.deepEqual(calls, ["working", "caller override"]);
});

test("uses the message fallback when no earlier slot matches", () => {
  const placeholder = selectComposerPlaceholder({
    working: () => undefined,
    callerOverride: () => undefined,
    fallback: () => "fallback",
  });

  assert.equal(placeholder, "fallback");
});

test("renders the working placeholder while streaming without steer or queue handlers", () => {
  const html = renderChatInput({ isStreaming: true });

  assert.ok(html.includes('data-placeholder="Agent is running…"'));
});

test("renders the caller placeholder while steer or queue handlers are available", () => {
  const html = renderChatInput({
    isStreaming: true,
    onSteer() {},
    onFollowUp() {},
  });

  assert.ok(html.includes('data-placeholder="Steer now / queue follow-up..."'));
});

test("renders the message placeholder while idle", () => {
  const html = renderChatInput();

  assert.ok(html.includes('data-placeholder="Message… Type / for commands, @ for files and more"'));
});
