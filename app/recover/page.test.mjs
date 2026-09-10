import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { default: RecoverPage } = await jiti.import("./page.tsx");

const TIER_ONE_TOKENS = [
  "bg", "bg-panel", "bg-hover", "bg-selected", "border",
  "text", "text-muted", "text-dim", "accent", "accent-hover",
  "user-bg", "assistant-bg", "tool-bg", "bg-subtle",
  "success", "danger", "warning",
  "syntax-text", "syntax-text-muted", "syntax-accent",
  "syntax-success", "syntax-danger", "syntax-warning",
  "omp-md-heading", "omp-md-link", "omp-md-code",
];

test("recovery module CSS consumes only Tier 2 semantic tokens", async () => {
  const css = await readFile(new URL("./recover.module.css", import.meta.url), "utf8");

  for (const token of TIER_ONE_TOKENS) {
    const regex = new RegExp("var\\(\\s*--" + token + "(?![a-z0-9_-])", "i");
    assert.doesNotMatch(css, regex, "recover.module.css must not use Tier 1 token --" + token);
  }

  const colorLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;
  assert.doesNotMatch(css, colorLiteral, "recover.module.css must not contain raw color literals");
});

test("every CSS variable referenced in recover.module.css is defined in app/tokens.css", async () => {
  const [recoverCss, tokensCss] = await Promise.all([
    readFile(new URL("./recover.module.css", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
  ]);

  const tokenDeclarations = new Set(
    [...tokensCss.matchAll(new RegExp("--([a-z0-9-]+)\\s*:", "gi"))].map((match) => match[1].toLowerCase()),
  );

  const usedTokens = [...recoverCss.matchAll(new RegExp("var\\(\\s*--([a-z0-9-]+)", "gi"))].map((match) => match[1].toLowerCase());

  assert.ok(usedTokens.length > 0, "recover.module.css must use design system tokens");
  for (const token of usedTokens) {
    assert.ok(
      tokenDeclarations.has(token),
      "Token --" + token + " in recover.module.css must be declared in app/tokens.css",
    );
  }
});

test("recovery page TSX contains no inline styles or color literals", async () => {
  const tsx = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  const colorLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;

  assert.doesNotMatch(tsx, /\bstyle\s*=\s*\{/, "page.tsx must not contain inline style attributes");
  assert.doesNotMatch(tsx, colorLiteral, "page.tsx must not contain raw color literals");
});

test("Enter submits recovery through the form exactly once", async () => {
  const tsx = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
  const completionCalls = tsx.match(/void completeRecovery\(\)/g) ?? [];

  assert.equal(completionCalls.length, 1, "only the form submit handler may complete recovery");
  assert.doesNotMatch(tsx, /onKeyDown=/, "recovery inputs must use native form submission for Enter");
});

test("recovery page applies self-hosted Autospawn font through var(--font-sans) without Inter", async () => {
  const css = await readFile(new URL("./recover.module.css", import.meta.url), "utf8");
  const tsx = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(css, /font-family:\s*var\(--font-sans\)/, "recover.module.css must set font-family to var(--font-sans)");
  assert.doesNotMatch(css, /\bInter\b/i, "recover.module.css must not reference Inter");
  assert.doesNotMatch(tsx, /\bInter\b/i, "page.tsx must not reference Inter");
});

test("every interactive control receives a 2px focus-visible ring with 2px offset", async () => {
  const css = await readFile(new URL("./recover.module.css", import.meta.url), "utf8");

  assert.match(css, /:focus-visible/, "recover.module.css must declare :focus-visible rules");
  assert.match(css, /outline:\s*var\(--ui-focus-ring\)/, "focus ring must use var(--ui-focus-ring)");
  assert.match(css, /outline-offset:\s*var\(--ui-focus-offset\)/, "focus offset must use var(--ui-focus-offset)");
  assert.doesNotMatch(css, /:focus-visible\s*\{[^}]*outline:\s*(?:none|0)/s, "must not remove focus outline");
});

test("interactive controls meet the 44px minimum target at touch breakpoints", async () => {
  const css = await readFile(new URL("./recover.module.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(\s*max-width:\s*640px\s*\)/, "must include responsive touch media query");
  assert.match(css, /min-height:\s*var\(--ui-control-touch\)/, "must set min-height to var(--ui-control-touch)");
});

test("recovery page renders initial idle stage with access explanation and controls", () => {
  const html = renderToStaticMarkup(React.createElement(RecoverPage));

  assert.match(html, /Reeve/, "must render eyebrow");
  assert.match(html, /Recover access/, "must render title");
  assert.match(html, /prints a one-time recovery code/);
  assert.match(html, /reeve --reset-password/);
  assert.match(html, /Print a recovery code/);
  assert.match(html, /Recovery code/);
  assert.match(html, /New password/);
  assert.match(html, /Confirm password/);
  assert.match(html, /Set new password/);
  assert.match(html, /disabled=""/);
});

test("recovery page inputs have associated label semantics", () => {
  const html = renderToStaticMarkup(React.createElement(RecoverPage));

  assert.match(html, /for="recovery-code"/, "recovery code field has associated label");
  assert.match(html, /id="recovery-code"/, "recovery code input has id");
  assert.match(html, /for="recovery-new-password"/, "new password field has associated label");
  assert.match(html, /id="recovery-new-password"/, "new password input has id");
  assert.match(html, /for="recovery-confirm-password"/, "confirm password field has associated label");
  assert.match(html, /id="recovery-confirm-password"/, "confirm password input has id");
});

test("recovery page does not import ShellLayout to keep visual consistency independent", async () => {
  const tsx = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(tsx, /ShellLayout/, "page.tsx must not import ShellLayout");
});
