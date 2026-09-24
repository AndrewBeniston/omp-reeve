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

const {
  ComposerFloatingGeometry,
  ComposerFrame,
  ModelErrorBanner,
  ModelScopeWarningBanner,
} = await jiti.import("./ComposerFrame.tsx");

test("owns the composer surface, editor, attachments, toolbar, and status semantics", () => {
  const html = renderToStaticMarkup(
    React.createElement(ComposerFrame, {
      onSubmit() {},
      fileInputRef: React.createRef(),
      onFileInputChange() {},
      modelError: "Invalid model configuration",
      modelScopeWarnings: ["No models match the configured scope"],
      retryStatus: { message: "Retrying 1 of 3", detail: "Connection closed" },
      successStatus: "Compacted 10k to about 6k tokens",
      compactError: "Compaction failed",
      queue: {
        items: [
          { id: "one", kind: "steer", text: "Adjust the current response", imageCount: 0 },
          { id: "two", kind: "followUp", text: "Then summarize the result", imageCount: 0 },
        ],
        paused: false,
        queueingEnabled: true,
        onDelete() {},
        onEdit() {},
        onReorder() {},
        onSendNow() {},
        onQueueingChange() {},
        onResume() {},
      },
      attachments: [{ previewUrl: "blob:one" }],
      onRemoveAttachment() {},
      inputOverlay: React.createElement("div", { "data-slot": "overlay" }),
      editor: React.createElement("div", { "data-composer-editor": true, role: "textbox", "aria-label": "Message" }),
      textareaHeight: "72px",
      mode: "idle",
      primaryActions: React.createElement("button", { type: "button" }, "Steer"),
      statusLine: React.createElement("div", { "data-slot": "status-line" }),
      toolbarStart: React.createElement("button", { type: "button" }, "Attach"),
      toolbarCenter: null,
      toolbarModelArea: React.createElement("div", null, "Context"),
      toolbarEnd: React.createElement("button", { type: "submit" }, "Send"),
      dictateLabel: "Dictate",
      toolbarEndRef: React.createRef(),
      isMobile: false,
    }),
  );

  assert.match(html, /<form[^>]+aria-label="Message composer"/);
  assert.match(html, /data-composer-editor="true"[^>]+role="textbox"[^>]+aria-label="Message"/);
  assert.match(html, /style="--ui-composer-height:72px"/);
  assert.match(html, /role="list"[^>]+aria-label="Image attachments"/);
  assert.match(html, /role="list"[^>]+aria-label="2 queued messages"/);
  assert.match(html, /<button[^>]+type="button"[^>]+aria-label="Steer queued message"/);
  assert.match(html, /<button[^>]+type="button"[^>]+aria-label="Remove image 1"/);
  assert.match(html, /role="alert"[^>]+data-state="error"/);
  assert.match(html, /role="status"[^>]+data-state="retry"/);
  assert.match(html, /role="status"[^>]+data-state="success"/);
  assert.match(html, /role="group"[^>]+aria-label="Composer utility bar"/);
  assert.ok(html.indexOf('data-slot="overlay"') < html.indexOf("data-composer-editor"));
  assert.ok(html.indexOf("Attach") < html.indexOf("Context"));
  assert.ok(html.indexOf("Context") < html.indexOf("Send"));
  assert.ok(html.indexOf('class="toolbarLeft"') < html.indexOf('class="toolbarRight"'));
  assert.ok(html.indexOf('class="toolbarRight"') < html.indexOf('class="toolbarModelArea"'));
  assert.ok(html.indexOf('class="toolbarRight"') < html.indexOf("Send"));
});

test("names the footer and selects the Session or Home overflow behavior", () => {
  const props = {
    onSubmit() {},
    fileInputRef: React.createRef(),
    fileInputId: "images",
    onFileInputChange() {},
    attachments: [],
    onRemoveAttachment() {},
    editor: React.createElement("div", { "data-composer-editor": true }),
    textareaHeight: "44px",
    mode: "idle",
    primaryActions: null,
    toolbarStart: React.createElement("button", { type: "button" }, "Add"),
    toolbarCenter: null,
    toolbarModelArea: null,
    toolbarEnd: React.createElement("button", { type: "submit" }, "Send"),
    dictateLabel: "Dictate",
    toolbarEndRef: React.createRef(),
    isMobile: false,
  };
  const sessionHtml = renderToStaticMarkup(React.createElement(ComposerFrame, { ...props, footerMode: "session" }));
  const homeHtml = renderToStaticMarkup(React.createElement(ComposerFrame, { ...props, footerMode: "home" }));

  assert.match(sessionHtml, /data-footer-mode="session"[^>]+role="group"[^>]+aria-label="Composer utility bar"/);
  assert.match(homeHtml, /data-footer-mode="home"[^>]+role="group"[^>]+aria-label="Composer utility bar"/);
});

test("wraps the Session footer and lets the Home footer scroll with edge fades", async () => {
  const css = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");

  assert.match(css, /\.toolbar\[data-footer-mode="session"\]\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.toolbar\[data-footer-mode="home"\]\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;/);
  assert.match(css, /\.toolbar\[data-footer-mode="home"\]\s*\{[^}]*mask-image:\s*linear-gradient/);
});

test("places the queued messages before the Composer surface", async () => {
  const source = await readFile(new URL("./ComposerFrame.tsx", import.meta.url), "utf8");
  const queueIndex = source.indexOf("<QueuedMessageList");
  const surfaceIndex = source.indexOf("className={styles.composer}");

  assert.match(source, /<form[^>]+className=\{styles\.composerShell\}/);
  assert.ok(queueIndex >= 0, "the queue renders");
  assert.ok(surfaceIndex > queueIndex, "the Composer surface follows the queue");
  assert.match(source, /<div className=\{styles\.queuePlacement\}>\s*<QueuedMessageList/);
});

test("marks a non-compact frame with content as large", async () => {
  const source = await readFile(new URL("./ComposerFrame.tsx", import.meta.url), "utf8");

  assert.match(source, /const hasLargeContent = Boolean\([\s\S]*?queue[\s\S]*?attachments\.length > 0[\s\S]*?statusLine,/);
  assert.match(source, /data-frame-variant=\{useSingleRow \|\| !hasLargeContent \? undefined : "large"\}/);
});

test("collapses the Composer into one control row while a question is open", async () => {
  const html = renderToStaticMarkup(
    React.createElement(ComposerFrame, {
      requestPending: true,
      onSubmit() {},
      fileInputRef: React.createRef(),
      onFileInputChange() {},
      attachments: [],
      onRemoveAttachment() {},
      editor: React.createElement("div", { "data-composer-editor": true }),
      textareaHeight: "44px",
      mode: "idle",
      primaryActions: null,
      toolbarStart: React.createElement("button", { type: "button" }, "Attach"),
      toolbarCenter: null,
      toolbarModelArea: React.createElement("button", { type: "button" }, "Model"),
      toolbarEnd: React.createElement("button", { type: "submit" }, "Send"),
      dictateLabel: "Dictate",
      toolbarEndRef: React.createRef(),
      isMobile: false,
    }),
  );
  const css = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");

  assert.match(html, /<div[^>]+class="composer"[^>]+data-compact="true"/);
  assert.match(css, /\.composer\[data-compact="true"\][^{]*\{[^}]*min-height:\s*var\(--composer-request-height\);/);
  assert.match(css, /\.composer\[data-compact="true"\][\s\S]*?\.composerContent\s*\{[^}]*grid-template-areas:\s*"start input end";/);
  assert.match(css, /\.composer\[data-compact="true"\][\s\S]*?\.toolbar\s*\{[^}]*display:\s*contents;/);
});

test("keeps the full Composer layout when a pending question has attachments", () => {
  const html = renderToStaticMarkup(
    React.createElement(ComposerFrame, {
      requestPending: true,
      onSubmit() {},
      fileInputRef: React.createRef(),
      onFileInputChange() {},
      attachments: [{ previewUrl: "blob:one" }],
      onRemoveAttachment() {},
      editor: React.createElement("div", { "data-composer-editor": true }),
      textareaHeight: "44px",
      mode: "idle",
      primaryActions: null,
      toolbarStart: React.createElement("button", { type: "button" }, "Attach"),
      toolbarCenter: null,
      toolbarModelArea: React.createElement("button", { type: "button" }, "Model"),
      toolbarEnd: React.createElement("button", { type: "submit" }, "Send"),
      dictateLabel: "Dictate",
      toolbarEndRef: React.createRef(),
      isMobile: false,
    }),
  );

  assert.doesNotMatch(html, /data-compact="true"/);
  assert.match(html, /aria-label="Image attachments"/);
});

test("keeps Dictate hidden until dictation becomes available", () => {
  const props = {
    onSubmit() {},
    fileInputRef: React.createRef(),
    onFileInputChange() {},
    attachments: [],
    onRemoveAttachment() {},
    editor: React.createElement("div", { "data-composer-editor": true }),
    textareaHeight: "auto",
    mode: "idle",
    primaryActions: null,
    toolbarStart: React.createElement("button", { type: "button" }, "Attach"),
    toolbarCenter: null,
    toolbarModelArea: React.createElement("button", { type: "button" }, "Model"),
    toolbarEnd: React.createElement("button", { type: "submit" }, "Send"),
    dictateLabel: "Dictate",
    toolbarEndRef: React.createRef(),
    isMobile: false,
  };
  const hiddenHtml = renderToStaticMarkup(React.createElement(ComposerFrame, props));
  const availableHtml = renderToStaticMarkup(React.createElement(ComposerFrame, {
    ...props,
    dictationAvailable: true,
  }));

  assert.match(hiddenHtml, /<button[^>]+aria-label="Dictate"[^>]+hidden=""/);
  assert.match(hiddenHtml, /Model[\s\S]*aria-label="Dictate"[\s\S]*Send/);
  assert.match(availableHtml, /<button[^>]+aria-label="Dictate"[^>]*>/);
  assert.doesNotMatch(availableHtml.match(/<button[^>]+aria-label="Dictate"[^>]*>/)[0], /hidden=/);
  assert.match(availableHtml, /aria-label="Dictate"[\s\S]*<svg[^>]+width="16"[^>]+height="16"/);
  assert.match(availableHtml, /role="tooltip"[^>]*>Dictate<\/span>/);
});

test("keeps empty notices out of the accessibility tree", () => {
  assert.equal(renderToStaticMarkup(React.createElement(ModelErrorBanner, { error: null })), "");
  assert.equal(renderToStaticMarkup(React.createElement(ModelScopeWarningBanner, { warnings: [] })), "");
});

test("applies only the approved floating menu geometry variables", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ComposerFloatingGeometry,
      { left: 24, bottom: 48, maxHeight: 320, isMobile: true },
      React.createElement("div", null, "Models"),
    ),
  );

  assert.match(html, /style="--ui-animation-origin-x:24px;--ui-animation-origin-y:48px;--ui-scroll-offset:320px"/);
  assert.match(html, /data-mobile="true"/);
});

test("contains exactly two approved runtime geometry paths", async () => {
  const source = await readFile(new URL("./ComposerFrame.tsx", import.meta.url), "utf8");

  assert.equal(source.match(/<DynamicStyleVars/g)?.length, 2);
  assert.match(source, /"--ui-composer-height"/);
  assert.match(source, /"--ui-animation-origin-x"/);
  assert.match(source, /"--ui-animation-origin-y"/);
  assert.match(source, /"--ui-scroll-offset"/);
  assert.doesNotMatch(source, /\bstyle\s*=/);
  assert.doesNotMatch(source, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.doesNotMatch(source, /\bInter\b/i);
});

test("send and stop circles take their fill from the theme primary token", async () => {
  // The current Codex build uses the foreground tone for the button fill.
  // OMP maps that tone through Tier 2 so each theme remains authoritative.
  const css = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");
  const rule = css.match(/\.sendAction,\s*\.stopControl\s*\{[^}]*\}/);

  assert.ok(rule, "the .sendAction, .stopControl rule exists");
  assert.match(rule[0], /background:\s*var\(--ui-composer-primary\);/);
  assert.match(rule[0], /color:\s*var\(--ui-composer-primary-foreground\);/);
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

test("uses the reference frame geometry across default, large, compact, and mobile states", async () => {
  const css = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");
  const editorCss = await readFile(new URL("./composer-editor.module.css", import.meta.url), "utf8");
  const tokens = await readFile(new URL("../../app/tokens.css", import.meta.url), "utf8");

  assert.match(css, /\.composer\s*\{[^}]*border-radius:\s*var\(--radius-composer\);/);
  assert.match(css, /\.composer\[data-frame-variant="large"\]\s*\{[^}]*border-radius:\s*var\(--radius-composer-large\);/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.composer\s*\{[^}]*border-radius:\s*var\(--radius-composer-compact\);/);
  assert.match(tokens, /--radius-composer:\s*22px;/);
  assert.match(tokens, /--radius-composer-large:\s*28px;/);
  assert.match(tokens, /--radius-composer-compact:\s*10px;/);
  assert.match(tokens, /--radius-3xl:\s*20px;/);
  assert.match(tokens, /--composer-frame-min-height:\s*44px;/);
  assert.match(tokens, /--composer-control-size:\s*28px;/);
  assert.match(css, /\.composerContent\s*\{[^}]*padding:\s*14px 12px 0;/);
  assert.match(editorCss, /\.editor\s*\{[^}]*min-height:\s*44px;[^}]*line-height:\s*20px;[^}]*padding:\s*0;/);
  assert.match(editorCss, /\.editor\[data-empty="true"\]::before\s*\{[^}]*opacity:\s*0\.5;/);
  assert.match(css, /\.imagePreviews\s*\{[^}]*padding:\s*8px;[^}]*border-radius:\s*var\(--composer-attachment-radius\);/);
  assert.match(css, /\.imagePreview\s*\{[^}]*border-radius:\s*var\(--composer-attachment-radius\);/);
  assert.match(css, /--composer-attachment-radius:\s*max\(calc\(var\(--radius-composer-large\) - 8px\), 0px\);/);
  assert.match(css, /--composer-attachment-radius:\s*max\(calc\(var\(--radius-composer-compact\) - 8px\), 0px\);/);
  assert.match(css, /\.composer\[data-compact="true"\]\s+\[data-composer-editor\]\s*\{[^}]*padding:\s*0 12px;/);
});

test("uses the measured gaps for the two desktop footer groups", async () => {
  const css = await readFile(new URL("./composer.module.css", import.meta.url), "utf8");
  const leftGroup = css.match(/^\.toolbarLeft\s*\{[^}]*\}/m);
  const rightGroup = css.match(/^\.toolbarRight\s*\{[^}]*\}/m);
  const modelArea = css.match(/\.toolbarModelArea\s*\{[^}]*\}/);
  const trailingCluster = css.match(/\.toolbarTrailing\s*\{[^}]*\}/);
  const dictateControl = css.match(/\.dictateControl\s*\{[^}]*\}/);

  assert.ok(leftGroup, "the left footer group exists");
  assert.ok(rightGroup, "the right footer group exists");
  assert.ok(modelArea, "the model area exists");
  assert.ok(trailingCluster, "the trailing cluster exists");
  assert.ok(dictateControl, "the Dictate control exists");
  assert.match(leftGroup[0], /gap:\s*5px;/);
  assert.match(rightGroup[0], /justify-content:\s*flex-end;/);
  assert.match(modelArea[0], /flex:\s*1;/);
  assert.match(modelArea[0], /gap:\s*4px;/);
  assert.match(trailingCluster[0], /flex-shrink:\s*0;/);
  assert.match(trailingCluster[0], /gap:\s*8px;/);
  assert.match(dictateControl[0], /width:\s*var\(--composer-control-size\);/);
  assert.match(dictateControl[0], /height:\s*var\(--composer-control-size\);/);
  assert.match(dictateControl[0], /border-radius:\s*var\(--radius-round\);/);
  assert.match(dictateControl[0], /background:\s*transparent;/);
});

test("applies Composer display preferences without replacing the editor", () => {
  const html = renderToStaticMarkup(
    React.createElement(ComposerFrame, {
      onSubmit() {},
      fileInputRef: React.createRef(),
      onFileInputChange() {},
      attachments: [{ previewUrl: "blob:one" }],
      localAttachments: React.createElement("div", { "data-local-attachments": true }),
      onRemoveAttachment() {},
      editor: React.createElement("div", { "data-composer-editor": true }),
      textareaHeight: "44px",
      mode: "idle",
      primaryActions: null,
      toolbarStart: React.createElement("button", { type: "button" }, "Attach"),
      toolbarCenter: null,
      toolbarModelArea: null,
      toolbarEnd: React.createElement("button", { type: "submit" }, "Send"),
      dictateLabel: "Dictate",
      toolbarEndRef: React.createRef(),
      isMobile: false,
      plainTextMode: true,
      attachmentLayout: "icon",
      topInsetPx: 24,
    }),
  );

  assert.match(html, /data-plain-text-mode="true"/);
  assert.match(html, /data-attachment-layout="icon"/);
  assert.match(html, /data-top-inset="24"/);
  assert.match(html, /data-composer-editor="true"/);
  assert.match(html, /data-local-attachments="true"/);
});
