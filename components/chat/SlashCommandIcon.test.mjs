import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { BUILTIN_SLASH_COMMAND_DEFS } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { hasSlashCommandIcon, SlashCommandIcon } = await jiti.import("./SlashCommandIcon.tsx");

test("maps every OMP built-in slash icon to a visible vector icon", () => {
  const missing = [...new Set(BUILTIN_SLASH_COMMAND_DEFS.map((command) => command.icon).filter(Boolean))]
    .filter((name) => !hasSlashCommandIcon(name));
  assert.deepEqual(missing, []);
});

test("keeps source fallback icons and unknown command icons visible", () => {
  for (const name of ["action", "extension", "mcp", "prompt", "skill", "unknown-future-icon"]) {
    const html = renderToStaticMarkup(React.createElement(SlashCommandIcon, { name }));
    assert.match(html, /<svg/);
    assert.match(html, /aria-hidden="true"/);
    assert.equal(html.includes(">/</"), false);
  }
});
