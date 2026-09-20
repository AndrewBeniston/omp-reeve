import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerAutocomplete } = await jiti.import("./ComposerAutocomplete.tsx");
const { buildSlashSections } = await jiti.import("../../lib/composer-intelligence.ts");
const autocompleteCss = readFileSync(new URL("./composer-autocomplete.module.css", import.meta.url), "utf8");

const commands = [
  { name: "review", description: "Ask the agent to review my changes", source: "builtin" },
  { name: "compact", description: "Compact the context", source: "builtin" },
];

test("a gated command is listed with its reason, not hidden", () => {
  const sections = buildSlashSections({
    query: "",
    commands,
    skills: [],
    disabledCommands: new Set(["review"]),
  });
  const items = sections.flatMap((section) => section.items);
  const review = items.find((item) => item.raw === "/review");
  assert.ok(review, "the entry is still offered");
  assert.equal(review.disabled, true);
  // Only the gated one changes.
  assert.equal(items.find((item) => item.raw === "/compact").disabled, undefined);
  assert.equal(buildSlashSections({ query: "", commands, skills: [] })
    .flatMap((section) => section.items)
    .find((item) => item.raw === "/review").disabled, undefined);
});

test("a disabled row is drawn, announced, and cannot be chosen", () => {
  const picked = [];
  const sections = buildSlashSections({ query: "", commands, skills: [], disabledCommands: new Set(["review"]) });
  const html = renderToStaticMarkup(React.createElement(ComposerAutocomplete, {
    sections,
    activeIndex: 0,
    loading: false,
    label: "Commands",
    emptyText: "No commands",
    groupLabels: { commands: "Commands", skills: "Skills", files: "Files", plugins: "Plugins", agents: "Agents" },
    loadingText: "Loading",
    onActiveIndexChange: () => {},
    onSelect: (item) => picked.push(item.raw),
  }));
  assert.match(html, /data-disabled="true"/);
  assert.match(html, /aria-disabled="true"/);
  assert.deepEqual(picked, []);
  assert.match(autocompleteCss, /\.item\[data-disabled="true"\]\s*\{[^}]*opacity:\s*var\(--ui-disabled-opacity\)/s);
});
