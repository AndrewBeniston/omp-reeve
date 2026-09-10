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
const { TerminalOutput } = await jiti.import("./TerminalOutput.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderTerminal(command) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(TerminalOutput, {
        command,
        output: "success done",
        pending: false,
        isError: false,
      }),
    ),
  );
}

test("TerminalOutput emits Prism classes that receive scoped module rules", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("./TerminalOutput.tsx", import.meta.url), "utf8"),
    readFile(new URL("./terminal-output.module.css", import.meta.url), "utf8"),
  ]);
  const html = renderTerminal('if true; then echo "$HOME"; fi');
  const emittedTokenClasses = new Set(
    [...html.matchAll(/class="token ([^"]+)"/g)]
      .flatMap((match) => match[1].split(" ")),
  );

  assert.match(source, /useInlineStyles=\{false\}/);
  assert.doesNotMatch(source, /react-syntax-highlighter\/dist\/[^"']+\/styles\/prism/);
  assert.doesNotMatch(source, /<SyntaxHighlighter[\s\S]*?\bstyle=/);
  assert.ok(emittedTokenClasses.size > 0);
  assert.doesNotMatch(html, /\sstyle=/);
  for (const className of emittedTokenClasses) {
    assert.match(css, new RegExp(":global\\(\\.token\\." + className.replaceAll("-", "\\-") + "\\)"));
  }
});

test("TerminalOutput covers the complete Prism token groups with protected Tier 2 colors", async () => {
  const css = await readFile(new URL("./terminal-output.module.css", import.meta.url), "utf8");
  const requiredClasses = [
    "comment", "prolog", "doctype", "cdata", "punctuation",
    "property", "tag", "constant", "symbol", "deleted",
    "boolean", "number", "selector", "attr-name", "string", "char",
    "builtin", "inserted", "operator", "entity", "url", "variable",
    "atrule", "attr-value", "keyword", "function", "class-name",
    "regex", "important",
  ];

  for (const className of requiredClasses) {
    assert.match(css, new RegExp(":global\\(\\.token\\." + className.replaceAll("-", "\\-") + "\\)"));
  }
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i);
  assert.doesNotMatch(css, /var\(--(?:bg|bg-panel|bg-hover|bg-selected|border|text|text-muted|text-dim|accent|accent-hover|user-bg|assistant-bg|tool-bg|bg-subtle|success|danger|warning|syntax-text|syntax-text-muted|syntax-accent|syntax-success|syntax-danger|syntax-warning)\)/i);
  for (const token of ["text", "text-muted", "accent", "success", "danger", "warning"]) {
    assert.match(css, new RegExp(`var\\(--ui-syntax-${token}\\)`));
  }

  const syntaxRules = css.slice(css.indexOf(".commandCode :global(.token.comment)"));
  assert.doesNotMatch(syntaxRules, /var\(--ui-(?:text|text-muted|text-dim|accent|success|danger|warning)\)/);
  assert.match(syntaxRules, /\.token\.cdata\)[^{]*\{[^}]*font-style:\s*italic/s);
  assert.match(syntaxRules, /\.token\.keyword\)[^{]*\{[^}]*font-weight:\s*var\(--font-weight-semibold\)/s);
  assert.match(syntaxRules, /\.token\.deleted\)[^{]*\{[^}]*text-decoration:\s*line-through/s);
  assert.match(syntaxRules, /\.token\.inserted\)[^{]*\{[^}]*text-decoration:\s*underline/s);
});

test("TerminalOutput styles live in the module instead of globals", async () => {
  const [source, globals] = await Promise.all([
    readFile(new URL("./TerminalOutput.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /import styles from ["']\.\/terminal-output\.module\.css["']/);
  assert.doesNotMatch(globals, /\.(?:shell-output|shell-command|shell-local-label)/);
});
