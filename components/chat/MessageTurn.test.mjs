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
const { MessageTurn } = await jiti.import("./MessageTurn.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderTurn(props, children = "Message content") {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageTurn, props, children),
    ),
  );
}

test("owns user framing and copy, retry, and branch actions", () => {
  const html = renderTurn({
    role: "user",
    copyContent: "Message content",
    onRetry() {},
    onBranch() {},
    branchPending: true,
    timestamp: "10:24",
  });

  assert.match(html, /data-message-role="user"/);
  assert.match(html, /data-message-action="copy"/);
  assert.match(html, /data-message-action="edit"/);
  assert.match(html, /data-message-action="fork"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /aria-label="Copy message"/);
  // The time is in the DOM but hidden until hover, like the actions.
  assert.match(html, /data-visible="false">10:24</);
});

test("owns assistant framing without showing copy during streaming", () => {
  const html = renderTurn({
    role: "assistant",
    copyContent: "Streaming answer",
    streaming: true,
    header: "Model name",
    footer: "Usage",
  });

  assert.match(html, /data-message-role="assistant"/);
  assert.match(html, /Model name/);
  assert.match(html, /Usage/);
  assert.doesNotMatch(html, /data-message-action="copy"/);
});

test("assistant time sits at the left of the footer and shows on hover only", () => {
  const html = renderTurn({
    role: "assistant",
    copyContent: "Answer",
    streaming: false,
    footer: "42 in · 12 out",
    timestamp: "10:24",
  });

  assert.match(html, /data-visible="false">42 in · 12 out<span data-visible="false">10:24<\/span><\/div>/);
  assert.ok(html.indexOf(">10:24<") < html.indexOf('data-message-action="copy"'));
  assert.doesNotMatch(html, /timestampTrailing/);
  assert.doesNotMatch(html, /assistantMeta/);
});

test("the hidden time rule lives in the transcript CSS", async () => {
  const css = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");
  assert.match(css, /\.timestamp\[data-visible="false"\]\s*\{[^}]*opacity:\s*0;/);
  assert.match(css, /\.timestamp\[data-visible="true"\]\s*\{[^}]*opacity:\s*1;/);
  assert.match(css, /\.assistantFooterMeta\[data-visible="false"\]\s*\{[^}]*opacity:\s*0;/);
  // The user bubble is the lightest shell surface. Codex order: background, sidebar, composer, bubble.
  assert.match(css, /\.userBubble\s*\{[^}]*background:\s*var\(--ui-user-bubble\);/);
  assert.doesNotMatch(css, /\.userBubble\s*\{[^}]*border:\s*1px solid/);
});

test("owns custom and compaction turn roles", () => {
  const customHtml = renderTurn({
    role: "custom",
    header: "extension",
    copyContent: "Extension message",
    footer: "Details action",
    afterBody: "Details body",
    timestamp: "10:24",
    cardHidden: true,
    cardExpanded: false,
  });
  const compactionHtml = renderTurn({
    role: "compaction",
    header: "compaction",
    timestamp: "10:25",
  });

  assert.match(customHtml, /data-message-role="custom"/);
  assert.match(customHtml, /data-hidden="true"/);
  assert.match(customHtml, /data-expanded="false"/);
  assert.match(customHtml, /data-message-action="copy"/);
  assert.match(customHtml, /Details action/);
  assert.match(customHtml, /Details body/);
  assert.match(compactionHtml, /data-message-role="compaction"/);
  assert.doesNotMatch(compactionHtml, /data-message-action="copy"/);
});

test("keeps action and role styles in the transcript CSS module", async () => {
  const source = await readFile(new URL("./MessageTurn.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");

  assert.match(source, /message-view\.module\.css/);
  assert.match(source, /className=\{styles\.messageCard\}/);
  assert.match(css, /\.messageAction:hover:not\(:disabled\)/);
  assert.match(css, /\.userMessageRow\s*\{[\s\S]*?max-width:\s*70%/);
  assert.match(css, /\.userBubble\s*\{[^}]*border-radius:\s*22px;[^}]*corner-shape:\s*superellipse\(1\.5\);[^}]*padding:\s*10px 16px;/);
  assert.match(css, /\.userBubble\s*\{[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*var\(--leading-transcript\);/);
  assert.match(css, /\.assistantBlocks\s*\{[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*var\(--leading-transcript\);/);
  assert.match(css, /\.messageAction\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;[^}]*border-radius:\s*10px;[^}]*padding:\s*4px;/);
});

test("shows the complete user message without an internal scrollbar", async () => {
  const css = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");
  const userBubble = css.match(/\.userBubble\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.doesNotMatch(userBubble, /max-height\s*:/);
  assert.doesNotMatch(userBubble, /overflow-y\s*:\s*(?:auto|scroll)/);
});

test("mobile user messages use the current Codex width", async () => {
  const css = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.userMessageRow\s*\{\s*max-width:\s*min\(456px, 100%\);/);
});
