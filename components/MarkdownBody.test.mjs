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
const { MarkdownBody } = await jiti.import("./MarkdownBody.tsx");
const { normalizeDisplayMath } = await jiti.import("../lib/markdown.ts");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function renderMarkdown(markdown, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MarkdownBody, {
        cwd: "/home/me/project",
        onOpenFile() {},
        ...props,
      }, markdown),
    ),
  );
}

test("fades streamed prose in stable word segments", () => {
  const html = renderMarkdown("Hello, smooth world!", { isStreaming: true });

  assert.match(html, /data-markdown-animated="true"/);
  assert.match(html, /data-stream-fade-key="stream-segment-0"[^>]*>Hello, /);
  assert.match(html, /data-stream-fade-key="stream-segment-1"[^>]*>smooth /);
  assert.match(html, /data-stream-fade-key="stream-segment-2"[^>]*>world!/);
});

test("the streamed word delays can override the base animation shorthand", () => {
  for (const delay of [16, 32, 48, 64, 80, 96]) {
    assert.match(
      globalCss,
      new RegExp(`\\.markdown-body\\[data-markdown-animated="true"\\] \\.markdown-stream-fade\\[data-stream-fade-delay="${delay}"\\] \\{ animation-delay: ${delay}ms; \\}`),
    );
  }
});

test("does not add reveal wrappers to completed prose", () => {
  const html = renderMarkdown("Hello, settled world!", { isStreaming: false });

  assert.doesNotMatch(html, /data-markdown-animated|data-stream-fade-key|markdown-stream-fade/);
});

test("fades inline code as one unit without splitting fenced code", () => {
  const html = renderMarkdown("Use `bun test`.\n\n```ts\nconst ok = true;\n```", { isStreaming: true });

  assert.match(html, /data-stream-fade-key="stream-segment-1"[^>]*><code class="markdown-inline-code">bun test<\/code>/);
  assert.match(html, /<div class="markdown-code-block">[\s\S]*const ok = true;/);
  assert.doesNotMatch(html, /const <\/span>/);
});

test("opens non-file markdown links in a safe new tab", () => {
  const html = renderMarkdown("[docs](https://example.com/docs)");

  assert.match(
    html,
    /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>docs<\/a>/,
  );
  assert.doesNotMatch(html, /\snode=/);
});

test("keeps local file markdown links in the app", () => {
  const html = renderMarkdown("[file](components/MarkdownBody.tsx)");

  assert.match(html, /<a href="components\/MarkdownBody\.tsx">file<\/a>/);
  assert.doesNotMatch(html, /target=|rel=|\snode=/);
});

test("keeps single-tilde CJK numeric ranges literal instead of striking them", () => {
  const html = renderMarkdown("5~7U 保证金 × 100~200倍杠杆");

  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /5~7U/);
  assert.match(html, /100~200倍/);
});

test("still renders double-tilde strikethrough", () => {
  const html = renderMarkdown("~~gone~~");

  assert.match(html, /<del>gone<\/del>/);
});

test("renders LaTeX parenthesis delimiters as inline math", () => {
  const html = renderMarkdown(String.raw`射线为 \(r_c = K^{-1}p\)。`);

  assert.match(html, /class="katex"/);
  assert.match(html, /r_c/);
});

test("renders paired LaTeX bracket delimiters as display math", () => {
  const html = renderMarkdown(String.raw`\[
P(\lambda)=o_b+\lambda r_b
\]`);
  const oneLineHtml = renderMarkdown(String.raw`\[P(\lambda)=o_b+\lambda r_b\]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /lambda/);
  assert.match(oneLineHtml, /class="katex-display"/);
});

test("leaves an unmatched LaTeX bracket delimiter unchanged", () => {
  const markdown = String.raw`before
\[
x + y
after`;

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside Markdown code", () => {
  const markdown = "    \\(indented\\)\n\n`code\n\\(inline\\)`\n\n```text\n\\[\nfenced\n\\]\n```";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside raw HTML code", () => {
  const markdown = "<code>\\(inline\\)</code>\n\n<pre>\n\\(block\\)\n</pre>";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize escaped delimiters or link destinations", () => {
  const escaped = String.raw`Literal: \\(x+y\\).`;
  const link = String.raw`[docs](https://example.com/\(manual\))`;

  assert.equal(normalizeDisplayMath(escaped), escaped);
  assert.equal(normalizeDisplayMath(link), link);
});
