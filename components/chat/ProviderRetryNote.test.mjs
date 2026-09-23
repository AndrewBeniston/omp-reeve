import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ProviderRetryNote } = await jiti.import("./ProviderRetryNote.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

async function renderNote(props) {
  return mount(h(I18nProvider, null, h(ProviderRetryNote, props)));
}

test("shows provider retry progress when attempt and maximum are known", async () => {
  const view = await renderNote({ attempt: 1, maxAttempts: 5 });
  const note = view.container.querySelector('[data-transcript-note="provider-retry"]');

  assert.ok(note);
  assert.equal(note.getAttribute("role"), "status");
  assert.equal(textOf(note), "Retrying (1/5)…");
  assert.equal(note.querySelector('[data-retry-attempt]')?.getAttribute("data-roll"), "true");
  await view.unmount();
});

for (const props of [
  { attempt: 1, maxAttempts: undefined },
  { attempt: undefined, maxAttempts: 5 },
]) {
  test("shows bare provider retry status when either counter value is missing", async () => {
    const view = await renderNote(props);
    const note = view.container.querySelector('[data-transcript-note="provider-retry"]');

    assert.equal(textOf(note), "Retrying…");
    assert.equal(note?.querySelector("[data-retry-counter]"), null);
    await view.unmount();
  });
}

test("uses tabular counter figures and rolls the attempt", () => {
  const css = readFileSync(new URL("./provider-retry-note.module.css", import.meta.url), "utf8");

  assert.match(css, /\.counter\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
  assert.match(css, /\.attempt\s*\{[^}]*animation:\s*providerRetryRoll/s);
  assert.match(css, /@keyframes providerRetryRoll/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("stores the provider retry strings in the transcript namespace", () => {
  assert.equal(enLocale.messages["transcript.providerRetrying"], "Retrying…");
  assert.equal(enLocale.messages["transcript.providerRetryProgressStart"], "Retrying (");
  assert.equal(enLocale.messages["transcript.providerRetryProgressDenominator"], "/{maxAttempts}");
  assert.equal(enLocale.messages["transcript.providerRetryProgressEnd"], ")…");
  assert.ok(zhCNLocale.messages["transcript.providerRetrying"]);
  assert.ok(zhCNLocale.messages["transcript.providerRetryProgressStart"]);
  assert.ok(zhCNLocale.messages["transcript.providerRetryProgressDenominator"]);
  assert.ok(zhCNLocale.messages["transcript.providerRetryProgressEnd"]);
});

test("re-exports ProviderRetryNote from transcript-rows", async () => {
  const { ProviderRetryNote: ReExported } = await jiti.import("./transcript-rows.ts");
  assert.equal(ReExported, ProviderRetryNote);
});

test("ChatWindow renders the live provider retry note after the visible transcript rows", () => {
  const source = readFileSync(new URL("../ChatWindow.tsx", import.meta.url), "utf8");
  assert.match(source, /\{rendered\.slice\(startIndex\)\}\s*\{retryInfo \? <ProviderRetryNote \{\.\.\.retryInfo\} \/> : null\}/);
});
