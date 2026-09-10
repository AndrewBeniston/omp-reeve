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
  MessageView,
  STREAMING_METRIC_FPS,
  StreamingMetrics,
  buildMetricDigitSequence,
  formatStreamingRate,
  formatStreamingTokens,
  smoothStreamingRate,
} = await jiti.import("./MessageView.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

function renderMessage(message, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MessageView, { message, ...props }),
    ),
  );
}

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

test("renders shell blocks as themed terminal content", () => {
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

  assert.match(html, /class="shell-output-preview"/);
  assert.match(html, /git<\/span>/);
  assert.match(html, /--short/);
  assert.match(html, /Output/);
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

test("uses i/title in the standard header for grep, read, write, glob, and eval blocks", () => {
  const cases = [
    ["read", "i", "Verifico bridge startSessionReplay e campionamento", { i: "Verifico bridge startSessionReplay e campionamento", path: "lib/main.dart" }, "lib/main.dart"],
    ["grep", "i", "Individuo avvio e stop del session replay", { i: "Individuo avvio e stop del session replay", path: "lib/main.dart" }, "lib/main.dart"],
    ["write", "i", "Individuo simbolo Main dell'app Flutter", { i: "Individuo simbolo Main dell'app Flutter", path: "lib/main.dart" }, "lib/main.dart"],
    ["glob", "i", "Individuo componenti TypeScript", { i: "Individuo componenti TypeScript", path: "components/**/*.tsx" }, "components/**/*.tsx"],
    ["eval", "title", "Valuto il risultato del parser", { title: "Valuto il risultato del parser", code: "return 42" }, "return 42"],
  ];

  for (const [toolName, property, preview, input, fallback] of cases) {
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

    const renderedPreview = preview.replaceAll("'", "&#x27;");
    const previewPosition = html.indexOf(renderedPreview);
    const toolPosition = html.indexOf(`>${toolName}</span>`);
    assert.ok(previewPosition > toolPosition, `expected ${property} from ${toolName} in the standard header`);
    assert.doesNotMatch(html, /class="tool-intent-preview"/);
    assert.ok(!html.includes(fallback), `expected ${toolName} fallback to stay out of the header`);
  }
});

test("shows an operation icon beside every standard tool label", () => {
  const cases = [
    ["read", "read"],
    ["write", "write"],
    ["glob", "glob"],
    ["grep", "grep"],
    ["edit", "edit"],
    ["eval", "eval"],
    ["functions.task", "task"],
    ["unknown_tool", "generic"],
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

    const iconPosition = html.indexOf(`data-tool-icon="${iconKind}"`);
    const iconEnd = html.indexOf(">", iconPosition);
    const toolPosition = html.indexOf(`>${toolName}</span>`);
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
  assert.match(html, /data-tool-state="running"/);
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

  assert.match(html, /data-tool-state="running"/);
  assert.match(html, /aria-label="[^"]*read[^"]*"/i);
});

test("delegates transcript framing, thinking, and tools to canonical modules", async () => {
  const source = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");

  assert.match(source, /from "\.\/chat\/MessageTurn"/);
  assert.match(source, /from "\.\/chat\/ThinkingDisclosure"/);
  assert.match(source, /BashExecutionActivity.*from "\.\/chat\/BashExecutionActivity"/);
  assert.match(source, /ToolActivity.*from "\.\/chat\/ToolActivity"/);
  assert.match(source, /<MessageTurn[\s\S]*?role="compaction"/);
  assert.match(source, /<MessageTurn[\s\S]*?role="custom"/);
  assert.doesNotMatch(source, /function ThinkingBlock/);
  assert.doesNotMatch(source, /function ToolCallBlock/);
  assert.doesNotMatch(source, /function BashExecutionView/);
  assert.doesNotMatch(source, /copyText/);
});
