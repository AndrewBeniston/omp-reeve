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

test("renders provider groups, a search field, and a right-side selection check", async () => {
  const selector = buildModelSelectorState({
    registry: [
      { provider: "anthropic", id: "same", name: "Claude Example", thinkingLevels: ["high"] },
      { provider: "openai", id: "same", name: "GPT Example", thinkingLevels: ["high"] },
    ],
    roles: [{ role: "default", resolved: { provider: "anthropic", modelId: "same" } }],
    currentModel: { provider: "openai", modelId: "same" },
    currentThinkingLevel: "high",
    modelScopeConfigured: false,
    filter: "gpt",
  }, label);
  const view = await mount(h(I18nProvider, null, h(ModelList, {
    selector,
    filter: "gpt",
    onFilterChange() {},
    onDefault() {},
    onModel() {},
  })));
  await settle();

  assert.equal(view.container.querySelector("input")?.getAttribute("aria-label"), "Search models");
  assert.deepEqual([...view.container.querySelectorAll("[data-model-provider]")].map((heading) => heading.textContent), ["OpenAI API"]);
  assert.equal(view.container.querySelector("[data-model-provider]")?.getAttribute("role"), null);
  assert.deepEqual(
    [...view.container.querySelectorAll("[data-model-default], [data-selection-id]")].map((row) => row.getAttribute("data-selection-id") ?? "default"),
    ["default", "openai/same:high"],
  );
  const selected = view.container.querySelector('[data-selection-id="openai/same:high"]');
  assert.equal(selected?.querySelector("[data-model-selection-check]") != null, true);

  const css = await readFile(new URL("./ModelList.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.choice\[data-selected="true"\][^{}]*\{[^}]*background:\s*var\(--ui-active\)/);
  await view.unmount();
});
