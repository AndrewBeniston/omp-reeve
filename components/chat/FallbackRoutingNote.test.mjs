import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { FallbackRoutingNote } = await jiti.import("./FallbackRoutingNote.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const { zhCNLocale } = await jiti.import("../../lib/i18n/messages/zh-CN.ts");
const h = React.createElement;

test("shows the neutral fallback routing wording", async () => {
  const view = await mount(h(I18nProvider, null, h(FallbackRoutingNote, {
    toModel: "openai/model-fallback",
  })));
  const note = view.container.querySelector('[data-transcript-note="fallback-route"]');

  assert.ok(note);
  assert.equal(textOf(note), "Your request was routed to openai/model-fallback.");
  assert.doesNotMatch(textOf(note), /cyber|abuse/i);
  await view.unmount();
});

test("stores the fallback routing string in both locales", () => {
  assert.equal(
    enLocale.messages["transcript.fallbackRouting"],
    "Your request was routed to {toModel}.",
  );
  assert.ok(zhCNLocale.messages["transcript.fallbackRouting"]);
});
