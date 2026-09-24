import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
import { React, mount, settle } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const h = React.createElement;
const { ModelList } = await jiti.import("./ModelList.tsx");
const { buildModelSelectorState } = await jiti.import("../../lib/model-selector/index.ts");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");
const { enLocale } = await jiti.import("../../lib/i18n/messages/en.ts");
const label = (key) => enLocale.messages[key] ?? key;

test("renders a flat model list with a right-side selection check", async () => {
  const selector = buildModelSelectorState({
    registry: [
      { provider: "alpha", id: "same", name: "Alpha", thinkingLevels: ["high"] },
      { provider: "beta", id: "same", name: "Beta", thinkingLevels: ["high"] },
    ],
    roles: [{ role: "default", resolved: { provider: "alpha", modelId: "same" } }],
    currentModel: { provider: "beta", modelId: "same" },
    currentThinkingLevel: "high",
  }, label);
  const view = await mount(h(I18nProvider, null, h(ModelList, {
    selector,
    filter: "",
    onDefault() {},
    onModel() {},
  })));
  await settle();

  assert.equal(view.container.querySelector("input"), null);
  assert.equal(view.container.querySelector("[data-model-provider]"), null);
  assert.deepEqual(
    [...view.container.querySelectorAll("[data-model-default], [data-selection-id]")].map((row) => row.getAttribute("data-selection-id") ?? "default"),
    ["default", "alpha/same:high", "beta/same:high"],
  );
  const selected = view.container.querySelector('[data-selection-id="beta/same:high"]');
  assert.equal(selected?.querySelector("[data-model-selection-check]") != null, true);

  const css = await readFile(new URL("./ModelList.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.choice\[data-selected="true"\][^{}]*\{[^}]*background:\s*var\(--ui-active\)/);
});
