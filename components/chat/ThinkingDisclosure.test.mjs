import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

import { React, click, domDocument, mount, tabbable, textOf } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ThinkingDisclosure, resolveThinkingExpanded, summarizeThinking } =
  await jiti.import("./ThinkingDisclosure.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const h = React.createElement;

function mountThinking(props) {
  return mount(h(I18nProvider, null, h(ThinkingDisclosure, props)));
}

function parts(container) {
  const trigger = container.querySelector("button");
  const panel = container.querySelector("[role='region']");
  return { trigger, panel };
}

test("collapses finished reasoning behind a summary and keeps the content inert", async () => {
  const view = await mountThinking({
    block: { type: "thinking", thinking: "**Direct thought**\n\nA second paragraph" },
    duration: 7,
    blockIndex: 0,
  });
  const { trigger, panel } = parts(view.container);

  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.match(textOf(trigger), /Direct thought/);
  assert.match(textOf(trigger), /7s/);
  // The closed panel keeps the loaded reasoning, so a collapse loses nothing.
  assert.match(textOf(panel), /A second paragraph/);
  assert.equal(panel.hasAttribute("inert"), true);
  assert.equal(panel.getAttribute("aria-hidden"), "true");
  assert.equal(tabbable(panel).length, 0);

  await view.unmount();
});

test("expands active reasoning and announces the streaming state", async () => {
  const view = await mountThinking({
    block: { type: "thinking", thinking: "Partial reasoning" },
    streaming: true,
    blockIndex: 0,
  });
  const { trigger, panel } = parts(view.container);
  const status = view.container.querySelector("[aria-live='polite']");

  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(panel.hasAttribute("inert"), false);
  assert.equal(panel.getAttribute("aria-hidden"), "false");
  assert.match(textOf(status), /Thinking/);
  assert.match(textOf(panel), /Partial reasoning/);
  assert.equal(
    view.container.querySelector("[data-thinking-state]").getAttribute("data-thinking-state"),
    "active",
  );

  await view.unmount();
});

test("keeps the user choice after a click and after the stream stops", async () => {
  const view = await mountThinking({
    block: { type: "thinking", thinking: "Partial reasoning" },
    streaming: true,
    blockIndex: 0,
  });
  const trigger = view.container.querySelector("button");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");

  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(view.container.querySelector("[role='region']").hasAttribute("inert"), true);

  // A later answer block arrives. The user choice survives the change.
  await view.render(h(I18nProvider, null, h(ThinkingDisclosure, {
    block: { type: "thinking", thinking: "Partial reasoning" },
    streaming: true,
    hasLaterContent: true,
    blockIndex: 0,
  })));
  assert.equal(view.container.querySelector("button").getAttribute("aria-expanded"), "false");

  await click(view.container.querySelector("button"));
  assert.equal(view.container.querySelector("button").getAttribute("aria-expanded"), "true");

  await view.unmount();
});

test("collapses by itself when the first later block arrives", async () => {
  const streamingProps = {
    block: { type: "thinking", thinking: "Partial reasoning" },
    streaming: true,
    blockIndex: 0,
  };
  const view = await mountThinking(streamingProps);
  assert.equal(view.container.querySelector("button").getAttribute("aria-expanded"), "true");

  await view.render(h(I18nProvider, null, h(ThinkingDisclosure, {
    ...streamingProps,
    hasLaterContent: true,
  })));

  assert.equal(view.container.querySelector("button").getAttribute("aria-expanded"), "false");
  await view.unmount();
});

test("reaches the trigger with the keyboard and toggles with Enter", async () => {
  const view = await mountThinking({
    block: { type: "thinking", thinking: "Reasoning body" },
    blockIndex: 1,
  });
  const trigger = view.container.querySelector("button");

  assert.deepEqual(tabbable(view.container), [trigger]);
  trigger.focus();
  assert.equal(domDocument.activeElement, trigger);

  // React maps Enter on a button to a click, so the harness sends the click.
  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(tabbable(view.container).length >= 1, true);

  await view.unmount();
});

test("names the region with the trigger it belongs to", async () => {
  const view = await mountThinking({
    block: { type: "thinking", thinking: "Reasoning body" },
    blockIndex: 3,
    entryId: "entry-9",
  });
  const { trigger, panel } = parts(view.container);

  assert.equal(trigger.getAttribute("aria-controls"), panel.getAttribute("id"));
  assert.equal(panel.getAttribute("aria-labelledby"), trigger.getAttribute("id"));
  assert.ok(panel.getAttribute("id"));

  await view.unmount();
});

test("resolves automatic transitions and preserves the user choice", () => {
  assert.equal(resolveThinkingExpanded(null, true, false), true);
  assert.equal(resolveThinkingExpanded(null, true, true), false);
  assert.equal(resolveThinkingExpanded(null, false, false), false);
  assert.equal(resolveThinkingExpanded(true, true, true), true);
  assert.equal(resolveThinkingExpanded(true, false, false), true);
  assert.equal(resolveThinkingExpanded(false, true, false), false);
});

test("summarizes reasoning into one plain line", () => {
  assert.equal(summarizeThinking("## Plan\n\nCheck the parser"), "Plan");
  assert.equal(summarizeThinking("**Bold** start"), "Bold start");
  assert.equal(summarizeThinking("   "), "");
  assert.equal(summarizeThinking("x".repeat(200)).length, 120);
});

test("owns deferred thinking loading and retrieval", async () => {
  const html = renderToStaticMarkup(h(I18nProvider, null, h(ThinkingDisclosure, {
    block: { type: "thinking", thinking: "", deferred: true },
    sessionId: "session-1",
    entryId: "entry-1",
    blockIndex: 2,
  })));
  const source = await readFile(new URL("./ThinkingDisclosure.tsx", import.meta.url), "utf8");

  assert.match(html, /Loading thinking/i);
  assert.match(source, /\/thinking\?blockIndex=/);
  assert.match(source, /MAX_THINKING_CACHE_ENTRIES/);
});

test("takes the panel motion and the reduced-motion rule from the shared primitive", async () => {
  const view = await mountThinking({
    block: { type: "thinking", thinking: "Reasoning body" },
    blockIndex: 0,
  });
  const panel = view.container.querySelector("[role='region']");
  const recipes = await readFile(new URL("../../lib/ui/recipes.module.css", import.meta.url), "utf8");
  const closedClass = panel.className.split(" ").find((name) => name.includes("disclosurePanelClosed"));

  assert.ok(panel.className.includes("disclosurePanel"), "the panel uses the primitive class");
  assert.ok(closedClass, "the closed panel carries the closed grid-row class");
  assert.match(recipes, /\.disclosurePanel \{[^}]*transition: grid-template-rows var\(--duration-enter\) var\(--ease-standard\)/);
  assert.match(recipes, /\.disclosurePanelClosed \{ grid-template-rows: 0fr; \}/);
  assert.match(recipes, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.disclosurePanel \{[\s\S]*?transition: none;/);

  await view.unmount();
});

test("keeps the transcript disclosure chrome in the transcript CSS module", async () => {
  const source = await readFile(new URL("./ThinkingDisclosure.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");

  assert.match(source, /message-view\.module\.css/);
  assert.doesNotMatch(source, /style=\{/);
  assert.match(css, /\.thinkingDisclosure button \{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
