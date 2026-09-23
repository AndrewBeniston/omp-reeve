import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, click, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { SessionOriginNote } = await jiti.import("./SessionOriginNote.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

test("a continued Session opens its source Session", async () => {
  let openedSessionId;
  const view = await mount(h(I18nProvider, null, h(SessionOriginNote, {
    kind: "continued",
    relatedSessionId: "source-session",
    onOpenSession: (sessionId) => { openedSessionId = sessionId; },
  })));
  const note = view.container.querySelector('[data-transcript-note="session-origin"]');

  assert.ok(note);
  assert.equal(textOf(note), "Continued from chat");
  await click(note.querySelector("button"));
  assert.equal(openedSessionId, "source-session");
  await view.unmount();
});

test("a forked sub-agent Session opens its parent Session", async () => {
  let openedSessionId;
  const view = await mount(h(I18nProvider, null, h(SessionOriginNote, {
    kind: "parent",
    relatedSessionId: "parent-session",
    onOpenSession: (sessionId) => { openedSessionId = sessionId; },
  })));
  const note = view.container.querySelector('[data-transcript-note="session-origin"]');

  assert.ok(note);
  assert.equal(textOf(note), "Parent chat");
  await click(note.querySelector("button"));
  assert.equal(openedSessionId, "parent-session");
  await view.unmount();
});

test("the continued label uses a fixed-width truncation", () => {
  const css = readFileSync(new URL("./session-origin-note.module.css", import.meta.url), "utf8");

  assert.match(css, /\.label\s*\{[^}]*width:\s*140px;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
});

test("stores the Session origin strings in the transcript namespace", () => {
  assert.equal(enLocale.messages["transcript.continuedFromChat"], "Continued from chat");
  assert.equal(enLocale.messages["transcript.parentChat"], "Parent chat");
  assert.ok(zhCNLocale.messages["transcript.continuedFromChat"]);
  assert.ok(zhCNLocale.messages["transcript.parentChat"]);
});
