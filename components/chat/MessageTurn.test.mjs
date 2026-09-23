import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost" });
globalThis.window = browser;
globalThis.document = browser.document;
globalThis.HTMLElement = browser.HTMLElement;
globalThis.Node = browser.Node;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import("react-dom/client");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MessageTurn } = await jiti.import("./MessageTurn.tsx");
const { MessageView } = await jiti.import("../MessageView.tsx");
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

async function renderMeasuredUserTurn(height, { attachment = false, fontSize = "13px", lineHeight = "20px", message } = {}) {
  let measuredHeight = height;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalRect = browser.Element.prototype.getBoundingClientRect;
  const originalStyle = browser.getComputedStyle;
  const originalViewport = Object.getOwnPropertyDescriptor(browser, "visualViewport");
  const visualViewport = new browser.EventTarget();
  Object.defineProperty(browser, "visualViewport", { configurable: true, value: visualViewport });
  const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
  const fonts = new browser.EventTarget();
  fonts.ready = new Promise(() => {});
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  const originalResizeObserver = browser.ResizeObserver;
  const observers = new Set();
  browser.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe() {}
    disconnect() { observers.delete(this); }
  };
  browser.Element.prototype.getBoundingClientRect = () => ({ height: measuredHeight });
  browser.getComputedStyle = () => ({ fontSize, lineHeight });

  await React.act(async () => {
    root.render(React.createElement(
      I18nProvider,
      null,
      message
        ? React.createElement(MessageView, { message })
        : React.createElement(
            MessageTurn,
            { role: "user", userText: "A long user message", copyContent: "A long user message" },
            attachment ? React.createElement("img", { alt: "Attachment" }) : null,
          ),
    ));
  });

  return {
    container,
    visualViewport,
    fonts,
    setHeight(next) { measuredHeight = next; },
    notifyLayoutChange() { for (const observer of observers) observer.callback([]); },
    async cleanup() {
      await React.act(async () => root.unmount());
      container.remove();
      browser.Element.prototype.getBoundingClientRect = originalRect;
      browser.getComputedStyle = originalStyle;
      if (originalViewport) Object.defineProperty(browser, "visualViewport", originalViewport);
      else delete browser.visualViewport;
      if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
      else delete document.fonts;
      browser.ResizeObserver = originalResizeObserver;
    },
  };
}

test("a tall user message collapses to two lines and its toggle keeps focus", async () => {
  const view = await renderMeasuredUserTurn(60);
  try {
    const toggle = view.container.querySelector("button[aria-expanded]");
    assert.ok(toggle);
    assert.equal(toggle.textContent, "Show more");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    const text = view.container.querySelector(`#${toggle.getAttribute("aria-controls")}`);
    assert.equal(text.getAttribute("data-collapsed"), "true");

    toggle.focus();
    await React.act(async () => toggle.click());
    assert.equal(toggle.textContent, "Show less");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(text.getAttribute("data-collapsed"), "false");
    assert.equal(document.activeElement, toggle);

    await React.act(async () => toggle.click());
    assert.equal(toggle.textContent, "Show more");
    assert.equal(document.activeElement, toggle);
  } finally {
    await view.cleanup();
  }
});

test("the user message renderer supplies its text to the collapsible body", async () => {
  const view = await renderMeasuredUserTurn(60, { message: { role: "user", content: "First line\nSecond line\nThird line" } });
  try {
    assert.equal(view.container.querySelector("button[aria-expanded]")?.textContent, "Show more");
    assert.match(view.container.textContent, /Third line/);
  } finally {
    await view.cleanup();
  }
});

test("normal line height uses the 13 px fallback font size", async () => {
  const view = await renderMeasuredUserTurn(41, { fontSize: "", lineHeight: "normal" });
  try {
    assert.equal(view.container.querySelector("button[aria-expanded]")?.textContent, "Show more");
  } finally {
    await view.cleanup();
  }
});

test("the user copy label changes only after the clipboard accepts the message", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (value) => { copied.push(value); } } },
  });
  const view = await renderMeasuredUserTurn(30);
  try {
    const button = view.container.querySelector('[data-message-action="copy"]');
    assert.equal(button.getAttribute("aria-label"), "Copy message");
    await React.act(async () => button.click());
    assert.deepEqual(copied, ["A long user message"]);
    assert.equal(button.getAttribute("aria-label"), "Copied");
  } finally {
    await view.cleanup();
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
});

test("a user message recalculates when its layout changes without a window resize", async () => {
  const view = await renderMeasuredUserTurn(30);
  try {
    view.setHeight(60);
    await React.act(async () => view.notifyLayoutChange());
    assert.equal(view.container.querySelector("button[aria-expanded]")?.textContent, "Show more");
  } finally {
    await view.cleanup();
  }
});

test("attachment loading recalculates the user message height", async () => {
  const view = await renderMeasuredUserTurn(30, { attachment: true });
  try {
    view.setHeight(60);
    const image = view.container.querySelector('img[alt="Attachment"]');
    await React.act(async () => image.dispatchEvent(new browser.Event("load")));
    assert.equal(view.container.querySelector("button[aria-expanded]")?.textContent, "Show more");
  } finally {
    await view.cleanup();
  }
});

test("font loading recalculates the user message height", async () => {
  const view = await renderMeasuredUserTurn(30);
  try {
    view.setHeight(60);
    await React.act(async () => view.fonts.dispatchEvent(new browser.Event("loadingdone")));
    assert.equal(view.container.querySelector("button[aria-expanded]")?.textContent, "Show more");
  } finally {
    await view.cleanup();
  }
});

test("zoom recalculates a user message that becomes short", async () => {
  const view = await renderMeasuredUserTurn(60);
  try {
    view.setHeight(30);
    await React.act(async () => view.visualViewport.dispatchEvent(new browser.Event("resize")));
    assert.equal(view.container.querySelector("button[aria-expanded]"), null);
  } finally {
    await view.cleanup();
  }
});

test("a message within one pixel of two lines has no toggle and updates after resize", async () => {
  const view = await renderMeasuredUserTurn(41);
  try {
    assert.equal(view.container.querySelector("button[aria-expanded]"), null);

    view.setHeight(42);
    await React.act(async () => window.dispatchEvent(new browser.Event("resize")));
    assert.equal(view.container.querySelector("button[aria-expanded]")?.textContent, "Show more");

    view.setHeight(40);
    await React.act(async () => window.dispatchEvent(new browser.Event("resize")));
    assert.equal(view.container.querySelector("button[aria-expanded]"), null);
  } finally {
    await view.cleanup();
  }
});

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
  assert.match(css, /\.userTextViewport\s*\{[^}]*font-size:\s*var\(--text-base, 13px\);[^}]*line-height:\s*var\(--leading-transcript, 1\.5\);/);
  assert.match(css, /\.userTextViewport\[data-collapsed="true"\]\s*\{[^}]*max-height:\s*2lh;/);
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
