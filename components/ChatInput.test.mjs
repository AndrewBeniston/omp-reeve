import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import ts from "typescript";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  ChatInput,
  ModelErrorBanner,
  ModelScopeWarningBanner,
  canRestoreUserMessage,
  dispatchIdleSubmission,
  dispatchPausedQueueSubmission,
  dispatchStreamingSubmission,
  filterModelOptions,
  getAcceptedImageFiles,
  getComposerTextareaHeight,
  hasUnsentComposerInput,
  getUserMessageText,
  getUserMessageDraftImages,
  resolveStreamingSubmissionMode,
  shouldConfirmPausedQueueSubmission,
  shouldAbortComposer,
  shouldCycleComposerEffort,
  shouldSubmitComposer,
} = await jiti.import("./ChatInput.tsx");
const { clearDraft, getDraft, mergeRestoredSubmissionDraft, mergeRestoredSubmissionText, rekeyDraft, setDraft } = await jiti.import("../lib/draft-store.ts");
const attachmentState = () => jiti.import("../lib/composer-attachment-state.ts");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const englishMessages = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const chineseMessages = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

function renderChatInput(props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
        ...props,
      }),
    ),
  );
}

function openingTagFor(html, attribute) {
  const match = html.match(new RegExp(`<[^>]+${attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`));
  assert.ok(match, `Expected an element with ${attribute}`);
  return match[0];
}

function buttonFor(html, label) {
  const match = html.match(new RegExp(`<button[^>]+aria-label="${label}"[^>]*>[\\s\\S]*?<\\/button>`));
  assert.ok(match, `Expected a button with aria-label="${label}"`);
  return match[0];
}

function nativeButtonTypes(source, path) {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const buttons = [];

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(sourceFile) === "button"
    ) {
      const typeAttribute = node.attributes.properties.find((attribute) => (
        ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "type"
      ));
      const type = typeAttribute && ts.isJsxAttribute(typeAttribute)
        && typeAttribute.initializer && ts.isStringLiteral(typeAttribute.initializer)
        ? typeAttribute.initializer.text
        : null;
      buttons.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1, path, type });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return buttons;
}

test("renders the upstream model error", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModelErrorBanner, {
      error: "Invalid models.json schema:\nproviders.custom.models.0.id must not be empty",
    }),
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Model error/);
  assert.match(html, /providers\.custom\.models\.0\.id must not be empty/);
});

test("does not render an empty model error", () => {
  assert.equal(renderToStaticMarkup(React.createElement(ModelErrorBanner, { error: null })), "");
});

test("exposes a model error state through the alert seam", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModelErrorBanner, { error: "Invalid model configuration" }),
  );

  const alert = openingTagFor(html, 'role="alert"');
  assert.match(alert, /data-state="error"/);
});

test("exposes model switching as a disabled collapsed running control", () => {
  const html = renderChatInput({
    onModelChange() {},
    model: { provider: "deepseek", modelId: "deepseek-v4-flash" },
    modelList: [{ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
    modelSwitching: true,
  });

  const control = openingTagFor(html, 'title="Switching model"');
  assert.match(control, /aria-expanded="false"/);
  assert.match(control, /data-state="running"/);
  assert.match(control, /disabled=""/);
});

test("the footer chip shows the model, effort, and chevron with a marked top step", async () => {
  const model = { provider: "openai", modelId: "gpt-5.4" };
  const props = {
    onModelChange() {},
    model,
    modelList: [{ provider: model.provider, id: model.modelId, name: "GPT-5.4" }],
    availableThinkingLevels: ["medium", "max"],
  };
  const normal = buttonFor(renderChatInput({ ...props, thinkingLevel: "medium" }), "Model settings");
  const top = buttonFor(renderChatInput({ ...props, thinkingLevel: "max" }), "Model settings");
  const topWithoutLevelMetadata = buttonFor(renderChatInput({ ...props, availableThinkingLevels: [], thinkingLevel: "max" }), "Model settings");
  const effortOnly = buttonFor(renderChatInput({ ...props, model: null, thinkingLevel: "max" }), "Model settings");
  const css = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");

  assert.match(normal, /class="[^"]*modelName">GPT-5\.4<\/span>[\s\S]*class="[^"]*reasoningLevel"[^>]*><span class="reasoningCurrent">Medium/);
  assert.match(normal, /class="modelChevron"/);
  assert.match(top, /class="[^"]*reasoningLevel"[^>]*data-top-step="true"[^>]*><span class="reasoningCurrent">Max/);
  assert.match(topWithoutLevelMetadata, /class="[^"]*reasoningLevel"[^>]*data-top-step="true"/);
  assert.match(effortOnly, /class="[^"]*reasoningLevel"[^>]*data-model-prefix="false"/);
  assert.doesNotMatch(effortOnly, /class="[^"]*modelName"/);
  assert.match(css, /\.modelName\s*\{[^}]*font-size:\s*var\(--text-sm\);[^}]*font-weight:\s*var\(--font-weight-medium\);/);
  assert.match(css, /\.reasoningLevel\s*\{[^}]*color:\s*var\(--ui-text-dim\);/);
  assert.match(css, /\.reasoningLevel\[data-top-step="true"\]\s*\{[^}]*color:\s*var\(--ui-accent\);/);
  assert.match(css, /\.reasoningLevel\[data-model-prefix="false"\]\s*\{[^}]*color:\s*var\(--ui-text\);/);
  assert.match(css, /\.menuTrigger\s*\{[^}]*min-height:\s*36px;[^}]*padding:\s*var\(--space-1\) var\(--space-2\);/);
  assert.match(css, /\.menuTrigger\s*\{[^}]*max-width:\s*calc\(64 \* var\(--space-1\)\);/);
});

test("uses a CSS hover seam for composer controls", () => {
  const html = renderChatInput({ contextUsage: { tokens: 10, contextWindow: 100, percent: 10 } });

  const control = openingTagFor(html, 'aria-label="Context donut: 10%"');
  assert.match(control, /class="[^"]*stateControl/);
});

test("renders only the consolidated desktop toolbar controls", () => {
  const html = renderChatInput({
    model: { provider: "openai", modelId: "gpt-5.4" },
    modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
    onModelChange() {},
    projectTrust: { requiresTrust: true, trusted: false },
    onProjectTrustClick() {},
    onThinkingLevelChange() {},
    onToolPresetChange() {},
    onCompact() {},
    thinkingLevel: "medium",
    contextUsage: { tokens: 10_000, contextWindow: 100_000, percent: 10 },
  });

  for (const label of ["Add", "Model settings", "Restricted mode", "Context donut: 10%"]) {
    assert.match(html, new RegExp(`aria-label="${label}"`));
  }
  const attach = buttonFor(html, "Add");
  const model = buttonFor(html, "Model settings");
  const mode = buttonFor(html, "Restricted mode");
  const send = buttonFor(html, "Send");

  assert.match(attach, /<svg[^>]+width="20"[^>]+height="20"/);
  assert.match(model, /class="[^"]*modelName">GPT-5\.4<\/span>/);
  assert.match(model, /class="reasoningLevel"><span class="reasoningCurrent">Medium<\/span>/);
  assert.match(model, /class="modelChevron"/);
  assert.match(mode, /<svg[^>]+width="16"[^>]+height="16"/);
  assert.match(send, /type="submit"/);
  assert.match(send, /<svg[^>]+width="16"[^>]+height="16"/);
  assert.doesNotMatch(send, />\s*Send\s*</);
  // Codex order, right cluster: Context donut, then model pill, then Send.
  assert.ok(html.indexOf('aria-label="Add"') < html.indexOf('aria-label="Restricted mode"'));
  assert.ok(html.indexOf('aria-label="Restricted mode"') < html.indexOf('aria-label="Context donut'));
  assert.ok(html.indexOf('aria-label="Context donut') < html.indexOf("modelName"));
  assert.ok(html.indexOf("modelName") < html.indexOf('aria-label="Send"'));
  assert.doesNotMatch(html, /aria-label="Session menu"[^>]*>[^<]*<span class="contextLabel"/);
  assert.doesNotMatch(html, /aria-label="Change reasoning level"/);
  assert.doesNotMatch(html, /aria-label="Change tool preset"/);
  assert.doesNotMatch(html, /aria-label="Compact context"/);
  assert.doesNotMatch(html, /aria-label="Enable completion sound"/);
  assert.doesNotMatch(html, /menuitemradio/);
});

test("renders the desktop footer groups in Codex order without unavailable Dictate", () => {
  const common = {
    model: { provider: "openai", modelId: "gpt-5.4" },
    modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
    onModelChange() {},
    onProjectTrustClick() {},
    approvalMode: "yolo",
    contextUsage: { tokens: 10_000, contextWindow: 100_000, percent: 10 },
  };
  const untrustedHtml = renderChatInput({
    ...common,
    projectTrust: { requiresTrust: true, trusted: false },
  });
  const trustedHtml = renderChatInput({
    ...common,
    projectTrust: { requiresTrust: true, trusted: true },
  });

  const expectedOrder = [
    'aria-label="Add"',
    'aria-label="Restricted mode"',
    'aria-label="Context donut: 10%"',
    'aria-label="Model settings"',
    'aria-label="Send"',
  ];
  for (let index = 1; index < expectedOrder.length; index += 1) {
    assert.ok(untrustedHtml.indexOf(expectedOrder[index - 1]) < untrustedHtml.indexOf(expectedOrder[index]));
  }

  assert.doesNotMatch(untrustedHtml, /aria-label="Dictate"/);

  assert.doesNotMatch(trustedHtml, /aria-label="Restricted mode"/);
  assert.match(trustedHtml, /aria-label="Full access"/);
  assert.ok(trustedHtml.indexOf('aria-label="Add"') < trustedHtml.indexOf('aria-label="Full access"'));
  assert.ok(trustedHtml.indexOf('aria-label="Full access"') < trustedHtml.indexOf('aria-label="Context donut: 10%"'));
  assert.ok(trustedHtml.indexOf('aria-label="Context donut: 10%"') < trustedHtml.indexOf('aria-label="Model settings"'));
  assert.ok(trustedHtml.indexOf('aria-label="Model settings"') < trustedHtml.indexOf('aria-label="Send"'));
  assert.doesNotMatch(trustedHtml, /aria-label="Dictate"/);
});

test("groups desktop model controls separately from Send when Dictate is unavailable", () => {
  const html = renderChatInput({
    model: { provider: "openai", modelId: "gpt-5.4" },
    modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
    onModelChange() {},
    contextUsage: { tokens: 10_000, contextWindow: 100_000, percent: 10 },
  });

  assert.match(html, /class="toolbarModelArea"[^>]*>[\s\S]*aria-label="Context donut: 10%"[\s\S]*aria-label="Model settings"/);
  assert.match(html, /class="toolbarTrailing"[^>]*>[\s\S]*aria-label="Send"/);
  assert.doesNotMatch(html, /aria-label="Dictate"/);
});

test("provides Dictate labels in both message catalogs", async () => {
  const [english, simplifiedChinese] = await Promise.all([
    readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  assert.match(english, /"chat\.dictate":\s*"Dictate"/);
  assert.match(simplifiedChinese, /"chat\.dictate":\s*"听写"/);
});

test("provides the no-context status in both message catalogs", async () => {
  const [english, simplifiedChinese] = await Promise.all([
    readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  assert.match(english, /"session\.noContextUsage":\s*"No context usage yet"/);
  assert.match(simplifiedChinese, /"session\.noContextUsage":\s*"尚无上下文使用量"/);
});

test("uses glossary namespaces for the Context donut and Session menu", async () => {
  const [source, english, simplifiedChinese] = await Promise.all([
    readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8"),
  ]);

  assert.match(source, /t\("composer\.contextDonutAria"/);
  assert.match(source, /t\("session\.menu"\)/);
  assert.match(source, /const \[sessionMenuOpen, setSessionMenuOpen\]/);
  assert.match(source, /const sessionMenuRef = useRef/);
  assert.match(source, /function ContextDonut\(/);
  for (const catalog of [english, simplifiedChinese]) {
    assert.match(catalog, /"composer\.contextDonutAria"/);
    assert.match(catalog, /"session\.menu"/);
    assert.doesNotMatch(catalog, /"chat\.(?:contextDonutAria|sessionMenu)"/);
  }
});

test("renders Stop as the same icon-only action circle", () => {
  const html = renderChatInput({ isStreaming: true });
  const stop = buttonFor(html, "Stop agent");

  assert.match(stop, /class="[^"]*stopControl/);
  assert.match(stop, /<svg[^>]+width="16"[^>]+height="16"/);
  assert.match(stop, /<rect x="2" y="2" width="12" height="12" rx="1\.5"/);
  assert.doesNotMatch(stop, />\s*Stop\s*</);
  assert.match(html, /role="tooltip"[^>]*>Stop agent<\/span>/);
});

test("Send has a visible tooltip", () => {
  const html = renderChatInput();

  assert.match(buttonFor(html, "Send"), /type="submit"/);
  assert.match(html, /role="tooltip"[^>]*>Send<\/span>/);
});

test("shows the complete project access state", () => {
  const callback = () => {};
  assert.match(renderChatInput({
    projectTrust: { requiresTrust: true, trusted: false },
  }), /aria-label="Restricted mode"/);
  assert.match(renderChatInput({
    projectTrust: { requiresTrust: true, trusted: true },
    onProjectTrustClick: callback,
    approvalMode: "yolo",
  }), /aria-label="Full access"/);
  assert.match(renderChatInput({
    projectTrust: { requiresTrust: false, trusted: false },
    onProjectTrustClick: callback,
    approvalMode: "yolo",
  }), /aria-label="Full access"/);
});

test("matches the Codex attachment and model icon language", () => {
  const html = renderChatInput({
    model: { provider: "openai", modelId: "gpt-5.4" },
    modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
    onModelChange() {},
  });

  assert.match(buttonFor(html, "Add"), /M10 3v14M3 10h14/);
  assert.match(buttonFor(html, "Model settings"), /data-composer-icon="model"/);
});

test("contains no direct DOM style mutations", async () => {
  const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\.style\s*(?:\.|\[)/);
});

test("renders enabledModels scope warnings", () => {
  const html = renderToStaticMarkup(
    React.createElement(ModelScopeWarningBanner, {
      warnings: ['No models match pattern "ghost-gateway/*"'],
    }),
  );

  assert.match(html, /Model scope warning/);
  assert.match(html, /ghost-gateway/);
  assert.equal(renderToStaticMarkup(React.createElement(ModelScopeWarningBanner, { warnings: [] })), "");
});

test("renders composer status colors with Tier 2 semantic tokens", async () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onCompact() {},
        isStreaming: false,
        isCompacting: true,
        modelError: "Invalid model configuration",
        modelScopeWarnings: ["No models match the configured scope"],
        retryInfo: { attempt: 1, maxAttempts: 3 },
        compactError: "Compaction failed",
        compactResult: {
          reason: "manual",
          tokensBefore: 10_000,
          estimatedTokensAfter: 6_000,
        },
        contextUsage: { tokens: 100_000, contextWindow: 128_000, percent: 78 },
      }),
    ),
  );
  const css = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");

  assert.match(css, /var\(--ui-danger\)/);
  assert.match(css, /var\(--ui-warning\)/);
  assert.match(css, /var\(--ui-success\)/);
  assert.match(css, /var\(--ui-danger-wash\)/);
  assert.match(css, /var\(--ui-warning-wash\)/);
  assert.match(css, /var\(--ui-success-wash\)/);
  assert.doesNotMatch(html, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

test("keeps the model selector visible when a model error leaves no options", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onModelChange() {},
        isStreaming: false,
        modelError: "Invalid models.json schema",
        modelList: [],
        modelNames: {},
      }),
    ),
  );

  assert.match(html, />No models</);
  assert.match(html, /title="No available models"/);
});

test("shows and locks the optimistic model while a switch is pending", async () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onModelChange() {},
        isStreaming: false,
        model: { provider: "deepseek", modelId: "deepseek-v4-flash" },
        modelList: [{ provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }],
        modelSwitching: true,
      }),
    ),
  );
  const css = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");

  assert.match(html, /title="Switching model"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, />DeepSeek V4 Flash</);
  assert.match(html, /class="[^"]*spinner/);
  assert.match(css, /animation:\s*spin 0\.8s linear infinite/);
});

test("filters model options by name and id", () => {
  const options = [
    { provider: "ollama", modelId: "qwen3:latest", name: "Qwen 3" },
    { provider: "anthropic", modelId: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { provider: "openai", modelId: "gpt-5.4", name: "GPT-5.4" },
  ];

  assert.deepEqual(filterModelOptions(options, "QWEN"), [options[0]]);
  assert.deepEqual(filterModelOptions(options, "claude-sonnet"), [options[1]]);
  assert.equal(filterModelOptions(options, "OpenAI").length, 0);
  assert.equal(filterModelOptions(options, "anthropic/claude").length, 0);
  assert.equal(filterModelOptions(options, "missing").length, 0);
  assert.equal(filterModelOptions(options, "  "), options);
});

test("restores text and base64 images when editing a user message", () => {
  const message = {
    role: "user",
    content: [
      { type: "text", text: "Review this image @src/example.ts " },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
    ],
  };

  assert.equal(getUserMessageText(message), "Review this image @src/example.ts ");
  assert.deepEqual(getUserMessageDraftImages(message), [
    { data: "AQID", mimeType: "image/png" },
  ]);
});

test("restores legacy flat image entries when editing a user message", () => {
  const message = {
    role: "user",
    content: [
      { type: "image", data: "AQID", mimeType: "image/jpeg" },
    ],
  };

  assert.deepEqual(getUserMessageDraftImages(message), [
    { data: "AQID", mimeType: "image/jpeg" },
  ]);
});

test("does not restore a historical message over a pending image attachment", () => {
  assert.equal(canRestoreUserMessage("", 0, 0), true);
  assert.equal(canRestoreUserMessage("", 1, 0), false);
  assert.equal(canRestoreUserMessage("", 0, 1), false);
  assert.equal(canRestoreUserMessage("draft", 0, 0), false);
});

test("restores a cleared submission using the queued React state", () => {
  let value = "failed submission";
  const updates = [
    () => "",
    (current) => mergeRestoredSubmissionText("failed submission", current),
  ];

  for (const update of updates) value = update(value);

  assert.equal(value, "failed submission");
  assert.equal(
    mergeRestoredSubmissionText("failed submission", "new draft"),
    "failed submission\n\nnew draft",
  );
  assert.equal(
    mergeRestoredSubmissionText("failed submission", "failed submission"),
    "failed submission\n\nfailed submission",
  );
});

test("keeps a failed first submission recoverable across a composer remount", () => {
  const image = { data: "AQID", mimeType: "image/png" };
  const restored = mergeRestoredSubmissionDraft(
    "failed submission",
    [image],
    "",
    [],
  );

  assert.deepEqual(restored, {
    value: "failed submission",
    images: [image],
  });
  assert.deepEqual(
    mergeRestoredSubmissionDraft("failed submission", [image], "new draft", []),
    {
      value: "failed submission\n\nnew draft",
      images: [image],
    },
  );
});

test("keeps native file and folder selections as removable Composer descriptors", async () => {
  const { addComposerAttachments, removeComposerAttachment, selectedAttachmentPaths } = await attachmentState();
  const file = { path: "/Projects/Client/notes.txt", issuedAt: 123, signature: "a".repeat(64), kind: "file" };
  const folder = { path: "/Projects/Client/Assets", issuedAt: 123, signature: "b".repeat(64), kind: "folder" };
  const attachments = addComposerAttachments([], [file, folder]);

  assert.deepEqual(attachments.map(({ name, kind, pathSummary, readError }) => ({ name, kind, pathSummary, readError })), [
    { name: "notes.txt", kind: "file", pathSummary: "…/Projects/Client", readError: null },
    { name: "Assets", kind: "folder", pathSummary: "…/Projects/Client", readError: null },
  ]);
  assert.deepEqual(selectedAttachmentPaths(attachments), [
    { path: file.path, issuedAt: file.issuedAt, signature: file.signature },
    { path: folder.path, issuedAt: folder.issuedAt, signature: folder.signature },
  ]);
  assert.deepEqual(removeComposerAttachment(attachments, attachments[0].id), [attachments[1]]);
});

test("keeps pasted text as a restorable attachment while its file is created", async () => {
  const {
    PASTED_TEXT_THRESHOLD,
    addPastedTextAttachment,
    pastedTextFromAttachment,
  } = await attachmentState();
  const text = "a".repeat(PASTED_TEXT_THRESHOLD + 1);
  const [attachment] = addPastedTextAttachment([], text);

  assert.equal(PASTED_TEXT_THRESHOLD, 5000);
  assert.deepEqual(attachment, {
    id: 1,
    name: "Pasted text.txt",
    kind: "file",
    pathSummary: "",
    readError: null,
    pastedText: text,
  });
  assert.equal(pastedTextFromAttachment(attachment), text);
});

test("preserves local attachment descriptors in draft restore and Session promotion", async () => {
  const { addComposerAttachments } = await attachmentState();
  const [first, second] = addComposerAttachments([], [
    { path: "/Projects/Client/notes.txt", issuedAt: 123, signature: "a".repeat(64), kind: "file" },
    { path: "/Projects/Client/Assets", issuedAt: 123, signature: "b".repeat(64), kind: "folder" },
  ]);
  const provisionalKey = "new:attachment-draft";
  const sessionKey = "attachment-session";
  clearDraft(provisionalKey);
  clearDraft(sessionKey);
  setDraft(provisionalKey, { value: "", images: [], attachments: [first] });

  const read = getDraft(provisionalKey);
  assert.deepEqual(read?.attachments, [first]);
  read.attachments[0].selection.path = "/changed";
  assert.equal(getDraft(provisionalKey)?.attachments?.[0].selection.path, first.selection.path);
  assert.deepEqual(rekeyDraft(provisionalKey, sessionKey)?.attachments, [first]);
  assert.deepEqual(mergeRestoredSubmissionDraft("failed", [], "current", [], [second], [first]).attachments, [second, first]);

  clearDraft(sessionKey);
});

test("draft replacement and deletion release only uploads without another draft owner", async (t) => {
  const originalFetch = globalThis.fetch;
  const deleted = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === "DELETE") deleted.push(url);
    return new Response(null, { status: 204 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const sessionId = "b7b00000-0000-4000-8000-000000000001";
  const upload = { id: `up_${"a".repeat(32)}`, sessionId, name: "notes.txt", size: 5, mediaType: "text/plain", state: "ready" };
  const attachment = { id: 1, upload, name: upload.name, kind: "file", pathSummary: "", readError: null };
  const first = "draft-upload-first";
  const second = "draft-upload-second";
  clearDraft(first);
  clearDraft(second);
  setDraft(first, { value: "", images: [], attachments: [attachment] });
  setDraft(second, { value: "", images: [], attachments: [attachment] });
  setDraft(first, { value: "replacement", images: [] });
  await Promise.resolve();
  assert.deepEqual(deleted, []);
  clearDraft(second);
  await Promise.resolve();
  assert.deepEqual(deleted, [`/api/sessions/${sessionId}/uploads/${upload.id}`]);
  clearDraft(first);
});

test("Session promotion and submission preserve the upload during draft transfer", async (t) => {
  const originalFetch = globalThis.fetch;
  const deleted = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === "DELETE") deleted.push(url);
    return new Response(null, { status: 204 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const sessionId = "b7b00000-0000-4000-8000-000000000001";
  const upload = { id: `up_${"b".repeat(32)}`, sessionId, name: "notes.txt", size: 5, mediaType: "text/plain", state: "ready" };
  const attachment = { id: 1, upload, name: upload.name, kind: "file", pathSummary: "", readError: null };
  const provisional = "new:draft-upload-promotion";
  clearDraft(provisional);
  clearDraft(sessionId);
  setDraft(provisional, { value: "send this", images: [], attachments: [attachment] });
  rekeyDraft(provisional, sessionId);
  assert.equal(getDraft(sessionId)?.attachments?.[0].upload.id, upload.id);
  clearDraft(sessionId, { preserveUploads: true });
  await Promise.resolve();
  assert.deepEqual(deleted, []);
});

test("renders file and folder rows with names, locations, readiness, errors, and remove controls", async () => {
  const { addComposerAttachments } = await attachmentState();
  const key = "attachment-rows";
  const attachments = addComposerAttachments([], [
    { path: "/Projects/Client/notes.txt", issuedAt: 123, signature: "a".repeat(64), kind: "file" },
    { path: "/Projects/Client/Assets", issuedAt: 123, signature: "b".repeat(64), kind: "folder", readError: "Assets cannot be read" },
  ]);
  setDraft(key, { value: "", images: [], attachments });
  const html = renderChatInput({ draftKey: key });

  assert.match(html, /aria-label="Local attachments"/);
  assert.match(html, /notes\.txt[\s\S]*File[\s\S]*…\/Projects\/Client[\s\S]*Ready/);
  assert.match(html, /Assets[\s\S]*Folder[\s\S]*Assets cannot be read/);
  assert.match(html, /aria-label="Remove notes\.txt"/);
  assert.match(html, /aria-label="Remove Assets"/);
  assert.doesNotMatch(html, /@&quot;\/Projects/);
  clearDraft(key);
});

test("preserves duplicate image attachments when restoring a submission", () => {
  const image = { data: "AQID", mimeType: "image/png" };
  const restored = mergeRestoredSubmissionDraft("", [image, image], "", [image]);

  assert.deepEqual(restored.images, [image, image, image]);
});

test("moves a provisional new-session draft to the real session key", () => {
  const provisionalKey = "new:/tmp/rekey-test";
  const sessionKey = "session-rekey-test";
  clearDraft(provisionalKey);
  clearDraft(sessionKey);
  setDraft(provisionalKey, { value: "queued while preflight ran", images: [] });

  assert.deepEqual(rekeyDraft(provisionalKey, sessionKey), {
    value: "queued while preflight ran",
    images: [],
  });
  assert.equal(getDraft(provisionalKey), null);
  assert.deepEqual(getDraft(sessionKey), {
    value: "queued while preflight ran",
    images: [],
  });

  clearDraft(sessionKey);
});

test("rekey keeps a synchronously restored draft when React state is still empty", () => {
  const provisionalKey = "new:/tmp/rekey-race";
  const sessionKey = "session-rekey-race";
  clearDraft(provisionalKey);
  clearDraft(sessionKey);
  setDraft(provisionalKey, { value: "restored before state flush", images: [] });

  assert.deepEqual(
    rekeyDraft(provisionalKey, sessionKey, { value: "", images: [] }),
    { value: "restored before state flush", images: [] },
  );
  assert.equal(getDraft(provisionalKey), null);
  assert.deepEqual(getDraft(sessionKey), {
    value: "restored before state flush",
    images: [],
  });

  clearDraft(sessionKey);
});

test("renders compact errors above the input as a wrapping alert", async () => {
  const error = "Compaction failed: OpenAI API error (403): <html>request forbidden</html>";
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        onCompact() {},
        isStreaming: false,
        compactError: error,
      }),
    ),
  );
  const css = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");

  assert.match(html, /role="alert"/);
  assert.match(html, /Compaction failed: OpenAI API error/);
  assert.match(html, /&lt;html&gt;request forbidden&lt;\/html&gt;/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.ok(html.indexOf('role="alert"') < html.indexOf("data-composer-editor"));
});

test("shows context occupancy and warning state", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
        contextUsage: { tokens: 100_000, contextWindow: 128_000, percent: 78 },
      }),
    ),
  );

  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-label="Context donut: 78%"/);
  assert.doesNotMatch(html, /title="Context: /);
  assert.match(html, /data-context-level="warning"/);
  // The donut arc shows the used share. The tooltip carries the numbers.
  assert.match(html, /stroke-dashoffset="22"/);
  assert.match(html, /78% used \(22% left\)/);
  assert.match(html, /100k \/ 128k tokens used/);
  assert.match(html, /Context window is getting full/);
});
test("hides the Context donut until the first reply reports usage", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(ChatInput, {
        onSend() {},
        onAbort() {},
        isStreaming: false,
      }),
    ),
  );

  // No context has been used before the first message, so there is nothing to show.
  assert.doesNotMatch(html, /aria-label="Context donut/);
  assert.doesNotMatch(html, /contextRing/);
  assert.match(html, /aria-label="Model settings"|aria-label="Send"/);
});

test("dispatches text and image payloads before clearing the idle composer", async () => {
  const calls = [];
  const image = { data: "AQID", mimeType: "image/png", previewUrl: "blob:image" };

  const result = await dispatchIdleSubmission({
    value: "  inspect this  ",
    images: [image],
    isStreaming: false,
    onAudioUnlock: () => calls.push("unlock"),
    clearInput: () => calls.push("clear"),
    onSend: (message, images) => calls.push([message, images]),
  });

  assert.equal(result, "sent");
  assert.deepEqual(calls, ["unlock", "clear", ["inspect this", [image]]]);
});

test("sends signed local selections as structured data and keeps unreadable rows in the Composer", async () => {
  const { addComposerAttachments } = await attachmentState();
  const [attachment] = addComposerAttachments([], [
    { path: "/Projects/O'Brien/notes.txt", issuedAt: 123, signature: "a".repeat(64), kind: "file" },
  ]);
  const calls = [];
  assert.equal(await dispatchIdleSubmission({
    value: "",
    images: [],
    attachments: [attachment],
    isStreaming: false,
    clearInput: () => calls.push("clear"),
    onSend: (message, images, attachments) => calls.push([message, images, attachments]),
  }), "sent");
  assert.deepEqual(calls, ["clear", ["", undefined, [attachment]]]);

  calls.length = 0;
  assert.equal(await dispatchIdleSubmission({
    value: "Check this",
    images: [],
    attachments: [{ ...attachment, readError: "notes.txt cannot be read" }],
    isStreaming: false,
    clearInput: () => calls.push("clear"),
    onAttachmentBlocked: (error) => calls.push(error),
    onSend: () => calls.push("send"),
  }), "attachment-blocked");
  assert.deepEqual(calls, ["notes.txt cannot be read"]);
});

test("sending a browser upload preserves its draft bytes until OMP claims the upload", async () => {
  const { addBrowserUpload } = await attachmentState();
  const sessionId = "b7b00000-0000-4000-8000-000000000001";
  const upload = { id: `up_${"c".repeat(32)}`, name: "notes.txt", size: 5, mediaType: "text/plain", state: "ready" };
  const attachments = addBrowserUpload([], sessionId, upload);
  const calls = [];
  assert.equal(await dispatchIdleSubmission({
    value: "Read this",
    images: [],
    attachments,
    isStreaming: false,
    clearInput: preserveUploads => calls.push(["clear", preserveUploads]),
    onSend: (message, images, selected) => calls.push(["send", message, images, selected]),
  }), "sent");
  assert.deepEqual(calls, [["clear", true], ["send", "Read this", undefined, attachments]]);
});

test("sends local attachments with steer and follow-up messages", async () => {
  const { addComposerAttachments } = await attachmentState();
  const [attachment] = addComposerAttachments([], [
    { path: "/Projects/notes.txt", issuedAt: 123, signature: "a".repeat(64), kind: "file" },
  ]);
  for (const mode of ["steer", "followUp"]) {
    const calls = [];
    assert.equal(dispatchStreamingSubmission({
      value: "Review this",
      images: [],
      attachments: [attachment],
      mode,
      clearInput: () => calls.push("clear"),
      onAttachmentBlocked: () => calls.push("blocked"),
      onSteer: (text, images, attachments) => calls.push(["steer", text, images, attachments]),
      onFollowUp: (text, images, attachments) => calls.push(["followUp", text, images, attachments]),
    }), mode === "steer" ? "steered" : "followed-up");
    assert.deepEqual(calls, ["clear", [mode, "Review this", undefined, [attachment]]]);
  }
});

test("recovers signed selections after an OMP prompt rejection", async () => {
  const { addComposerAttachments, markComposerAttachmentError, selectedAttachmentPaths } = await attachmentState();
  const { getRejectedPromptRecovery } = await jiti.import("../hooks/useAgentSession.ts");
  const [attachment] = addComposerAttachments([], [
    { path: "/Projects/O'Brien/notes.txt", issuedAt: 123, signature: "a".repeat(64), kind: "file" },
  ]);
  const recovery = getRejectedPromptRecovery("Check this", undefined, undefined, "session-1", true, [attachment]);

  assert.deepEqual(selectedAttachmentPaths(recovery.attachments), [attachment.selection]);
  assert.equal(recovery.targetDraftKey, "session-1");
  assert.equal(markComposerAttachmentError(recovery.attachments, "Attachment is inaccessible")[0].readError, "Attachment is inaccessible");
});

test("handles built-in commands without dispatching an empty prompt", async () => {
  const calls = [];
  const result = await dispatchIdleSubmission({
    value: "/compact",
    images: [],
    isStreaming: false,
    onBuiltinCommand: async () => ({ handled: true, prompt: "continue" }),
    clearInput: () => calls.push("clear"),
    onSend: (message) => calls.push(message),
  });

  assert.equal(result, "command");
  assert.deepEqual(calls, ["clear", "continue"]);
});

test("dispatches steer and follow-up streaming modes", () => {
  const calls = [];
  const common = {
    value: "next instruction",
    images: [],
    clearInput: () => calls.push("clear"),
    onSteer: (message) => calls.push(["steer", message]),
    onFollowUp: (message) => calls.push(["followUp", message]),
  };

  assert.equal(dispatchStreamingSubmission({ ...common, mode: "steer" }), "steered");
  assert.equal(dispatchStreamingSubmission({ ...common, mode: "followUp" }), "followed-up");
  assert.deepEqual(calls, [
    "clear",
    ["steer", "next instruction"],
    "clear",
    ["followUp", "next instruction"],
  ]);
});

test("queues image attachments while the agent is running", () => {
  const calls = [];
  const image = { data: "AQID", mimeType: "image/png", previewUrl: "blob:queue-image" };

  assert.equal(dispatchStreamingSubmission({
    value: "Inspect this",
    images: [image],
    mode: "followUp",
    clearInput: () => calls.push("clear"),
    onFollowUp: (message, images) => calls.push([message, images]),
  }), "followed-up");
  assert.deepEqual(calls, ["clear", ["Inspect this", [image]]]);
});

test("provides queued message labels in both message catalogs", () => {
  for (const catalog of [englishMessages, chineseMessages]) {
    for (const key of ["queuePaused", "queueResume", "queueSteerAria", "queueDelete", "queueActions", "queueEdit", "queueOff", "queueOn", "queueReorder", "queueMessage", "steerMessage", "queueDeleted", "undo", "pausedQueueSubmitTitle", "pausedQueueSubmitDescription", "pausedQueueSubmitDescriptionOne", "pausedQueueSubmitClear", "pausedQueueSubmitSend"]) {
      assert.match(catalog, new RegExp(`"chat\\.${key}":\\s*"[^"]+"`));
    }
  }
});

test("uses queue mode by default and the opposite mode for the Codex shortcut", () => {
  assert.equal(resolveStreamingSubmissionMode(true, false), "followUp");
  assert.equal(resolveStreamingSubmissionMode(true, true), "steer");
  assert.equal(resolveStreamingSubmissionMode(false, false), "steer");
  assert.equal(resolveStreamingSubmissionMode(false, true), "followUp");
});

test("asks before an idle submission when queued messages remain paused", () => {
  const paused = {
    paused: true,
    items: [{ id: "one", kind: "followUp", text: "First", imageCount: 0 }],
  };

  assert.equal(shouldConfirmPausedQueueSubmission(paused, false), true);
  assert.equal(shouldConfirmPausedQueueSubmission(paused, true), false);
  assert.equal(shouldConfirmPausedQueueSubmission({ ...paused, paused: false }, false), false);
  assert.equal(shouldConfirmPausedQueueSubmission({ items: [], paused: true }, false), false);
});

test("resolves the paused queue before sending the new message", async () => {
  const calls = [];

  await dispatchPausedQueueSubmission({
    clearQueue: false,
    onResolve: async (clearQueue) => calls.push(["resolve", clearQueue]),
    onSend: async () => calls.push(["send"]),
  });
  assert.deepEqual(calls, [["resolve", false], ["send"]]);

  await assert.rejects(dispatchPausedQueueSubmission({
    clearQueue: true,
    onResolve: async () => { throw new Error("failed"); },
    onSend: async () => calls.push(["unexpected-send"]),
  }));
  assert.doesNotMatch(JSON.stringify(calls), /unexpected-send/);
});

test("preserves multiline and IME input behavior", () => {
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: false, recentlyComposed: false }), true);
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: true, isComposing: false, recentlyComposed: false }), false);
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: true, recentlyComposed: false }), false);
  assert.equal(shouldSubmitComposer({ key: "Enter", shiftKey: false, isComposing: false, recentlyComposed: true }), false);
});

test("uses OMP's Shift+Tab effort shortcut only when the Composer can cycle", () => {
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: true, isComposing: false, menuOpen: false, canCycle: true }), true);
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: false, isComposing: false, menuOpen: false, canCycle: true }), false);
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: true, isComposing: true, menuOpen: false, canCycle: true }), false);
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: true, isComposing: false, menuOpen: true, canCycle: true }), false);
  assert.equal(shouldCycleComposerEffort({ key: "Tab", shiftKey: true, isComposing: false, menuOpen: false, canCycle: false }), false);
});

test("measures composer height and limits accepted image files", () => {
  assert.equal(getComposerTextareaHeight(24), "24px");
  assert.equal(getComposerTextareaHeight(260), "260px");
  assert.equal(getComposerTextareaHeight(600), "600px");

  const files = [
    { name: "one.png", type: "image/png", size: 100 },
    { name: "notes.txt", type: "text/plain", size: 100 },
    { name: "large.jpg", type: "image/jpeg", size: 100_000_000 },
    ...Array.from({ length: 6 }, (_, index) => ({
      name: `${index}.webp`,
      type: "image/webp",
      size: 100,
    })),
  ];

  assert.deepEqual(
    getAcceptedImageFiles(files, 1, 0).map((file) => file.name),
    ["one.png", "0.webp", "1.webp", "2.webp"],
  );
});

test("aborts only from an unobstructed streaming composer", () => {
  assert.equal(shouldAbortComposer({ key: "Escape", isComposing: false, isStreaming: true, menuOpen: false }), true);
  assert.equal(shouldAbortComposer({ key: "Escape", isComposing: true, isStreaming: true, menuOpen: false }), false);
  assert.equal(shouldAbortComposer({ key: "Escape", isComposing: false, isStreaming: true, menuOpen: true }), false);
  assert.equal(shouldAbortComposer({ key: "Escape", isComposing: false, isStreaming: false, menuOpen: false }), false);
});

test("renders the complete semantic composer contract", async () => {
  const html = renderChatInput({
    onCompact() {},
    onThinkingLevelChange() {},
    onToolPresetChange() {},
  });
  const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");
  const approvalCss = await readFile(new URL("./chat/approval-mode-selector.module.css", import.meta.url), "utf8");
  const editorCss = await readFile(new URL("./chat/composer-editor.module.css", import.meta.url), "utf8");
  const tokensCss = await readFile(new URL("../app/tokens.css", import.meta.url), "utf8");

  assert.match(html, /<form[^>]+aria-label="Message composer"/);
  assert.match(html, /data-composer-editor="true"/);
  assert.match(html, /type="submit"/);
  assert.doesNotMatch(source, /\bstyle\s*=/);
  assert.doesNotMatch(source, /React\.CSSProperties/);
  assert.match(css, /max-width:\s*var\(--composer-max-width\)/);
  assert.match(tokensCss, /--composer-max-width:\s*810px;/);
  // The 15px scrollbar gutter affects narrow panes only.
  assert.match(tokensCss, /\/\* The transcript scrollbar gutter is 15px\.[^*]*\*\/\s*--thread-content-inset:\s*15px;/);
  assert.match(tokensCss, /--thread-content-max-width:\s*var\(--composer-max-width\);/);
  // Codex: the editor wrapper carries mb-1, a 4px gap between the text and the footer row.
  assert.match(tokensCss, /--composer-editor-gap:\s*var\(--space-1\);/);
  assert.match(editorCss, /\.host\s*\{[^}]*margin-bottom:\s*var\(--composer-editor-gap\);/);
  assert.match(css, /min-height:\s*var\(--composer-frame-min-height\)/);
  assert.match(css, /border-radius:\s*var\(--radius-composer\)/);
  assert.match(css, /box-shadow:\s*var\(--shadow-composer\)/);
  assert.match(css, /font-family:\s*var\(--font-sans\)/);
  assert.match(css, /\.composerContent\s*\{[^}]*padding:\s*14px 12px 0;/);
  assert.match(css, /\.textareaGeometry\s*\{[^}]*transform:\s*translateY\(var\(--composer-text-nudge\)\);/);
  assert.match(tokensCss, /--composer-text-nudge:\s*2px;/);
  assert.match(editorCss, /\.editor\s*\{[^}]*min-height:\s*44px;[^}]*max-height:\s*var\(--composer-max-height\);[^}]*font-size:\s*var\(--text-ui\);[^}]*line-height:\s*20px;[^}]*padding:\s*15px 18px 16px;/);
  assert.match(tokensCss, /--composer-max-height:\s*25dvh;/);
  assert.match(tokensCss, /--leading-ui:\s*20px;/);
  // Codex Electron: --text-base is 14px at the theme root. Only the browser window raises it to 1rem.
  assert.match(tokensCss, /--text-ui:\s*14px;/);
  // The model chip uses the compact reference height and padding.
  assert.match(css, /\.attachmentControl\s*\{[^}]*width:\s*var\(--composer-control-size\);[^}]*height:\s*var\(--composer-control-size\);/);
  assert.match(css, /\.contextDonut\s*\{[^}]*width:\s*var\(--composer-control-size\);[^}]*height:\s*var\(--composer-control-size\);/);
  assert.match(css, /\.menuTrigger\s*\{[^}]*min-height:\s*36px;[^}]*padding:\s*var\(--space-1\) var\(--space-2\);[^}]*border-radius:\s*var\(--radius-round\);[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*18px;/);
  assert.match(approvalCss, /\.trigger\s*\{[^}]*height:\s*var\(--composer-control-size\);/);
  assert.match(tokensCss, /--composer-control-size:\s*28px;/);
  assert.match(tokensCss, /--composer-send-size:\s*var\(--composer-control-size\);/);
  assert.match(editorCss, /\.editor\[data-empty="true"\]::before\s*\{[^}]*color:\s*var\(--ui-text-dim\);[^}]*opacity:\s*0\.5;/);
  assert.match(css, /\.toolbar\s*\{[^}]*display:\s*flex;[^}]*column-gap:\s*5px;[^}]*padding-inline:\s*var\(--composer-footer-inset\);/);
  // Codex: the footer centre sits 22px above the frame bottom. 8px inset plus half the 28px send circle.
  assert.match(css, /\.toolbar\s*\{[^}]*min-height:\s*var\(--composer-send-size\);[^}]*margin-top:\s*auto;[^}]*margin-bottom:\s*var\(--composer-footer-inset\);/);
  assert.match(css, /\.attachmentControl\s*\{[^}]*width:\s*var\(--composer-control-size\);[^}]*height:\s*var\(--composer-control-size\);[^}]*background:\s*transparent;/);
  assert.match(approvalCss, /\.trigger\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*var\(--ui-warning\);[^}]*font:[^;]+;[^}]*font-size:\s*var\(--text-base\);/);
  assert.match(css, /\.menuTrigger\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font-size:\s*var\(--text-base\);/);
  assert.match(css, /\.modelName\s*\{[^}]*color:\s*var\(--ui-text\);/);
  assert.match(css, /\.reasoningLevel\s*\{[^}]*color:\s*var\(--ui-text-dim\);/);
  // Andrew's rule: the effort shows with a capital first letter.
  assert.match(css, /\.reasoningLevel\s*\{[^}]*text-transform:\s*capitalize;/);
  assert.match(css, /\.sendAction,\s*\.stopControl\s*\{[^}]*width:\s*var\(--composer-send-size\);[^}]*height:\s*var\(--composer-send-size\);[^}]*padding:\s*2px;[^}]*border-radius:\s*var\(--radius-round\);[^}]*background:\s*var\(--ui-composer-primary\);[^}]*color:\s*var\(--ui-composer-primary-foreground\);/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-width:\s*var\(--ui-control-touch\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.contextDonut\s*\{[^}]*height:\s*var\(--composer-control-size\);/);
  // The flex footer keeps the start group before the model area, then the trailing controls at the end.
  assert.match(html, /class="toolbarLeft"[^>]*>[\s\S]*class="toolbarRight"[^>]*>[\s\S]*class="toolbarModelArea"[^>]*>[\s\S]*class="toolbarTrailing"/);
  assert.match(css, /\.toolbarModelArea\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0;/);
  assert.match(css, /\.toolbarTrailing\s*\{[^}]*flex-shrink:\s*0;/);
  assert.match(css, /\.toolbar\[data-footer-mode="session"\]\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.toolbar\[data-footer-mode="home"\]\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;/);
  assert.match(css, /\.toolbar\[data-footer-mode="home"\]::-webkit-scrollbar\s*\{[^}]*display:\s*none;/);
  // Codex context donut: 12px, 2px stroke, track at 0.16 opacity, arc rotated -90deg, 120ms ease-out.
  assert.match(css, /\.contextRingTrack\s*\{[^}]*opacity:\s*0\.16;/);
  assert.match(css, /\.contextRingArc\s*\{[^}]*transition:\s*stroke-dashoffset 120ms ease-out, opacity 120ms ease-out;/);
  assert.match(css, /\.contextTooltip\s*\{[^}]*width:\s*152px;[^}]*text-align:\s*center;/);
});

test("the context control is a Codex donut with a hover tooltip and a click menu", () => {
  const html = renderChatInput({ contextUsage: { tokens: 49000, contextWindow: 1000000, percent: 5 } });
  const control = buttonFor(html, "Context donut: 5%");
  assert.match(control, /aria-haspopup="menu"/);
  assert.match(control, /<svg[^>]+width="12"[^>]+height="12"[^>]+viewBox="0 0 12 12"/);
  assert.match(control, /<circle[^>]+r="5"[^>]+stroke-width="2"[^>]+class="contextRingTrack"/);
  assert.match(control, /<circle[^>]+stroke-linecap="round"[^>]+pathLength="100"[^>]+stroke-dasharray="100"[^>]+stroke-dashoffset="95"[^>]+class="contextRingArc"[^>]+transform="rotate\(-90 6 6\)"/);
  assert.doesNotMatch(control, /title=/);
  assert.match(html, /role="tooltip"[^>]*>[\s\S]*?Context window:[\s\S]*?5% used \(95% left\)[\s\S]*?49k \/ 1000k tokens used/);
});

test("uses one submit control and explicit button types for every other composer button", async () => {
  const sources = await Promise.all([
    ["ChatInput.tsx", new URL("./ChatInput.tsx", import.meta.url)],
    ["chat/ComposerFrame.tsx", new URL("./chat/ComposerFrame.tsx", import.meta.url)],
  ].map(async ([path, url]) => ({ path, source: await readFile(url, "utf8") })));
  const buttons = sources.flatMap(({ path, source }) => nativeButtonTypes(source, path));
  const submitButtons = buttons.filter((button) => button.type === "submit");

  assert.equal(submitButtons.length, 1, "the composer must expose exactly one submit control");
  for (const button of buttons) {
    if (button.type === "submit") continue;
    assert.equal(
      button.type,
      "button",
      `${button.path}:${button.line} must use type=\"button\"`,
    );
  }
});

test("composer model menu follows verified Codex geometry contracts", async () => {
  const menuCss = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");
  const powerCss = await readFile(new URL("./chat/ModelPowerSlider.module.css", import.meta.url), "utf8");
  const listCss = await readFile(new URL("./chat/ModelList.module.css", import.meta.url), "utf8");

  assert.match(powerCss, /\.view\s*\{[^}]*min-height:\s*104px;[^}]*padding-block:\s*8px;/);
  assert.match(powerCss, /\.modelToggle\s*\{[^}]*min-height:\s*28px;[^}]*padding:\s*0 48px;[^}]*border-radius:\s*8px;/);
  assert.match(powerCss, /\.effortModelName\s*\{[^}]*color:\s*var\(--ui-text-dim\);[^}]*font-size:\s*var\(--text-sm\);[^}]*font-weight:\s*var\(--font-weight-regular\);/);

  assert.match(menuCss, /\.modelSubmenuModel\s*\{[^}]*bottom:\s*0;/);
  assert.match(listCss, /\.list\s*\{[^}]*max-height:\s*min\(316px, calc\(var\(--ui-scroll-offset, 316px\) - 12px\)\);/);
  assert.match(listCss, /\.scroller\s*\{[^}]*overflow-y:\s*auto;/);
  assert.match(listCss, /\.label\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/);
});

test("the Composer exposes a stable image input for the Summary panel", async () => {
  const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
  assert.match(source, /COMPOSER_IMAGE_INPUT_ID = "reeve-composer-image-input"/);
  assert.match(source, /imageInputId = COMPOSER_IMAGE_INPUT_ID/);
  assert.match(source, /fileInputId=\{imageInputId\}/);
  const html = renderChatInput({ imageInputId: "quick-chat-images" });
  assert.match(html, /id="quick-chat-images"/);
  assert.doesNotMatch(html, /id="reeve-composer-image-input"/);
});

test("the session Composer keeps workspace controls out of the footer", () => {
  const html = renderChatInput({ cwd: "/repo", onSelectWorktree() {} });
  assert.doesNotMatch(html, /aria-label="Switch branch"/);
  assert.doesNotMatch(html, /Loading branch/);
  assert.doesNotMatch(html, /Session worktree/);
});

test("the Composer keeps unavailable dictation quiet at rest", async (t) => {
  const harness = await import("../test/dom-harness.mjs");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/speech")) return { ok: true, json: async () => ({ enabled: false }) };
    if (path.includes("/speech?events")) return { ok: false, status: 404 };
    if (path.startsWith("/api/skills?")) return { ok: true, json: async () => ({ skills: [] }) };
    if (path.startsWith("/api/plugins?")) return { ok: true, json: async () => ({ packages: [] }) };
    throw new Error(`Unexpected fetch: ${path}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const view = await harness.mount(React.createElement(I18nProvider, null, React.createElement(ChatInput, {
    onSend() {},
    onAbort() {},
    isStreaming: false,
    cwd: "/repo",
    onEnsureSession: async () => "session-570",
  })));
  try {
    await harness.settle();
    assert.equal(view.container.querySelector("[role='alert']"), null);
    assert.doesNotMatch(view.container.textContent, /Dictation is not available/);
    assert.equal(view.container.querySelector("[aria-label='Dictate']"), null);
  } finally {
    await view.unmount();
  }
});

test("workspace changes confirm only when the Composer has unsent input", () => {
  assert.equal(hasUnsentComposerInput("", 0, 0), false);
  assert.equal(hasUnsentComposerInput("draft", 0, 0), true);
  assert.equal(hasUnsentComposerInput("   ", 1, 0), true);
  assert.equal(hasUnsentComposerInput("   ", 0, 1), true);
});

test("the home Composer confirms a project change with a draft", async (t) => {
  const harness = await import("../test/dom-harness.mjs");
  const previousFetch = globalThis.fetch;
  const draftKey = "t561-project-confirmation";
  let selected;
  setDraft(draftKey, { value: "keep this draft", images: [] });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("/api/sessions?")) {
      return { ok: true, status: 200, json: async () => ({
        sessions: [
          { cwd: "/repo", projectRoot: "/repo", branch: "main" },
          { cwd: "/feature", projectRoot: "/feature", branch: "feature" },
        ],
      }) };
    }
    if (String(url) === "/api/cwd/validate" && options?.method === "POST") {
      return { ok: true, status: 200, json: async () => ({ cwd: "/feature" }) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    clearDraft(draftKey);
  });

  const view = await harness.mount(React.createElement(I18nProvider, null, React.createElement(ChatInput, {
    onSend() {},
    onAbort() {},
    isStreaming: false,
    cwd: "/repo",
    draftKey,
    footerMode: "home",
    onSelectProject(path) { selected = path; },
  })));
  await harness.settle();
  await harness.click(view.container.querySelector('[aria-label="Select project"]'));
  await harness.settle();
  const item = Array.from(view.container.querySelectorAll("[role='menuitemradio']"))
    .find((candidate) => harness.textOf(candidate) === "Feature");
  assert.ok(item);
  await harness.click(item);

  const dialog = document.querySelector("[role='dialog']");
  assert.ok(dialog);
  assert.match(harness.textOf(dialog), /Replace this new session\?/);
  assert.equal(selected, undefined);
  await harness.click(Array.from(dialog.querySelectorAll("button")).find((button) => harness.textOf(button) === "Cancel"));
  await harness.settle();
  assert.equal(selected, undefined);
  assert.equal(getDraft(draftKey)?.value, "keep this draft");
  await view.unmount();
});

test("an effort change measures and animates the chip while reduced motion changes it at once", async () => {
  const harness = await import("../test/dom-harness.mjs");
  const prototype = Object.getPrototypeOf(harness.domDocument.createElement("span"));
  const originalRect = prototype.getBoundingClientRect;
  const originalAnimate = prototype.animate;
  const animations = [];
  let view;

  prototype.getBoundingClientRect = function () {
    return { width: this.textContent === "Medium" ? 52 : this.textContent === "Max" ? 27 : 100, top: 0, left: 0, height: 18 };
  };
  prototype.animate = function (keyframes, options) {
    const record = { element: this, keyframes, options, finish: null, cancelled: false };
    animations.push(record);
    return {
      addEventListener(type, handler) { if (type === "finish") record.finish = handler; },
      removeEventListener() {},
      cancel() { record.cancelled = true; },
    };
  };

  const props = {
    onSend() {}, onAbort() {}, onModelChange() {}, isStreaming: false,
    model: { provider: "openai", modelId: "gpt-5.4" },
    modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
    availableThinkingLevels: ["medium", "max"],
  };
  const render = (level) => React.createElement(I18nProvider, null, React.createElement(ChatInput, { ...props, thinkingLevel: level }));

  try {
    harness.setReducedMotion(false);
    view = await harness.mount(render("medium"));
    await view.render(render("max"));
    const width = animations.find(({ element }) => element.classList.contains("reasoningLevel"));
    assert.ok(width, "the effort label width animates");
    assert.deepEqual(width.keyframes, [{ width: "52px" }, { width: "27px" }]);
    assert.match(width.options.easing, /^linear\(/);
    assert.ok(animations.some(({ keyframes }) => keyframes.some((frame) => frame.filter === "blur(4px)")));

    await React.act(async () => { width.finish(); });
    assert.equal(view.container.querySelector(".reasoningOld"), null);

    const count = animations.length;
    harness.setReducedMotion(true);
    await view.render(render("medium"));
    assert.equal(animations.length, count);
    assert.equal(view.container.querySelector(".reasoningOld"), null);
  } finally {
    if (view) await view.unmount();
    harness.setReducedMotion(false);
    if (originalRect) prototype.getBoundingClientRect = originalRect;
    else delete prototype.getBoundingClientRect;
    if (originalAnimate) prototype.animate = originalAnimate;
    else delete prototype.animate;
  }
});
