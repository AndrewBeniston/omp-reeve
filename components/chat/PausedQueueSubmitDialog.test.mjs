import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { PausedQueueSubmitDialog } = await jiti.import("./PausedQueueSubmitDialog.tsx");

test("renders the Codex paused queue decision with the destructive action first", () => {
  const html = renderToStaticMarkup(React.createElement(PausedQueueSubmitDialog, {
    count: 3,
    busy: false,
    error: null,
    title: "Send message?",
    description: "You are about to send a message. Do you want to clear the 3 messages previously queued?",
    clearLabel: "Clear queue",
    sendLabel: "Send message",
    closeLabel: "Close",
    onClose() {},
    onClearQueue() {},
    onSendMessage() {},
  }));

  assert.match(html, /role="dialog"/);
  assert.match(html, /Send message\?/);
  assert.match(html, /clear the 3 messages previously queued/);
  assert.match(html, /aria-label="Close"/);
  assert.ok(html.indexOf("Clear queue") < html.indexOf("Send message</span>"));
});

test("uses the shipped Codex modal surface and focuses Clear queue first", async () => {
  const source = await readFile(new URL("./PausedQueueSubmitDialog.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./paused-queue-submit-dialog.module.css", import.meta.url), "utf8");

  assert.match(source, /initialFocus=\{clearButtonRef\}/);
  assert.match(source, /ref=\{clearButtonRef\}/);
  assert.match(css, /width:\s*min\(520px, calc\(100vw - 32px\)\)/);
  assert.match(css, /padding:\s*20px/);
  assert.match(css, /border-radius:\s*24px/);
  assert.match(css, /\.actions\s*\{[^}]*justify-content:\s*flex-end;[^}]*gap:\s*12px/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});
