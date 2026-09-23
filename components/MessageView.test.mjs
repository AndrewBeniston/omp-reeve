import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { click, DomEvent, mount } from "../test/dom-harness.mjs";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  MessageView,
  STREAMING_METRIC_FPS,
  StreamingMetrics,
  buildMetricDigitSequence,
  formatStreamingRate,
  formatStreamingTokens,
  smoothStreamingRate,
} = await jiti.import("./MessageView.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const { UserMessageAttachmentRows } = await jiti.import("./chat/UserMessageAttachmentRows.tsx");
const { buildSessionContext } = await jiti.import("../lib/session-reader.ts");
const { buildTranscriptRows } = await jiti.import("./chat/transcript-rows.ts");

function renderMessage(message, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, { message, ...props }),
    ),
  );
}

test("renders saved file, folder, uploaded-file, and unavailable attachment rows", () => {
  const html = renderMessage({
    role: "user",
    content: "Check these",
    attachments: [
      { name: "main.ts", kind: "file", available: true, openPath: "src/main.ts" },
      { name: "docs", kind: "folder", available: true, openPath: "docs" },
      { name: "notes.txt", kind: "file", available: true, uploaded: true, content: "saved notes" },
      { name: "external.txt", kind: "file", available: false, uploaded: false },
    ],
  });

  assert.match(html, /main\.ts/);
  assert.match(html, /docs/);
  assert.match(html, /notes\.txt/);
  assert.match(html, /external\.txt \(unavailable\)/);
  assert.match(html, /File/);
  assert.match(html, /Folder/);
  assert.match(html, /Show source/);
  assert.doesNotMatch(html, /saved notes/);
  assert.doesNotMatch(html, /src\/main\.ts/);
});

test("attaches saved file mentions to the following user message", () => {
  const loaded = buildSessionContext([
    { type: "message", id: "file-1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "fileMention", files: [
      { path: "src/main.ts", content: "export {};" },
      { path: "docs/", content: "guide.md", kind: "folder" },
      { path: "browser-upload:up_123/notes.txt", content: "saved notes" },
    ] } },
    { type: "message", id: "user-1", parentId: "file-1", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "Check these" } },
  ]);

  assert.equal(loaded.messages.length, 1);
  assert.deepEqual(loaded.messages[0].attachments, [
    { name: "main.ts", kind: "file", available: true, uploaded: false, openPath: "src/main.ts" },
    { name: "docs", kind: "folder", available: true, uploaded: false, openPath: "docs/" },
    { name: "notes.txt", kind: "file", available: true, uploaded: true, content: "saved notes" },
  ]);
});

test("preserves pasted-text attachment descriptors when the session reloads", () => {
  const loaded = buildSessionContext([
    { type: "message", id: "paste-1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "fileMention", files: [
      { path: "browser-upload:up_123/Pasted text.txt", content: "Uploaded file: Pasted text.txt\nfirst" },
      { path: "browser-upload:up_456/Pasted text.txt", content: "Uploaded file: Pasted text.txt\nsecond" },
    ] } },
    { type: "message", id: "user-1", parentId: "paste-1", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "Review" } },
  ]);

  assert.deepEqual(loaded.messages[0].attachments, [
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "Uploaded file: Pasted text.txt\nfirst" },
    { name: "Pasted text.txt", kind: "file", available: true, uploaded: true, content: "Uploaded file: Pasted text.txt\nsecond" },
  ]);
  assert.match(renderMessage(loaded.messages[0]), /Pasted text\.txt \(\+1 more pasted text attachment\)/);
  assert.doesNotMatch(renderMessage(loaded.messages[0]), /Uploaded file/);
});

test("opens a ready attachment and reveals saved uploaded content", async () => {
  const opened = [];
  const view = await mount(React.createElement(I18nProvider, null, React.createElement(UserMessageAttachmentRows, {
    attachments: [
      { name: "main.ts", kind: "file", available: true, uploaded: false, openPath: "src/main.ts" },
      { name: "notes.txt", kind: "file", available: true, uploaded: true, content: "saved notes" },
    ],
    onOpenFile: (path) => opened.push(path),
  })));
  try {
    await click(view.container.querySelector("button"));
    assert.deepEqual(opened, ["src/main.ts"]);
    const sourceButton = view.container.querySelectorAll("button")[1];
    await click(sourceButton);
    assert.match(view.container.textContent, /saved notes/);
    assert.doesNotMatch(view.container.textContent, /src\/main\.ts/);
  } finally {
    await view.unmount();
  }
});

test("renders one persisted live-delegation origin row with safe fallbacks", () => {
  const entries = [
    {
      type: "message",
      id: "user-1",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: "Start" },
    },
    {
      type: "custom_message",
      id: "origin-1",
      parentId: "user-1",
      timestamp: "2026-01-01T00:00:01.000Z",
      customType: "live-delegation",
      content: "",
      display: true,
      details: { appName: "Nexus" },
    },
  ];
  const loaded = buildSessionContext(entries);
  const reconnected = buildSessionContext(entries);
  const flattenRows = (messages, entryIds) => buildTranscriptRows(messages, entryIds, null, false)
    .flatMap((row) => row.kind === "turn" || row.kind === "compaction" ? row.items : [row.item])
    .filter((item) => item.message.role === "custom" && item.message.customType === "live-delegation");

  const reloadedRows = flattenRows(loaded.messages, loaded.entryIds);
  const reconnectedRows = flattenRows(reconnected.messages, reconnected.entryIds);
  assert.equal(reloadedRows.length, 1);
  assert.equal(reconnectedRows.length, 1);
  assert.match(renderMessage(reloadedRows[0].message), /Sent by Nexus from another task/);

  const unsafeHtml = renderMessage({
    role: "custom",
    customType: "live-delegation",
    content: "",
    display: true,
    details: { appName: '<img src=x onerror="alert(1)">' },
  });
  assert.match(unsafeHtml, /Sent by &lt;img/);
  assert.doesNotMatch(unsafeHtml, /<img/);

  const missingDetails = renderMessage({
    role: "custom",
    customType: "live-delegation",
    content: "",
    display: true,
  });
  assert.match(missingDetails, /Sent by another app from another task/);
});

test("keeps unknown custom messages in the generic message card", () => {
  const html = renderMessage({
    role: "custom",
    customType: "extension_debug",
    content: "Keep this extension message",
    display: true,
  });

  assert.match(html, /extension_debug/);
  assert.match(html, /Keep this extension message/);
  assert.doesNotMatch(html, /Sent by/);
});

test("streaming metrics use clear compact labels", () => {
  assert.equal(STREAMING_METRIC_FPS, 1);
  assert.equal(formatStreamingTokens(101.4), "101 tokens");
  assert.equal(formatStreamingRate(17.6), "18tps");
  assert.equal(formatStreamingRate(125.2), "125tps");

  const html = renderToStaticMarkup(
    React.createElement(StreamingMetrics, {
      estimatedTokens: 101,
      tokensPerSecond: 17.6,
      title: "Estimated output tokens",
    }),
  );
  assert.doesNotMatch(html, /101 tokens generated/);
  assert.match(html, /aria-label="18tps generation speed"/);
  assert.match(html, /data-metric-unit="tps"/);
  assert.match(html, /data-metric-number="18"/);
  assert.match(html, /data-visible-digits="2"/);
  assert.equal((html.match(/data-metric-digit=/g) ?? []).length, 3);

  const maximumHtml = renderToStaticMarkup(
    React.createElement(StreamingMetrics, {
      estimatedTokens: 999,
      tokensPerSecond: 999,
      title: "Estimated output tokens",
    }),
  );
  assert.match(maximumHtml, /aria-label="999tps generation speed"/);

  const detailedHtml = renderToStaticMarkup(
    React.createElement(StreamingMetrics, {
      estimatedTokens: 101,
      tokensPerSecond: 18,
      title: "Estimated output tokens",
      showTokenCount: true,
    }),
  );
  assert.match(detailedHtml, /aria-label="101 tokens generated"/);
});

test("streaming rate smoothing moves toward each sample without jumping", () => {
  assert.equal(smoothStreamingRate(null, 100), 100);
  const next = smoothStreamingRate(100, 40);
  assert.ok(next < 100);
  assert.ok(next > 40);
});

test("ticker digit sequences follow the direction of the complete value", () => {
  assert.deepEqual(buildMetricDigitSequence("9", "7", false), ["9", "8", "7"]);
  assert.deepEqual(buildMetricDigitSequence("7", "9", true), ["7", "8", "9"]);
  assert.deepEqual(buildMetricDigitSequence("9", "0", true), ["9", "0"]);
});

test("streaming metric boxes keep fixed widths and reduced-motion support", async () => {
  const css = await readFile(new URL("./chat/message-view.module.css", import.meta.url), "utf8");

  assert.match(css, /\.streamingStats\s*\{[^}]*grid-template-columns:\s*7ch;/s);
  assert.match(css, /\.streamingStats\[data-show-tokens="true"\]\s*\{[^}]*grid-template-columns:\s*10ch 7ch;/s);
  assert.match(css, /\.tokenCount\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
  assert.match(css, /\.speedBadge\s*\{[^}]*width:\s*7ch;[^}]*font-variant-numeric:\s*tabular-nums;/s);
  assert.match(css, /\.streamingMetricViewport\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.streamingMetricViewport\s*\{[^}]*transition:\s*width var\(--duration-fast\) var\(--ease-enter\);/s);
  assert.match(css, /\.streamingMetricViewport\[data-visible-digits="2"\]\s*\{\s*width:\s*2ch;\s*\}/s);
  assert.match(css, /\.streamingMetricViewport\[data-visible-digits="3"\]\s*\{\s*width:\s*3ch;\s*\}/s);
  assert.match(css, /\.streamingMetricDigit:nth-child\(2\)\s*\{[^}]*--metric-delay:\s*40ms;/s);
  assert.match(css, /\.streamingMetricDigit:nth-child\(3\)\s*\{[^}]*--metric-delay:\s*80ms;/s);
  assert.match(css, /\.streamingMetricDigit\[data-direction="up"\][^}]*animation:\s*streamingMetricRollUp/s);
  assert.match(css, /\.streamingMetricDigit\[data-direction="down"\][^}]*animation:\s*streamingMetricRollDown/s);
  assert.match(css, /animation-delay:\s*var\(--metric-delay\)/);
  assert.match(css, /@keyframes streamingMetricRollUp/);
  assert.match(css, /@keyframes streamingMetricRollDown/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.streamingMetricDigit\[data-direction\][^}]*animation:\s*none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*data-direction="up"[^}]*translateY\(calc\(-1 \* var\(--metric-distance\)\)\)/);
});

test("exposes hover, running, and disabled states for user message actions", async () => {
  const html = renderMessage(
    { role: "user", content: "Revise this message" },
    {
      entryId: "entry-1",
      onFork() {},
      forking: true,
      prevAssistantEntryId: "assistant-1",
      onNavigate() {},
      onEditSubmit() {},
    },
  );
  const css = await readFile(new URL("./chat/message-view.module.css", import.meta.url), "utf8");
  const buttons = [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0]);

  assert.equal(buttons.length, 3);
  for (const button of buttons) assert.match(button, /data-message-action=/);
  assert.match(buttons[0], /data-state="idle"/);
  assert.match(buttons[1], /data-state="idle"/);
  assert.match(buttons[2], /data-state="running"/);
  assert.match(buttons[2], /aria-busy="true"/);
  assert.match(buttons[2], /disabled/);
  assert.match(css, /\.messageAction:hover:not\(:disabled\)/);
  assert.match(css, /\.messageAction\[data-state="running"\]/);
});

test("renders the assistant action row with copy before its empty slots", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [{ type: "text", text: "A completed response" }],
  });

  assert.match(html, /data-assistant-actions="true"/);
  assert.match(html, /data-visible="false"/);
  assert.match(html, /data-message-action="copy-response"/);
  assert.match(html, /aria-label="Copy response"/);
  assert.ok(html.indexOf('data-message-action="copy-response"') < html.indexOf('data-slot="statistics-first"'));
  assert.doesNotMatch(html, /data-message-action="fork"/);
});

test("suppresses assistant actions while the response streams", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [{ type: "text", text: "A streaming response" }],
  }, { isStreaming: true });

  assert.doesNotMatch(html, /data-assistant-actions/);
  assert.doesNotMatch(html, /data-message-action="copy-response"/);
});

test("renders the assistant branch action and its running state", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [{ type: "text", text: "A completed response" }],
  }, { entryId: "assistant-1", onFork() {}, forking: true });

  assert.match(html, /aria-label="Fork chat from here"/);
  assert.match(html, /title="Branch in new chat"|Branch in new chat/);
  assert.match(html, /data-message-action="fork"/);
  assert.match(html, /data-state="running"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled/);
});

test("renders a provider error when the assistant message has no content", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [],
    stopReason: "error",
    errorMessage: "OpenAI API error (403): <html>request forbidden</html>",
  });

  assert.match(html, /role="alert"/);
  assert.match(html, /Error: OpenAI API error \(403\)/);
  assert.match(html, /&lt;html&gt;request forbidden&lt;\/html&gt;/);
});

test("renders partial assistant content before the provider error", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [{ type: "text", text: "Partial response" }],
    stopReason: "error",
    errorMessage: "Connection closed",
  });

  assert.match(html, /Partial response/);
  assert.match(html, /Error: Connection closed/);
});

test("renders completed command activity with terminal output", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, {
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-test",
          content: [{
            type: "toolCall",
            toolCallId: "shell-1",
            toolName: "bash",
            input: { command: "git status --short" },
          }],
        },
        toolResults: new Map([
          ["shell-1", {
            role: "toolResult",
            toolCallId: "shell-1",
            content: [{ type: "text", text: "staged 0, unstaged 1\n M components/MessageView.tsx" }],
          }],
        ]),
      }),
    ),
  );

  assert.match(html, /data-activity-kind="command" data-activity-state="completed"/);
  assert.match(html, /class="shell-output-preview"/);
  assert.match(html, /git<\/span>/);
  assert.match(html, /components\/MessageView\.tsx/);
});

test("routes bash execution messages through BashExecutionActivity", () => {
  const html = renderMessage({
    role: "bashExecution",
    command: "git diff --check",
    output: "clean",
    exitCode: 0,
  });

  assert.match(html, /class="shell-output-preview"/);
  assert.match(html, /git<\/span>/);
  assert.match(html, /clean/);
});

test("shows classified activity actions and details", () => {
  const cases = [
    ["read", "Reading", "lib/main.dart", "read"],
    ["grep", "Searching", "session replay", "search"],
    ["write", "Editing files", undefined, "edit"],
    ["glob", "Listing files", "components/**/*.tsx", "list"],
    ["eval", "Running tool", "eval", "unknown"],
  ];

  for (const [toolName, action, detail, kind] of cases) {
    const input = toolName === "grep"
      ? { query: "session replay" }
      : toolName === "glob"
        ? { path: "components/**/*.tsx" }
        : toolName === "eval"
          ? { code: "return 42" }
          : { path: "lib/main.dart" };
    const html = renderMessage({
      role: "assistant",
      provider: "openai",
      model: "gpt-test",
      content: [{
        type: "toolCall",
        toolCallId: `${toolName}-preview`,
        toolName,
        input,
      }],
    });

    assert.match(html, new RegExp(`data-activity-kind="${kind}" data-activity-state="running"`));
    assert.ok(html.includes(action), `expected ${action} for ${toolName}`);
    if (detail) assert.ok(html.includes(detail), `expected ${detail} for ${toolName}`);
  }
});

test("shows an operation icon beside every standard tool label", () => {
  const cases = [
    ["read", "read"],
    ["write", "edit"],
    ["glob", "list"],
    ["grep", "search"],
    ["edit", "edit"],
    ["eval", "unknown"],
    ["functions.task", "sub-agent"],
    ["unknown_tool", "unknown"],
  ];

  for (const [toolName, iconKind] of cases) {
    const html = renderMessage({
      role: "assistant",
      provider: "openai",
      model: "gpt-test",
      content: [{
        type: "toolCall",
        toolCallId: `${toolName}-icon`,
        toolName,
        input: {},
      }],
    });

    const iconPosition = html.indexOf(`data-activity-icon="${iconKind}"`);
    const iconEnd = html.indexOf(">", iconPosition);
    const toolPosition = html.indexOf("data-activity-slot=\"action\"");
    assert.ok(iconPosition >= 0, `expected ${iconKind} icon for ${toolName}`);
    assert.doesNotMatch(html.slice(iconPosition, iconEnd), /style=/);
    assert.ok(iconPosition < toolPosition, `expected ${iconKind} icon before ${toolName}`);
  }
});


test("keeps Todo tool content out of the transcript", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, {
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-test",
          content: [{
            type: "toolCall",
            toolCallId: "todo-1",
            toolName: "todo",
            input: {
              list: [{
                phase: "Implementation",
                items: ["First task", "Second task", "Third task", "Fourth task"],
              }],
            },
          }],
        },
        toolResults: new Map([
          ["todo-1", {
            role: "toolResult",
            toolCallId: "todo-1",
            details: {
              phases: [{
                name: "Implementation",
                tasks: [
                  { content: "First task", status: "completed" },
                  { content: "Second task", status: "completed" },
                  { content: "Third task", status: "in_progress" },
                  { content: "Fourth task", status: "pending" },
                ],
              }],
            },
            content: [],
          }],
        ]),
      }),
    ),
  );

  assert.doesNotMatch(html, /todo-checklist-preview/);
  assert.doesNotMatch(html, /First task/);
  assert.doesNotMatch(html, /Second task/);
  assert.doesNotMatch(html, /Third task/);
  assert.doesNotMatch(html, /Fourth task/);
});

test("passes the active reasoning state to the thinking disclosure", () => {
  const html = renderMessage(
    {
      role: "assistant",
      provider: "openai",
      model: "gpt-test",
      content: [{ type: "thinking", thinking: "**Partial thought**" }],
    },
    { isStreaming: true },
  );

  assert.match(html, /data-thinking-state="active"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Thinking/);
  assert.match(html, /<strong>[\s\S]*Partial [\s\S]*thought[\s\S]*<\/strong>/);
  // The shared Disclosure marks a closed panel inert, so an open panel is not.
  assert.doesNotMatch(html, /inert=""/);
});

test("collapses active reasoning when later answer text appears", () => {
  const html = renderMessage(
    {
      role: "assistant",
      provider: "openai",
      model: "gpt-test",
      content: [
        { type: "thinking", thinking: "**Finished thought**" },
        { type: "text", text: "Streaming answer" },
      ],
    },
    { isStreaming: true },
  );

  assert.match(html, /data-thinking-state="complete"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /inert=""/);
  assert.match(html, /<strong>Finished thought<\/strong>/);
  assert.match(html, /Streaming [\s\S]*answer/);
});

test("collapses active reasoning when a later tool appears", () => {
  const html = renderMessage(
    {
      role: "assistant",
      provider: "openai",
      model: "gpt-test",
      content: [
        { type: "thinking", thinking: "Inspect the source" },
        {
          type: "toolCall",
          toolCallId: "read-after-thinking",
          toolName: "read",
          input: { path: "components/MessageView.tsx" },
        },
      ],
    },
    { isStreaming: true },
  );

  assert.match(html, /data-thinking-state="complete"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /inert=""/);
  assert.match(html, /Inspect the source/);
  assert.match(html, /data-activity-state="running"/);
});

test("renders finished reasoning with disclosure semantics", () => {
  const html = renderMessage(
    {
      role: "assistant",
      provider: "openai",
      model: "gpt-test",
      timestamp: 8_000,
      content: [{ type: "thinking", thinking: "**Direct thought**\n\nMore reasoning" }],
    },
    { prevTimestamp: 1_000 },
  );
  const controls = /aria-controls="([^"]+)"/.exec(html);
  const region = /id="([^"]+)" role="region"/.exec(html);

  assert.match(html, /data-thinking-state="complete"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /7s/);
  assert.match(html, /inert=""/);
  assert.match(html, /<strong>Direct thought<\/strong>/);
  assert.match(html, /More reasoning/);
  assert.ok(controls, "the disclosure button must reference the reasoning region");
  assert.ok(region, "the reasoning region must have an id and a region role");
  assert.equal(controls[1], region[1]);
  assert.match(html, /aria-labelledby=/);
});

test("renders transcript turns with stable presentation hooks", () => {
  const headlessHtml = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, {
        message: { role: "assistant", provider: "openai", model: "gpt-test", content: [{ type: "text", text: "Done." }], timestamp: 8_000, usage: { input: 42, output: 12 } },
        modelNames: { "openai:gpt-test": "GPT Test" },
        showTimestamp: true,
      }),
    ),
  );
  assert.doesNotMatch(headlessHtml, /GPT Test/);
  assert.doesNotMatch(headlessHtml, /assistantMeta/);
  const userHtml = renderMessage({ role: "user", content: "A user message" });
  const assistantHtml = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [{ type: "text", text: "An assistant message" }],
  });

  assert.match(userHtml, /data-message-role="user"/);
  assert.match(assistantHtml, /data-message-role="assistant"/);
  assert.match(userHtml, /A user message/);
  assert.match(assistantHtml, /An assistant message/);
});

test("an empty user message has a visible fallback", () => {
  const html = renderMessage({ role: "user", content: "   " });

  assert.match(html, /\(No content\)/);
});

test("names ready and loading user image attachments", () => {
  const html = renderMessage({
    role: "user",
    content: [{
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" },
    }],
  });

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /alt="User attachment"/);
  assert.equal((html.match(/<img/g) ?? []).length, 1);
  assert.doesNotMatch(html, /\/home\/|source path/i);
});

test("names a failed user image and keeps its short status", async () => {
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.getComputedStyle = () => ({ fontSize: "16px", lineHeight: "24px" });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ height: 0 });
  const view = await mount(React.createElement(I18nProvider, null,
    React.createElement(MessageView, {
      message: {
        role: "user",
        content: [{
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" },
        }],
      },
    })));
  try {
    const image = view.container.querySelector("img");
    assert.ok(image);
    await React.act(async () => { image.dispatchEvent(new DomEvent("error")); });

    const failed = view.container.querySelector("[role='img']");
    assert.ok(failed);
    assert.equal(failed.getAttribute("aria-label"), "Image failed to load");
    assert.match(failed.textContent, /Image failed to load/);
    assert.match(failed.textContent, /Failed/);
    assert.equal(view.container.querySelector("img"), null);
  } finally {
    await view.unmount();
    if (originalRect) {
      window.HTMLElement.prototype.getBoundingClientRect = originalRect;
    } else {
      delete window.HTMLElement.prototype.getBoundingClientRect;
    }
  }
});

test("renders a video marker without its hidden source path", () => {
  const html = renderMessage({
    role: "user",
    content: [{
      type: "video",
      mimeType: "video/mp4",
      path: "/private/recordings/demo.mp4",
    }],
  });

  assert.match(html, /aria-label="Video unavailable"/);
  assert.match(html, />Video unavailable</);
  assert.doesNotMatch(html, /private|recordings|demo\.mp4/);
});

test("names inaccessible user image media without rendering its path", () => {
  const html = renderMessage({
    role: "user",
    content: [{ type: "image", path: "/private/captures/lost.png" }],
  });

  assert.match(html, /aria-label="Image failed to load"/);
  assert.doesNotMatch(html, /private|captures|lost\.png/);
});

test("restores persisted user image media state", () => {
  const loaded = buildSessionContext([
    { type: "message", id: "user-1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } },
    ] } },
  ]);

  assert.match(renderMessage(loaded.messages[0]), /alt="User attachment"/);
  assert.match(renderMessage(loaded.messages[0]), /aria-busy="true"/);
});

test("keeps an unavailable user media attachment named", () => {
  const html = renderMessage({
    role: "user",
    content: "See the capture",
    attachments: [{ name: "capture.png", kind: "file", available: false }],
  });

  assert.match(html, /capture\.png \(unavailable\)/);
});

test("keeps tool activity status accessible without color", () => {
  const html = renderMessage({
    role: "assistant",
    provider: "openai",
    model: "gpt-test",
    content: [{
      type: "toolCall",
      toolCallId: "read-1",
      toolName: "read",
      input: { path: "DESIGN.md" },
    }],
  });

  assert.match(html, /data-activity-state="running"/);
  assert.match(html, /aria-label="[^"]*read[^"]*"/i);
});

test("delegates transcript framing, thinking, and tools to canonical modules", async () => {
  const source = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");

  assert.match(source, /from "\.\/chat\/MessageTurn"/);
  assert.match(source, /from "\.\/chat\/ThinkingDisclosure"/);
  assert.match(source, /BashExecutionActivity.*from "\.\/chat\/BashExecutionActivity"/);
  assert.match(source, /ActivityRow.*from "\.\/chat\/ActivityRow"/);
  assert.match(source, /<MessageTurn[\s\S]*?role="compaction"/);
  assert.match(source, /<MessageTurn[\s\S]*?role="custom"/);
  assert.doesNotMatch(source, /function ThinkingBlock/);
  assert.doesNotMatch(source, /function ToolCallBlock/);
  assert.doesNotMatch(source, /function BashExecutionView/);
  assert.doesNotMatch(source, /copyText/);
});
