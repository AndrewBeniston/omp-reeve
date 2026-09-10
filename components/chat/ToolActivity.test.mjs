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
const { BashExecutionActivity } = await jiti.import("./BashExecutionActivity.tsx");
const { ToolActivity } = await jiti.import("./ToolActivity.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderActivity(component, props) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(component, props),
    ),
  );
}

test("renders standard tool state and preview while collapsed", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "read-1",
      toolName: "read",
      input: { path: "DESIGN.md" },
    },
    result: {
      role: "toolResult",
      toolCallId: "read-1",
      content: [{ type: "text", text: "file content" }],
    },
    duration: 3,
  });

  assert.match(html, /data-tool-state="success"/);
  assert.match(html, /data-tool-status="success"/);
  assert.match(html, /data-tool-icon="read"/);
  assert.match(html, /DESIGN\.md/);
  assert.match(html, /3s/);
  assert.doesNotMatch(html, /file content/);
});

test("expands edit input and output by default", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "edit-1",
      toolName: "edit_file",
      input: { path: "components/chat/ToolActivity.tsx", text: "new text" },
    },
    result: {
      role: "toolResult",
      toolCallId: "edit-1",
      content: [{ type: "text", text: "updated file" }],
    },
  });

  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /&quot;text&quot;: &quot;new text&quot;/);
  assert.match(html, /updated file/);
});

test("renders and sanitizes tool error output while collapsed", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "read-2",
      toolName: "read",
      input: { path: "missing.md" },
    },
    result: {
      role: "toolResult",
      toolCallId: "read-2",
      content: [{ type: "text", text: "missing <script>alert(1)</script> file" }],
      isError: true,
    },
  });

  assert.match(html, /data-tool-state="error"/);
  assert.match(html, /missing &lt;script&gt;alert\(1\)&lt;\/script&gt; file/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /aria-label="read error"/);
});

test("preserves bash routing when a command is absent", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "bash-empty",
      toolName: "bash",
      input: {},
    },
  });

  assert.match(html, /class="shell-output-preview"/);
  assert.match(html, /class="shell-output-pending"/);
  assert.match(html, /aria-live="polite"/);
});

test("keeps broad bash icons separate from terminal routing", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "exec-1",
      toolName: "exec_command",
      input: { command: "git status" },
    },
  });

  assert.match(html, /data-tool-icon="bash"/);
  assert.match(html, /data-tool-state="running"/);
  assert.doesNotMatch(html, /class="shell-output-preview"/);
});

test("preserves ANSI output, line states, duration, and local status", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "bash-local",
      toolName: "bash (local)",
      input: { command: "printf output" },
    },
    result: {
      role: "toolResult",
      toolCallId: "bash-local",
      content: [{ type: "text", text: "\u001b[31merror <tag>\u001b[0m\nwarning next\nsuccess done" }],
    },
    duration: 4,
  });

  assert.match(html, /class="shell-local-label">local/);
  assert.match(html, /class="shell-output-line is-error"/);
  assert.match(html, /class="shell-output-line is-warning"/);
  assert.match(html, /class="shell-output-line is-success"/);
  assert.match(html, /error &lt;tag&gt;/);
  assert.doesNotMatch(html, /\u001b/);
  assert.match(html, /class="shell-output-footer">4s/);
});

test("renders diff stats and a sanitized file diff", () => {
  const html = renderActivity(ToolActivity, {
    block: {
      type: "toolCall",
      toolCallId: "edit-diff",
      toolName: "edit",
      input: { path: "example.ts" },
    },
    result: {
      role: "toolResult",
      toolCallId: "edit-diff",
      content: [],
      details: {
        patch: "--- a/example.ts\n+++ b/example.ts\n@@ -1 +1 @@\n-old <tag>\n+new & value",
      },
    },
  });

  assert.match(html, /1 lines added, 1 lines removed/);
  assert.match(html, /old &lt;tag&gt;/);
  assert.match(html, /new &amp; value/);
});

test("routes user bash execution through the terminal tool renderer", () => {
  const html = renderActivity(BashExecutionActivity, {
    message: {
      role: "bashExecution",
      command: "git status --short",
      output: " M components/MessageView.tsx",
      exitCode: 0,
    },
  });

  assert.match(html, /class="shell-output-preview"/);
  assert.match(html, /git<\/span>/);
  assert.match(html, /components\/MessageView\.tsx/);
});

test("preserves truncated bash loading and download controls", () => {
  const html = renderActivity(BashExecutionActivity, {
    message: {
      role: "bashExecution",
      command: "bun test",
      output: "partial output",
      exitCode: 0,
      truncated: true,
      fullOutputPath: "logs/output file.txt",
    },
    sessionId: "session/id",
  });

  assert.match(html, /view full output/);
  assert.match(html, /download full output/);
  assert.match(html, /session%2Fid/);
  assert.match(html, /logs%2Foutput%20file\.txt/);
});

test("keeps tool modules free from intrinsic styles and raw colors", async () => {
  const files = [
    "ToolActivity.tsx",
    "tool-presentation.ts",
    "ToolIcon.tsx",
    "TodoPlan.ts",
    "TerminalOutput.tsx",
    "ToolDiffView.tsx",
    "BashExecutionActivity.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bstyle\s*=/, file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, file);
    assert.doesNotMatch(source, /\bInter\b/, file);
  }

  const terminalSource = await readFile(new URL("./TerminalOutput.tsx", import.meta.url), "utf8");
  assert.match(terminalSource, /import \{ AnsiSegment \}/);
  assert.match(terminalSource, /<AnsiSegment/);
});

test("completed tool cards keep a neutral Codex surface", async () => {
  const css = await readFile(new URL("./message-view.module.css", import.meta.url), "utf8");
  assert.match(css, /\.toolCard\s*\{[^}]*border:\s*1px solid var\(--ui-border\);[^}]*background:\s*var\(--ui-surface-inset\);/);
  assert.match(css, /\.toolName\s*\{[^}]*color:\s*var\(--ui-text\);/);
  assert.match(css, /\.toolCard\[data-tool-state="error"\]\s*\{[^}]*border-color:\s*var\(--ui-danger\);[^}]*background:\s*var\(--ui-danger-wash\);/);
});
