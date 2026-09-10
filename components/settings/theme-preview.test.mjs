import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { createJiti } from "jiti";
import { mount } from "../../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { ThemePreview, isPaletteColor, paletteDeclarations } = await jiti.import("./ThemePreview.tsx");
const h = React.createElement;

const darkPalette = {
  name: "titanium",
  colorScheme: "dark",
  variables: {
    "--bg": "#101418",
    "--bg-panel": "#181d23",
    "--border": "#2a3138",
    "--text": "#e5e7eb",
    "--text-muted": "#a8b0b8",
    "--accent": "#4ea1ff",
  },
};

const lightPalette = {
  name: "light",
  colorScheme: "light",
  variables: {
    "--bg": "#fdfdfd",
    "--bg-panel": "#f2f3f5",
    "--border": "#d8dade",
    "--text": "#17191d",
    "--text-muted": "#5b6169",
    "--accent": "#0b62d6",
  },
};

function styleText(container) {
  return container.querySelector("style").textContent;
}

test("each theme card renders the palette it offers, not the active palette", async () => {
  const dark = await mount(h(ThemePreview, { mode: "dark", palette: darkPalette }));
  const light = await mount(h(ThemePreview, { mode: "light", palette: lightPalette }));

  const darkRule = styleText(dark.container);
  const lightRule = styleText(light.container);

  assert.match(darkRule, /\[data-theme-preview=dark\]/);
  assert.match(lightRule, /\[data-theme-preview=light\]/);

  for (const value of Object.values(darkPalette.variables)) {
    assert.ok(darkRule.includes(value), `the dark card must carry ${value}`);
    assert.ok(!lightRule.includes(value), `the light card must not carry ${value}`);
  }
  for (const value of Object.values(lightPalette.variables)) {
    assert.ok(lightRule.includes(value), `the light card must carry ${value}`);
  }

  const darkScope = dark.container.querySelector("[data-theme-preview]");
  assert.equal(darkScope.getAttribute("data-theme-preview"), "dark");
  assert.equal(darkScope.getAttribute("data-color-scheme"), "dark");
  assert.equal(
    light.container.querySelector("[data-theme-preview]").getAttribute("data-color-scheme"),
    "light",
  );

  await dark.unmount();
  await light.unmount();
});

test("the palette scope writes Tier 2 tokens and no Tier 1 name", async () => {
  const rule = paletteDeclarations(darkPalette);
  for (const token of ["--ui-canvas", "--ui-sidebar", "--ui-border", "--ui-text", "--ui-text-muted", "--ui-accent"]) {
    assert.ok(rule.includes(`${token}:`), `the scope must set ${token}`);
  }
  assert.doesNotMatch(rule, /(?:^|;)--bg:/);
  assert.doesNotMatch(rule, /(?:^|;)--accent:/);
});

test("the palette scope accepts a color and rejects everything else", () => {
  for (const value of ["#abc", "#abcd", "#0b62d6", "#0b62d6ff", "rgb(12, 34, 56)", "transparent"]) {
    assert.equal(isPaletteColor(value), true, value);
  }
  for (const value of [
    "red; } body { display: none",
    "url(https://example.com/a.png)",
    "var(--accent)",
    "#12345",
    "rgb(300, 0, 0)",
    "rgb(0,0,0);}",
    "",
    undefined,
    null,
    12,
  ]) {
    assert.equal(isPaletteColor(value), false, String(value));
  }

  const injected = paletteDeclarations({
    name: "broken",
    colorScheme: "dark",
    variables: { "--bg": "red;}body{display:none", "--text": "#ffffff" },
  });
  assert.equal(injected, "--ui-text:#ffffff");
});

test("the theme preview writes no intrinsic inline style and no color literal", async () => {
  const source = await readFile(new URL("./ThemePreview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\sstyle=\{/);
  assert.doesNotMatch(source, /\.style\s*(?:\.|\[)|setAttribute\(\s*["']style/);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(source, /\bmigrated\d*\b/);
});

test("the theme preview stylesheet uses Tier 2 tokens only", async () => {
  const sheet = await readFile(new URL("./theme-preview.module.css", import.meta.url), "utf8");
  assert.doesNotMatch(sheet, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(sheet, /var\(--(?:bg|text|accent|border)\b/);
  assert.match(sheet, /var\(--ui-canvas\)/);
  assert.match(sheet, /var\(--ui-accent\)/);
});
