import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceFiles = [
  "./SkillsConfig.tsx",
  "./skills/SkillDetail.tsx",
  "./skills/SkillDiscovery.tsx",
  "./skills/SkillList.tsx",
];
const source = (await Promise.all(
  sourceFiles.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
)).join("\n");
const configSource = await readFile(new URL("./SkillsConfig.tsx", import.meta.url), "utf8");
const discoverySource = await readFile(
  new URL("./skills/SkillDiscovery.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(new URL("./SkillsConfig.module.css", import.meta.url), "utf8");

test("SkillsConfig uses shared settings primitives for every action", () => {
  for (const primitive of ["Button", "FormField", "IconButton", "StatusBadge"]) {
    assert.match(source, new RegExp(`from ["']\\.\\.?/ui/${primitive}["']`));
    assert.match(source, new RegExp(`<${primitive}\\b`));
  }

  assert.doesNotMatch(source, /<button\b/);
  assert.doesNotMatch(source, /<div\b[^>]*className=\{styles\.(?:skillRow|addSkillButton)\}[^>]*>/);
  assert.match(source, /<FormField[\s\S]*?id="skill-search"[\s\S]*?<input/);
  assert.match(source, /aria-pressed=\{scope === nextScope\}/);
  assert.match(source, /pressed=\{enabled\}/);
});

test("SkillsConfig preserves skill routes, keyboard search, and visibility save", () => {
  for (const route of [
    "/api/skills/search",
    "/api/skills/install",
    "/api/skills/check",
    "/api/skills/update",
  ]) {
    assert.match(source, new RegExp(route));
  }

  assert.match(source, /method: "PATCH"/);
  assert.match(source, /disableModelInvocation: next/);
  assert.match(source, /projectResourcesLoaded/);
  assert.match(source, /dormantGroupsOpen/);
});

test("SkillsConfig owns skill requests while discovery owns interaction state", () => {
  for (const route of ["/api/skills/search", "/api/skills/install"]) {
    assert.match(configSource, new RegExp(route));
    assert.doesNotMatch(discoverySource, new RegExp(route));
  }

  assert.match(configSource, /onSearch=\{searchSkills\}/);
  assert.match(configSource, /onInstall=\{installSkill\}/);
  assert.match(discoverySource, /onSearch: \(query: string\) => Promise<SkillSearchResult\[\]>/);
  assert.match(discoverySource, /onInstall: \(packageName: string, scope: SkillInstallScope\) => Promise<void>/);
});

test("SkillsConfig removes obsolete action CSS and keeps token-based styles", () => {
  for (const className of [
    "secondaryButton",
    "primaryButton",
    "searchButton",
    "installButton",
    "migrated48",
    "migrated65",
  ]) {
    assert.doesNotMatch(css, new RegExp(`\\.${className}\\b`));
    assert.doesNotMatch(source, new RegExp(`styles\\.${className}\\b`));
  }

  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.doesNotMatch(`${source}\n${css}`, /\bmigrated\w*/i);
  assert.doesNotMatch(source, /\bstyle\s*=/);
  assert.doesNotMatch(source, /currentTarget\.style/);
  assert.doesNotMatch(`${source}\n${css}`, /\bInter\b/);
});

test("SkillsConfig gives local controls focus rings and touch targets", () => {
  assert.match(css, /\.searchInput:focus-visible\s*\{[\s\S]*?outline:\s*var\(--ui-focus-ring\);[\s\S]*?outline-offset:\s*var\(--ui-focus-offset\);/);
  assert.match(css, /\.sourceLink:focus-visible,[\s\S]*?\.discoveryLink:focus-visible\s*\{[\s\S]*?outline:\s*var\(--ui-focus-ring\);[\s\S]*?outline-offset:\s*var\(--ui-focus-offset\);/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.dialog button\s*\{[^}]*min-width:\s*var\(--ui-control-touch\);[^}]*min-height:\s*var\(--ui-control-touch\);/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.scopeButton\.scopeButton\s*\{[^}]*min-width:\s*var\(--ui-control-touch\);[^}]*min-height:\s*var\(--ui-control-touch\);/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.searchInput\s*\{[^}]*min-height:\s*var\(--ui-control-touch\);/);
  assert.match(css, /\.scopeSelector\s*\{[^}]*overflow:\s*visible;/);
});
