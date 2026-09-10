import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const repoFile = (path) => new URL(`../../${path}`, import.meta.url);

const TIER_ONE_TOKENS = [
  "bg", "bg-panel", "bg-hover", "bg-selected", "border",
  "text", "text-muted", "text-dim", "accent", "accent-hover",
  "user-bg", "assistant-bg", "tool-bg", "bg-subtle",
  "success", "danger", "warning",
  "syntax-text", "syntax-text-muted", "syntax-accent",
  "syntax-success", "syntax-danger", "syntax-warning",
  "omp-md-heading", "omp-md-link", "omp-md-code",
];

/** The one Tier 2 color literal DESIGN.md section 4.2 allows. */
const TIER_TWO_LITERAL_TOKEN = "--ui-backdrop";

/** DESIGN.md section 4.4 writes this elevation recipe with literal shadow colors. */
const ELEVATION_RECIPE_TOKEN = "--shadow-composer";

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;
const DECLARATION = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;

function declarations(css) {
  return [...css.matchAll(DECLARATION)].map(([, name, value]) => ({
    name: `--${name}`,
    value: value.trim(),
  }));
}

function tierOneReferences(value) {
  return [...value.matchAll(/var\(\s*--([a-z0-9-]+)/gi)]
    .map((match) => match[1].toLowerCase())
    .filter((name) => TIER_ONE_TOKENS.includes(name));
}

function isColorToken({ name, value }) {
  if (!name.startsWith("--ui-")) return false;
  return value.includes("color-mix(")
    || COLOR_LITERAL.test(value)
    || tierOneReferences(value).length > 0;
}

test("Tier 2 semantic colors derive from the fixed Tier 1 adapter", async () => {
  const tokens = await readFile(repoFile("app/tokens.css"), "utf8");
  const layout = await readFile(repoFile("app/layout.tsx"), "utf8");

  const expected = new Map([
    ["--ui-canvas", "var(--bg)"],
    ["--ui-main", "var(--assistant-bg)"],
    ["--ui-sidebar", "color-mix(in srgb, var(--assistant-bg) 97.5%, var(--text))"],
    ["--ui-surface", "var(--user-bg)"],
    ["--ui-composer", "var(--user-bg)"],
    ["--ui-user-bubble", "var(--user-bg)"],
    ["--ui-surface-elevated", "color-mix(in srgb, var(--bg-panel) 92%, var(--text))"],
    ["--ui-surface-inset", "var(--tool-bg)"],
    ["--ui-hover", "var(--bg-hover)"],
    ["--ui-active", "var(--bg-selected)"],
    ["--ui-row-hover", "color-mix(in srgb, var(--text) 5%, transparent)"],
    ["--ui-row-selected", "color-mix(in srgb, var(--text) 5%, transparent)"],
    ["--ui-sidebar-row-foreground", "color-mix(in srgb, var(--text) 84%, var(--assistant-bg))"],
    ["--ui-sidebar-label-foreground", "color-mix(in srgb, var(--text) 46%, var(--assistant-bg))"],
    ["--ui-scrollbar-thumb", "color-mix(in srgb, var(--text) 12%, transparent)"],
    ["--ui-backdrop", "color-mix(in srgb, #000 45%, transparent)"],
    ["--ui-border", "var(--border)"],
    ["--ui-border-strong", "color-mix(in srgb, var(--border) 60%, var(--text))"],
    ["--ui-border-subtle", "color-mix(in srgb, var(--border) 55%, transparent)"],
    ["--ui-text", "var(--text)"],
    ["--ui-text-muted", "var(--text-muted)"],
    ["--ui-text-dim", "var(--text-dim)"],
    ["--ui-accent", "var(--accent)"],
    ["--ui-accent-hover", "var(--accent-hover)"],
    ["--ui-accent-wash", "color-mix(in srgb, var(--accent) 12%, transparent)"],
    ["--ui-success", "var(--success)"],
    ["--ui-warning", "var(--warning)"],
    ["--ui-danger", "var(--danger)"],
    ["--ui-success-wash", "color-mix(in srgb, var(--success) 12%, transparent)"],
    ["--ui-warning-wash", "color-mix(in srgb, var(--warning) 12%, transparent)"],
    ["--ui-danger-wash", "color-mix(in srgb, var(--danger) 12%, transparent)"],
    ["--ui-syntax-text", "var(--syntax-text)"],
    ["--ui-syntax-text-muted", "var(--syntax-text-muted)"],
    ["--ui-syntax-accent", "var(--syntax-accent)"],
    ["--ui-syntax-success", "var(--syntax-success)"],
    ["--ui-syntax-danger", "var(--syntax-danger)"],
    ["--ui-syntax-warning", "var(--syntax-warning)"],
  ]);

  for (const [name, value] of expected) {
    assert.match(tokens, new RegExp(`${name}:\\s*${value.replace(/[()#.%]/g, "\\$&")};`));
  }

  assert.ok(layout.indexOf('import "./globals.css"') < layout.indexOf('import "./tokens.css"'));
  assert.match(tokens, /html\.dark\s*\{[^}]*--ui-sidebar:\s*color-mix\(in srgb, var\(--assistant-bg\) 92%, var\(--text\)\);/s);
  // Codex dark, measured 2026-09-02: main #181818, sidebar #222222, composer #2a2a2a.
  // The composer sits one step above the sidebar: 12% text over the page against the sidebar's 8%.
  assert.match(tokens, /html\.dark\s*\{[^}]*--ui-composer:\s*color-mix\(in srgb, var\(--assistant-bg\) 88%, var\(--text\)\);/s);
  // Codex dark, measured 2026-09-02: background #181818, sidebar #222222, composer #2b2b2b, user bubble #2f2f2f.
  // The bubble is the lightest of the four, one small step above the composer.
  assert.match(tokens, /html\.dark\s*\{[^}]*--ui-user-bubble:\s*color-mix\(in srgb, var\(--assistant-bg\) 86%, var\(--text\)\);/s);
  assert.match(tokens, /html\.dark\s*\{[^}]*--ui-row-hover:\s*color-mix\(in srgb, var\(--text\) 8%, transparent\);/s);
  assert.match(tokens, /html\.dark\s*\{[^}]*--ui-row-selected:\s*color-mix\(in srgb, var\(--text\) 8%, transparent\);/s);
  assert.match(tokens, /--height-token-nav-row:\s*30px;/);
  assert.match(tokens, /--height-token-row:\s*var\(--height-token-nav-row\);/);
  assert.match(tokens, /--padding-row-cell-x:\s*8px;/);
  assert.match(tokens, /--sidebar-item-icon-size:\s*24px;/);
  assert.match(tokens, /--sidebar-item-gap:\s*8px;/);
  assert.match(tokens, /--sidebar-footer-height:\s*46px;/);
  assert.match(tokens, /--radius-composer:\s*24px;/);
  assert.match(tokens, /--composer-frame-min-height:\s*98px;/);
  assert.match(tokens, /--composer-footer-inset:\s*8px;/);
  assert.match(tokens, /--composer-control-size:\s*28px;/);
  assert.match(tokens, /--composer-send-size:\s*var\(--composer-control-size\);/);
  assert.match(tokens, /:root\s*\{[^}]*--shadow-composer:\s*0 0 0 1px rgba\(0,\s*0,\s*0,\s*0\.04\),\s*0 2px 8px 0 rgba\(0,\s*0,\s*0,\s*0\.04\),\s*0 4px 80px 8px rgba\(0,\s*0,\s*0,\s*0\.024\);/s);
  assert.match(tokens, /html\.dark\s*\{[^}]*--shadow-composer:\s*inset 0 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.2\);/s);
  assert.doesNotMatch(tokens, /html\s*,\s*body[^}]*font-family:\s*var\(--font-sans\)/s);
});

test("every Tier 2 color derives from a Tier 1 color, except --ui-backdrop", async () => {
  const tokens = await readFile(repoFile("app/tokens.css"), "utf8");
  const colorTokens = declarations(tokens).filter(isColorToken);

  assert.ok(colorTokens.length >= 24, "Tier 2 must declare the DESIGN.md color set.");
  assert.ok(colorTokens.some((token) => token.name === TIER_TWO_LITERAL_TOKEN));

  for (const token of colorTokens) {
    if (token.name === TIER_TWO_LITERAL_TOKEN) continue;
    assert.ok(
      tierOneReferences(token.value).length > 0,
      `${token.name} must derive from a Tier 1 color: ${token.value}`,
    );
    assert.doesNotMatch(
      token.value,
      COLOR_LITERAL,
      `${token.name} must not hold a color literal: ${token.value}`,
    );
  }
});

test("Tier 2 holds no color literal outside --ui-backdrop and the elevation recipe", async () => {
  const tokens = await readFile(repoFile("app/tokens.css"), "utf8");
  const allowed = new Set([TIER_TWO_LITERAL_TOKEN, ELEVATION_RECIPE_TOKEN]);

  for (const token of declarations(tokens)) {
    if (allowed.has(token.name)) continue;
    assert.doesNotMatch(
      token.value,
      COLOR_LITERAL,
      `${token.name} must not hold a color literal in Tier 2: ${token.value}`,
    );
  }

  assert.doesNotMatch(tokens, /--ui-theme-(?:light|dark)-/);
});

test("Tier 2 never declares a Tier 1 token name", async () => {
  const tokens = await readFile(repoFile("app/tokens.css"), "utf8");
  const declaredNames = declarations(tokens).map((token) => token.name);

  for (const name of TIER_ONE_TOKENS) {
    assert.ok(
      !declaredNames.includes(`--${name}`),
      `Tier 2 must not declare the Tier 1 token --${name}.`,
    );
  }
});

test("globals.css declares the Tier 1 light and dark defaults without reading Tier 2", async () => {
  const globals = await readFile(repoFile("app/globals.css"), "utf8");
  const light = /:root\s*\{(?<body>[^}]*--bg:[^}]*)\}/s.exec(globals)?.groups?.body ?? "";
  const dark = /html\.dark\s*\{(?<body>[^}]*)\}/s.exec(globals)?.groups?.body ?? "";

  assert.ok(light.length > 0, "globals.css must declare the light Tier 1 defaults.");
  assert.ok(dark.length > 0, "globals.css must declare the dark Tier 1 defaults.");

  const lightDefaults = new Map(declarations(light).map((token) => [token.name, token.value]));
  const darkDefaults = new Map(declarations(dark).map((token) => [token.name, token.value]));

  for (const name of TIER_ONE_TOKENS) {
    if (name.startsWith("omp-md-")) continue;
    for (const [layer, defaults] of [["light", lightDefaults], ["dark", darkDefaults]]) {
      const value = defaults.get(`--${name}`);
      assert.ok(value, `globals.css must declare --${name} for the ${layer} default.`);
      assert.doesNotMatch(
        value,
        /var\(\s*--ui-/,
        `--${name} must not read a Tier 2 token in the ${layer} default.`,
      );
      if (name.startsWith("syntax-")) {
        assert.match(value, /var\(\s*--(?:text|text-muted|accent|success|danger|warning)\)/);
        assert.doesNotMatch(value, COLOR_LITERAL);
      } else {
        assert.match(
          value,
          COLOR_LITERAL,
          `--${name} must hold a literal color in the ${layer} default.`,
        );
      }
    }
  }

  assert.equal(lightDefaults.get("--bg"), "#ffffff");
  assert.equal(darkDefaults.get("--bg"), "#151820");
  assert.equal(lightDefaults.get("--accent"), "#0082b3");
  assert.equal(darkDefaults.get("--accent"), "#00b4ff");
});

test("Autospawn Sans ships ten WOFF2 faces and preloads only normal 400 and 500", async () => {
  const globals = await readFile(repoFile("app/globals.css"), "utf8");
  const layout = await readFile(repoFile("app/layout.tsx"), "utf8");
  const faces = [
    ["Light", 300, "normal"],
    ["LightItalic", 300, "italic"],
    ["Regular", 400, "normal"],
    ["RegularItalic", 400, "italic"],
    ["Medium", 500, "normal"],
    ["MediumItalic", 500, "italic"],
    ["Semibold", 600, "normal"],
    ["SemiboldItalic", 600, "italic"],
    ["Bold", 700, "normal"],
    ["BoldItalic", 700, "italic"],
  ];

  for (const [name, weight, style] of faces) {
    const file = `AutospawnSans-${name}.woff2`;
    assert.ok((await stat(repoFile(`public/fonts/${file}`))).size > 0);
    const face = new RegExp(
      `@font-face\\s*\\{[^}]*font-family:\\s*"Autospawn Sans";[^}]*src:\\s*url\\("/fonts/${file}"\\) format\\("woff2"\\);[^}]*font-weight:\\s*${weight};[^}]*font-style:\\s*${style};[^}]*font-display:\\s*swap;[^}]*\\}`,
      "s",
    );
    assert.match(globals, face);
  }

  const preloads = [...layout.matchAll(/<link\s+rel="preload"\s+href="([^"]+AutospawnSans-[^"]+\.woff2)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(preloads, [
    "/fonts/AutospawnSans-Regular.woff2",
    "/fonts/AutospawnSans-Medium.woff2",
  ]);
  assert.doesNotMatch(globals, /font-family:\s*[^;]*Inter/);
});

test("the page body uses the sans token before system fallbacks", async () => {
  const globals = await readFile(repoFile("app/globals.css"), "utf8");
  const rules = globals.replaceAll(/@font-face\s*\{[^}]*\}/gs, "");
  const bodyRule = /html,\s*body\s*\{(?<declarations>[^}]*)\}/s.exec(rules)
    ?.groups?.declarations ?? "";

  assert.match(bodyRule, /font-family:\s*var\(--font-sans\);/);

  const systemSans = /system-ui|-apple-system|BlinkMacSystemFont|["']Segoe UI["']|\bRoboto\b/i;
  for (const match of rules.matchAll(/font-family\s*:\s*(?<value>[^;]+);/gi)) {
    const value = match.groups?.value ?? "";
    const tokenIndex = value.indexOf("var(--font-sans)");
    const systemIndex = value.search(systemSans);
    assert.ok(
      systemIndex === -1 || (tokenIndex !== -1 && tokenIndex < systemIndex),
      `A system sans face appears before the sans token: ${value}`,
    );
  }

  assert.doesNotMatch(globals, /\bInter\b/i);
});

test("Tier 3 recipes consume Tier 2 tokens and primitives avoid static inline styles", async () => {
  const recipeCss = await readFile(repoFile("lib/ui/recipes.module.css"), "utf8");
  const primitiveCss = await readFile(repoFile("components/ui/primitives.module.css"), "utf8");
  const tierOne = [
    "bg", "bg-panel", "bg-hover", "bg-selected", "border",
    "text", "text-muted", "text-dim", "accent", "accent-hover",
    "user-bg", "assistant-bg", "tool-bg", "bg-subtle",
    "success", "danger", "warning",
    "syntax-text", "syntax-text-muted", "syntax-accent",
    "syntax-success", "syntax-danger", "syntax-warning",
    "omp-md-heading", "omp-md-link", "omp-md-code",
  ];

  for (const name of tierOne) {
    const directReference = new RegExp(`var\\(--${name.replaceAll("-", "\\-")}\\)`);
    assert.doesNotMatch(recipeCss, directReference);
    assert.doesNotMatch(primitiveCss, directReference);
  }
  assert.doesNotMatch(recipeCss, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);
  assert.doesNotMatch(primitiveCss, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);

  const primitives = [
    "Button.tsx", "IconButton.tsx", "Surface.tsx", "StatusBadge.tsx",
    "Disclosure.tsx", "Dialog.tsx", "Menu.tsx", "Tabs.tsx", "Tooltip.tsx",
    "FormField.tsx", "VisuallyHidden.tsx",
  ];
  for (const file of primitives) {
    const source = await readFile(repoFile(`components/ui/${file}`), "utf8");
    assert.doesNotMatch(source, /\bstyle\s*=/, file);
  }
});
