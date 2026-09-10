import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { domWindow, mount, settle } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  DiffView,
  DocumentViewer,
  SourceCodeRenderer,
  SourceView,
  AudioViewer,
  FileViewer,
  ImageViewer,
  TextFileViewer,
} = await jiti.import("./FileViewer.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

const forbiddenColorPatterns = [
  /#[0-9a-f]{3,8}\b/gi,
  /\brgba?\s*\(/gi,
  /\bhsla?\s*\(/gi,
  /["'](?:black|white|red|green|blue|orange|yellow|purple|gray|grey)["']/gi,
  /var\(--(?:bg|bg-panel|bg-hover|bg-selected|border|text|text-muted|text-dim|accent|accent-hover|user-bg|assistant-bg|tool-bg|bg-subtle|success|danger|warning|syntax-text|syntax-text-muted|syntax-accent|syntax-success|syntax-danger|syntax-warning)\)/gi,
];

test("file viewer CSS module colors use Tier 2 semantic tokens", async () => {
  const cssPath = new URL("./file-viewer/file-viewer.module.css", import.meta.url);
  const source = await readFile(cssPath, "utf8");
  const violations = [];

  for (const [index, line] of source.split("\n").entries()) {
    for (const pattern of forbiddenColorPatterns) {
      pattern.lastIndex = 0;
      const matches = [...line.matchAll(pattern)].map((match) => match[0]);
      if (matches.length > 0) {
        violations.push("file-viewer.module.css:" + (index + 1) + ": " + matches.join(", "));
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("file viewer interface colors use Tier 2 semantic tokens", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  const violations = [];

  for (const [index, line] of source.split("\n").entries()) {
    for (const pattern of forbiddenColorPatterns) {
      pattern.lastIndex = 0;
      const matches = [...line.matchAll(pattern)].map((match) => match[0]);
      if (matches.length > 0) {
        violations.push("FileViewer.tsx:" + (index + 1) + ": " + matches.join(", "));
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("contains no direct DOM style mutations", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.style\s*(?:\.|\[)/);
});

test("imports dedicated file-viewer CSS module", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  assert.match(source, /import styles from ["']\.\/file-viewer\/file-viewer\.module\.css["']/);
  const cssPath = new URL("./file-viewer/file-viewer.module.css", import.meta.url);
  assert.ok(existsSync(cssPath), "file-viewer.module.css should exist");
});

test("diff view exposes semantic line types and prefixes through data attributes without state inline styles", () => {
  const samplePatch = [
    "--- a/file.txt",
    "+++ b/file.txt",
    "@@ -1,3 +1,3 @@",
    " unchanged line",
    "-removed line",
    "+added line",
  ].join("\n");

  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(DiffView, { patch: samplePatch }),
    ),
  );

  assert.match(html, /data-type="added"/);
  assert.match(html, /data-type="removed"/);
  assert.match(html, /data-type="unchanged"/);
  assert.doesNotMatch(html, /style="[^"]*border-left:[^"]*var\(--ui-success\)/);
  assert.doesNotMatch(html, /style="[^"]*background:[^"]*var\(--ui-success-wash\)/);
});

test("source code renderer uses data-wrap attribute instead of inline state style", () => {
  const rows = [
    {
      children: [
        {
          properties: { className: ["token", "plain"] },
          children: [{ type: "text", value: "const x = 1;" }],
        },
      ],
    },
  ];

  const htmlWrapped = renderToStaticMarkup(
    React.createElement(SourceCodeRenderer, {
      rows,
      stylesheet: {},
      useInlineStyles: false,
      wrapLines: true,
    }),
  );
  assert.match(htmlWrapped, /data-wrap="true"/);
  assert.doesNotMatch(htmlWrapped, /style="[^"]*white-space:\s*pre-wrap/);

  const htmlUnwrapped = renderToStaticMarkup(
    React.createElement(SourceCodeRenderer, {
      rows,
      stylesheet: {},
      useInlineStyles: false,
      wrapLines: false,
    }),
  );
  assert.match(htmlUnwrapped, /data-wrap="false"/);
  assert.doesNotMatch(htmlUnwrapped, /style="[^"]*white-space:\s*pre/);
});

test("source mode emits scoped Prism token classes without style attributes", async () => {
  const html = renderToStaticMarkup(
    React.createElement(SourceView, {
      content: 'const answer = "yes";',
      language: "typescript",
      wrapLines: false,
    }),
  );
  const css = await readFile(
    new URL("./file-viewer/file-viewer.module.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(html, /\sstyle=/);
  assert.match(html, /class="[^"]*\bfile-source-view\b/);
  assert.match(html, /class="token keyword"/);
  assert.match(html, /class="token string"/);
  assert.match(html, /class="token punctuation"/);
  assert.match(html, /class="react-syntax-highlighter-line-number"/);
  assert.match(css, /\.sourceView\s+:global\(\.token\.keyword\)/);
  assert.match(css, /\.sourceView\s+:global\(\.token\.string\)/);
  assert.match(css, /\.sourceView\s+:global\(\.token\.punctuation\)/);
});

test("source mode disables Prism inline styles", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  const syntaxOpening = source.match(/<SyntaxHighlighter\b[\s\S]*?>/)?.[0] ?? "";

  assert.match(syntaxOpening, /useInlineStyles=\{false\}/);
  assert.doesNotMatch(syntaxOpening, /\bstyle=/);
});

test("source syntax uses the shared protected syntax-text token contract", async () => {
  const css = await readFile(new URL("./file-viewer/file-viewer.module.css", import.meta.url), "utf8");
  const syntaxRules = css.slice(css.indexOf(".sourceView :global(.token.comment)"), css.indexOf(".diffView"));

  for (const token of ["text-muted", "accent", "success", "danger", "warning"]) {
    assert.match(syntaxRules, new RegExp(`var\\(--ui-syntax-${token}\\)`));
  }
  assert.doesNotMatch(syntaxRules, /var\(--ui-(?:text-dim|text-muted|accent|success|danger|warning)\)/);
  assert.match(syntaxRules, /\.token\.cdata\)[^{]*\{[^}]*font-style:\s*italic/s);
  assert.match(syntaxRules, /\.token\.keyword\)[^{]*\{[^}]*font-weight:\s*var\(--font-weight-semibold\)/s);
  assert.match(syntaxRules, /\.token\.deleted\)[^{]*\{[^}]*text-decoration:\s*line-through/s);
  assert.match(syntaxRules, /\.token\.inserted\)[^{]*\{[^}]*text-decoration:\s*underline/s);
});

test("document viewer uses data-type attribute on iframe instead of inline background", () => {
  const htmlPdf = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(DocumentViewer, { filePath: "/test/doc.pdf" }),
    ),
  );
  assert.match(htmlPdf, /data-type="pdf"/);
  assert.doesNotMatch(htmlPdf, /style="[^"]*background:\s*var\(--ui-canvas\)/);

  const htmlDocx = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(DocumentViewer, { filePath: "/test/doc.docx" }),
    ),
  );
  assert.match(htmlDocx, /data-type="preview"/);
  assert.doesNotMatch(htmlDocx, /style="[^"]*background:\s*var\(--ui-surface-inset\)/);
});

test("file-viewer.module.css defines required state selectors", async () => {
  const cssPath = new URL("./file-viewer/file-viewer.module.css", import.meta.url);
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /\.modeButton\[aria-pressed="true"\]|\.modeButton\[data-active="true"\]/);
  assert.match(css, /\.iconButton\[aria-pressed="true"\]|\.iconButton\[data-active="true"\]/);
  assert.match(css, /\.liveDot\[data-watching="true"\]|\.liveIndicator\[data-watching="true"\]/);
  assert.match(css, /\.diffLine\[data-type="added"\]/);
  assert.match(css, /\.diffLine\[data-type="removed"\]/);
  assert.match(css, /\.sourceLineContent\[data-wrap="true"\]/);
  assert.match(css, /\.documentIframe\[data-type="pdf"\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /var\(--ui-focus-ring\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("coarse-pointer mode controls keep 44 pixel targets and visible focus outlines", async () => {
  const css = await readFile(
    new URL("./file-viewer/file-viewer.module.css", import.meta.url),
    "utf8",
  );
  const mobileStart = css.indexOf("@media (max-width: 640px)");
  const touchStart = css.indexOf("@media (max-width: 640px) and (pointer: coarse)");
  const mobileEnd = touchStart;
  const touchEnd = css.indexOf("@media (prefers-reduced-motion: reduce)", touchStart);
  const mobileRules = css.slice(mobileStart, mobileEnd);
  const touchRules = css.slice(touchStart, touchEnd);

  assert.notEqual(mobileStart, -1);
  assert.notEqual(touchStart, -1);
  assert.notEqual(mobileEnd, -1);
  assert.match(mobileRules, /\.modeSwitch\s*\{[\s\S]*?height:\s*auto;/);
  assert.match(mobileRules, /\.modeSwitch\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.match(touchRules, /\.modeSwitch\s*\{[\s\S]*?min-height:\s*var\(--ui-control-touch\);/);
  assert.match(touchRules, /\.modeButton\s*\{[\s\S]*?height:\s*var\(--ui-control-touch\);/);
  assert.match(css, /\.modeButton\s*\{[\s\S]*?box-sizing:\s*border-box;/);
});

test("image viewer renders media toolbar, image container and live status", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ImageViewer, { filePath: "/images/photo.png" }),
    ),
  );
  assert.match(html, /data-watching="false"/);
  assert.match(html, /<img\s+src="\/api\/files\//);
  assert.match(html, /alt="\/images\/photo\.png"/);
});

test("audio viewer renders media toolbar and audio element", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(AudioViewer, { filePath: "/audio/sound.mp3" }),
    ),
  );
  assert.match(html, /<audio/);
  assert.match(html, /data-watching="false"/);
  assert.match(html, /controls/);
});

test("file viewer renders appropriate sub-viewers by file extension", () => {
  const textHtml = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(TextFileViewer, { filePath: "/workspace/main.rs" }),
    ),
  );
  assert.match(textHtml, /data-state="loading"/);

  const imageHtml = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(FileViewer, { filePath: "/workspace/diagram.png" }),
    ),
  );
  assert.match(imageHtml, /<img/);

  const audioHtml = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(FileViewer, { filePath: "/workspace/track.wav" }),
    ),
  );
  assert.match(audioHtml, /<audio/);

  const pdfHtml = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(FileViewer, { filePath: "/workspace/spec.pdf" }),
    ),
  );
  assert.match(pdfHtml, /data-type="pdf"/);
});

test("toolbar actions include mention, wrap, copy, and download buttons", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  assert.match(source, /copyText/);
  assert.match(source, /onMentionLines/);
  assert.match(source, /onAtMention/);
  assert.match(source, /wrapLines/);
  assert.match(source, /DownloadLink/);
});

test("file viewer copy button resolves its label and title in every language", async () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  globalThis.fetch = async (input) => {
    if (String(input).startsWith("/api/git/diff?")) {
      return { ok: true, json: async () => ({ supported: false }) };
    }
    return {
      ok: true,
      json: async () => ({ content: "hello", language: "text", size: 5 }),
    };
  };
  globalThis.EventSource = class EventSource {
    addEventListener() {}
    close() {}
  };

  try {
    for (const [locale, expectedLabel] of [["en", "Copy"], ["zh-CN", "复制"]]) {
      domWindow.localStorage.setItem("pi-locale", locale);
      const view = await mount(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(TextFileViewer, { filePath: "/workspace/main.txt" }),
        ),
      );

      try {
        await settle();
        const copyButton = view.container.querySelector(`button[aria-label='${expectedLabel}']`);
        assert.ok(copyButton, `${locale} renders the translated copy label`);
        assert.equal(copyButton.getAttribute("title"), expectedLabel);
        assert.notEqual(copyButton.getAttribute("aria-label"), "i18n.copyContent");
      } finally {
        await view.unmount();
      }
    }
  } finally {
    domWindow.localStorage.removeItem("pi-locale");
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
  }
});

test("file viewer contains zero static inline styles", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  const styleMatches = [...source.matchAll(/\bstyle\s*=\s*\{([^}]+)\}/g)];
  assert.deepEqual(styleMatches, []);
});

test("toolbar mode buttons and wrap toggle do not contain state-driven inline styles", async () => {
  const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /background:\s*active\s*\?/);
  assert.doesNotMatch(source, /color:\s*active\s*\?/);
  assert.doesNotMatch(source, /background:\s*wrapLines\s*\?/);
  assert.doesNotMatch(source, /color:\s*wrapLines\s*\?/);
  assert.doesNotMatch(source, /background:\s*watching\s*\?/);
  assert.doesNotMatch(source, /boxShadow:\s*watching\s*\?/);
});

test("file viewer toolbar follows verified Codex 36px height", async () => {
  const css = await readFile(new URL("./file-viewer/file-viewer.module.css", import.meta.url), "utf8");
  assert.match(css, /\.toolbar\s*\{[^}]*height:\s*36px;/);
  assert.match(css, /\.mediaToolbar\s*\{[^}]*height:\s*36px;/);
});
