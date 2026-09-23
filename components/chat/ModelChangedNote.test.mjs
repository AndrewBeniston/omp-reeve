import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ModelChangedNote } = await jiti.import("./ModelChangedNote.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

test("shows a model-change divider and its two warning lines", async () => {
  const view = await mount(h(I18nProvider, null, h(ModelChangedNote, {
    fromModel: "openai/model-a",
    toModel: "anthropic/model-b",
  })));
  const note = view.container.querySelector('[data-transcript-note="model-changed"]');
  const tooltip = note?.querySelector('[role="tooltip"]');

  assert.ok(note);
  assert.match(textOf(note), /Model changed from openai\/model-a to anthropic\/model-b\./);
  assert.match(textOf(tooltip), /Changing models mid-conversation will degrade performance\./);
  assert.match(textOf(tooltip), /Context may automatically compact\./);
  assert.equal(tooltip?.querySelectorAll("[data-warning-line]").length, 2);
  await view.unmount();
});

test("stores the model-change strings in the transcript namespace", () => {
  assert.equal(enLocale.messages["transcript.modelChanged"], "Model changed from {fromModel} to {toModel}.");
  assert.equal(enLocale.messages["transcript.modelChangedWarningLine1"], "Changing models mid-conversation will degrade performance.");
  assert.equal(enLocale.messages["transcript.modelChangedWarningLine2"], "Context may automatically compact.");
  assert.ok(zhCNLocale.messages["transcript.modelChanged"]);
  assert.ok(zhCNLocale.messages["transcript.modelChangedWarningLine1"]);
  assert.ok(zhCNLocale.messages["transcript.modelChangedWarningLine2"]);
});

test("centers the narrow warning tooltip over the note trigger", () => {
  const css = readFileSync(new URL("./model-changed-note.module.css", import.meta.url), "utf8");

  assert.match(css, /\.warningTooltip\s*\{[^}]*width:\s*min\(280px, calc\(100vw - 32px\)\);/s);
  assert.match(css, /\.warningTooltip\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s);
  assert.match(css, /\.tooltipTrigger:hover \.warningTooltip/s);
  assert.match(css, /\.tooltipTrigger:focus-visible \.warningTooltip/s);
});
