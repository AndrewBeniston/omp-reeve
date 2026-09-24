import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { ChatInput } = await jiti.import("./ChatInput.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");

test("ticket #559 footer keeps only the reference controls", async () => {
  const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(ChatInput, {
    onSend() {},
    onAbort() {},
    isStreaming: false,
    model: { provider: "openai", modelId: "gpt-5.4" },
    modelList: [{ provider: "openai", id: "gpt-5.4", name: "GPT-5.4" }],
    onModelChange() {},
    thinkingLevel: "medium",
    contextUsage: { tokens: 10_000, contextWindow: 100_000, percent: 10 },
    cwd: "/repo",
    onSelectWorktree() {},
    onOpenGoal() {},
  })));

  assert.doesNotMatch(html, /aria-label="Switch branch"/);
  assert.doesNotMatch(html, /aria-label="Set a goal"/);
  assert.doesNotMatch(html, /<svg[^>]+data-composer-icon="model"/);
  assert.doesNotMatch(html, /class="modelRoute"/);
  assert.match(html, /data-composer-icon="send-arrow"/);

  const css = await readFile(new URL("./chat/composer.module.css", import.meta.url), "utf8");
  // One footer row at every width: the grid shortens the model name instead of wrapping.
  assert.match(css, /\.toolbar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\);/);
  assert.doesNotMatch(css, /\.toolbar\[data-mobile="true"\]\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.sendAction,\s*\.stopControl\s*\{[^}]*background:\s*var\(--ui-composer-primary\);/);
});
