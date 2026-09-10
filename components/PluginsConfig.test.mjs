import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./PluginsConfig.tsx", import.meta.url), "utf8");
const sourceField = await readFile(new URL("./plugins/PluginSourceField.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("./PluginsConfig.module.css", import.meta.url), "utf8");

test("PluginsConfig uses shared settings primitives for actions and labeled input", () => {
  for (const primitive of ["Button", "FormField", "IconButton", "StatusBadge", "Tooltip"]) {
    assert.match(source, new RegExp(`from ["']\\./ui/${primitive}["']`));
    assert.match(source, new RegExp(`<${primitive}\\b`));
  }

  assert.doesNotMatch(source, /<button\b/);
  assert.match(source, /<FormField[\s\S]*?id="plugin-source"[\s\S]*?<PluginSourceField/);
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /pressed=\{enabled\}/);
});

test("PluginsConfig preserves package actions and install keyboard behavior", () => {
  for (const action of ["install", "remove", "update", "disable", "enable"]) {
    assert.match(source, new RegExp(`"${action}"`));
  }

  assert.match(source, /fetch\("\/api\/plugins"/);
  assert.match(source, /sendAgentCommand\(sessionId, \{ type: "reload" \}\)/);
  assert.match(sourceField, /event\.key === "Enter" && source\.trim\(\) && !busy/);
  assert.match(sourceField, /normalizePluginSourceInput\(pasted\)/);
  assert.match(source, /projectResourcesLoaded/);
});

test("PluginsConfig removes obsolete action CSS and keeps token-based styles", () => {
  for (const className of ["secondaryButton", "primaryButton", "dangerButton"]) {
    assert.doesNotMatch(css, new RegExp(`\\.${className}\\b`));
    assert.doesNotMatch(source, new RegExp(`styles\\.${className}\\b`));
  }

  assert.doesNotMatch(css, /\.migrated\w*\b/);
  assert.doesNotMatch(source, /styles\.migrated\w*\b/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.doesNotMatch(`${source}\n${sourceField}\n${css}`, /\bInter\b/);
});

test("PluginsConfig defines focus and touch behavior for plugin-specific controls", () => {
  assert.match(css, /:focus-visible[\s\S]*outline:\s*var\(--ui-focus-ring\)/);
  assert.match(css, /:focus-visible[\s\S]*outline-offset:\s*var\(--ui-focus-offset\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*44px/);
});
