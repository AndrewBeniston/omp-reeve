import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ComposerSourceMenu } = await jiti.import("./ComposerSourceMenu.tsx");

const groupLabels = {
  agents: "Agents",
  commands: "Commands",
  files: "Files",
  liveAgents: "Live agents",
  mcp: "MCP servers",
  plugins: "Plugins",
  sessions: "Chats",
  skills: "Skills",
  tabs: "Tabs",
};

function renderMenu(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ComposerSourceMenu, {
    variant: "mentions",
    sections: [],
    activeIndex: 0,
    loadingGroups: [],
    label: "Add files and more",
    emptyText: "No results",
    groupLabels,
    loadingText: "Loading",
    onActiveIndexChange: () => {},
    onSelect: () => {},
    ...overrides,
  }));
}

test("shows a loading row inside each source section", () => {
  const html = renderMenu({ loadingGroups: ["sessions", "plugins"] });
  assert.match(html, /aria-label="Chats"/);
  assert.match(html, /aria-label="Plugins"/);
  assert.equal((html.match(/data-menu-loading="true"/g) ?? []).length, 2);
  assert.equal((html.match(/Loading/g) ?? []).length, 2);
});

test("shows the empty state after every source is ready", () => {
  const html = renderMenu();
  assert.match(html, /data-menu-empty="true"/);
  assert.match(html, /No results/);
});

test("marks the active row for keyboard selection", () => {
  const html = renderMenu({
    sections: [{
      id: "plugins",
      items: [{
        id: "plugin:review-helper",
        group: "plugins",
        kind: "plugin",
        label: "Review Helper",
        raw: "@plugin:Review Helper",
        searchTerms: [],
      }],
    }],
  });
  assert.match(html, /data-active="true"/);
  assert.match(html, /aria-selected="true"/);
});

test("uses the four slash strings", () => {
  const html = renderMenu({
    variant: "slash",
    label: "Slash commands",
    description: "Search and run slash commands",
    searchQuery: "",
    searchPlaceholder: "Search",
    emptyText: "No commands",
  });
  assert.match(html, /Slash commands/);
  assert.match(html, /Search and run slash commands/);
  assert.match(html, /data-menu-search="true"[^>]*placeholder="Search"/);
  assert.match(html, /No commands/);
});
