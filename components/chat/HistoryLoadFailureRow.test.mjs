import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { HistoryLoadFailureRow } = await jiti.import("./HistoryLoadFailureRow.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

async function renderRow(props = {}) {
  return mount(h(I18nProvider, null, h(HistoryLoadFailureRow, props)));
}

test("shows an alert with a retry action at the failed page boundary", async () => {
  let calls = 0;
  const view = await renderRow({ onRetry: () => { calls += 1; } });
  const row = view.container.querySelector('[data-transcript-note="history-load-failure"]');
  const retry = row?.querySelector("[data-history-retry]");

  assert.ok(row);
  assert.equal(row.getAttribute("role"), "alert");
  assert.match(textOf(row), /Couldn't load earlier messages/);
  assert.equal(textOf(retry), "Retry");
  await React.act(async () => retry.click());
  assert.equal(calls, 1);
  await view.unmount();
});

test("disables the retry action while the same request is running", async () => {
  const view = await renderRow({ onRetry: () => {}, retrying: true });
  const retry = view.container.querySelector("[data-history-retry]");

  assert.equal(retry.hasAttribute("disabled"), true);
  assert.equal(retry.getAttribute("aria-busy"), "true");
  await view.unmount();
});

test("stacks the message and action on narrow widths", () => {
  const css = readFileSync(new URL("./history-load-failure-row.module.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:[^)]+\)/);
  assert.match(css, /\.row[^{}]*\{[^}]*flex-wrap:\s*wrap/s);
});

test("stores both strings in every locale", () => {
  assert.equal(enLocale.messages["transcript.historyLoadFailed"], "Couldn't load earlier messages");
  assert.equal(enLocale.messages["transcript.retryHistoryLoad"], "Retry");
  assert.ok(zhCNLocale.messages["transcript.historyLoadFailed"]);
  assert.ok(zhCNLocale.messages["transcript.retryHistoryLoad"]);
});

test("ChatWindow mounts the row before the transcript at the failed boundary", () => {
  const source = readFileSync(new URL("../ChatWindow.tsx", import.meta.url), "utf8");

  assert.match(source, /<HistoryLoadFailureRow[\s\S]*?\/>/);
  assert.ok(source.indexOf("<HistoryLoadFailureRow") < source.indexOf("{rendered.slice(startIndex)}"));
});
