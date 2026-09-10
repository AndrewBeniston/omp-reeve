import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ComposerAutocomplete } = await jiti.import("./ComposerAutocomplete.tsx");
const autocompleteCss = readFileSync(new URL("./composer-autocomplete.module.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../../app/tokens.css", import.meta.url), "utf8");

test("uses theme-derived neutral colours with a visible active row", () => {
  assert.match(tokensCss, /--ui-autocomplete-active:\s*color-mix\(in srgb, var\(--text\) 16%, var\(--bg-panel\)\)/);
  assert.match(autocompleteCss, /\.item\[data-active="true"\]\s*\{[^}]*background:\s*var\(--ui-autocomplete-active\)/s);
  assert.match(autocompleteCss, /\.item\[data-active="true"\]\s+\.icon\s*\{[^}]*color:\s*var\(--ui-text\)/s);
  assert.doesNotMatch(autocompleteCss, /\.icon\[data-kind="skill"\][\s\S]*?var\(--ui-accent\)/);
});

test("renders Codex-style grouped rows with labels, details, and scope", () => {
  const html = renderToStaticMarkup(React.createElement(ComposerAutocomplete, {
    sections: [{
      id: "skills",
      items: [{
        id: "skill:codebase-design",
        group: "skills",
        kind: "skill",
        label: "Codebase Design",
        raw: "/skill:codebase-design",
        detail: "Design deep modules.",
        rightLabel: "User",
        searchTerms: [],
      }],
    }],
    activeIndex: 0,
    loading: false,
    label: "Add files and more",
    emptyText: "No results",
    groupLabels: { agents: "Live agents", commands: "Commands", files: "Files", plugins: "Plugins", skills: "Skills" },
    loadingText: "Loading…",
    onActiveIndexChange() {},
    onSelect() {},
  }));

  assert.match(html, /role="listbox"[^>]+aria-label="Add files and more"/);
  assert.match(html, /aria-label="Skills"/);
  assert.match(html, /Codebase Design/);
  assert.match(html, /Design deep modules\./);
  assert.match(html, />User</);
  assert.match(html, /aria-selected="true"/);
  assert.doesNotMatch(html, /SKILL\.md/);
});

test("renders a semantic command icon instead of a slash glyph", () => {
  const html = renderToStaticMarkup(React.createElement(ComposerAutocomplete, {
    sections: [{
      id: "commands",
      items: [{
        id: "slash:builtin:computer",
        group: "commands",
        kind: "command",
        icon: "computer",
        label: "Computer",
        raw: "/computer",
        detail: "Toggle computer use",
        searchTerms: [],
      }],
    }],
    activeIndex: 0,
    loading: false,
    label: "Slash commands",
    emptyText: "No commands",
    groupLabels: { agents: "Live agents", commands: "Commands", files: "Files", plugins: "Plugins", skills: "Skills" },
    loadingText: "Loading…",
    onActiveIndexChange() {},
    onSelect() {},
  }));

  assert.match(html, /lucide-monitor/);
  assert.doesNotMatch(html, />\s*\/\s*</);
});
