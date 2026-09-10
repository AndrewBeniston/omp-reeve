import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { ComposerTurnStatus, getActiveTurnStatus } = await jiti.import("./ComposerTurnStatus.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

const todoCall = {
  type: "toolCall",
  toolCallId: "todo-1",
  toolName: "todo",
  input: {
    list: [{ phase: "Build", items: ["Inspect", "Implement", "Verify"] }],
  },
};

const editCall = {
  type: "toolCall",
  toolCallId: "edit-1",
  toolName: "edit",
  input: { path: "/tmp/example.ts" },
};

const results = new Map([
  ["todo-1", {
    role: "toolResult",
    toolCallId: "todo-1",
    content: [],
    details: {
      phases: [{
        name: "Build",
        tasks: [
          { content: "Inspect", status: "completed" },
          { content: "Implement", status: "in_progress" },
          { content: "Verify", status: "blocked", blocker: "Waiting for review" },
        ],
      }],
    },
  }],
  ["edit-1", {
    role: "toolResult",
    toolCallId: "edit-1",
    content: [],
    details: { patch: "*** Begin Patch\n*** Update File: example.ts\n@@\n-old\n+new\n*** End Patch" },
  }],
]);

test("derives the active step and changed file summary from completed tool results", () => {
  const status = getActiveTurnStatus([todoCall, editCall], results, "/tmp");

  assert.equal(status?.stepNumber, 2);
  assert.equal(status?.stepCount, 3);
  assert.equal(status?.completedCount, 1);
  assert.deepEqual(status?.changes, [{ filePath: "/tmp/example.ts", added: 1, removed: 1 }]);
});

test("uses the latest Todo call and selects the first unfinished step", () => {
  const laterTodo = {
    ...todoCall,
    toolCallId: "todo-2",
    input: { list: [{ phase: "Check", items: ["One", "Two"] }] },
  };
  const status = getActiveTurnStatus([todoCall, laterTodo], results, "/tmp");

  assert.equal(status?.stepNumber, 1);
  assert.equal(status?.stepCount, 2);
  assert.equal(status?.tasks[0].content, "One");
});

test("renders the Codex-style Steps pill and rich tooltip", () => {
  const html = renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(ComposerTurnStatus, {
      blocks: [todoCall, editCall],
      toolResults: results,
      cwd: "/tmp",
    }),
  ));

  assert.match(html, /data-composer-turn-status="true"/);
  assert.match(html, /Step 2 \/ 3/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /Inspect/);
  assert.match(html, /Implement/);
  assert.match(html, /Verify/);
  assert.match(html, /Waiting for review/);
  assert.match(html, /1 file changed/);
  assert.match(html, /\+1/);
  assert.match(html, /−1/);
});

test("renders no status row when the turn has no Todo or successful file change", () => {
  const html = renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(ComposerTurnStatus, {
      blocks: [{ type: "text", text: "Working" }],
      toolResults: new Map(),
    }),
  ));

  assert.equal(html, "");
});

test("keeps the active status directly above the composer", () => {
  const source = readFileSync(new URL("../ChatWindow.tsx", import.meta.url), "utf8");
  const statusPosition = source.indexOf("<ComposerTurnStatus");
  const composerPosition = source.indexOf("{chatInputElement}", statusPosition);

  assert.ok(statusPosition >= 0);
  assert.ok(composerPosition > statusPosition);
});

test("uses an immediate hover tooltip and Codex fixed-row geometry", () => {
  const css = readFileSync(new URL("./composer-turn-status.module.css", import.meta.url), "utf8");

  assert.match(css, /\.statusRow\s*\{[^}]*height:\s*32px;/s);
  assert.match(css, /\.statusPill\s*\{[^}]*gap:\s*8px;[^}]*padding:\s*6px 12px;/s);
  assert.match(css, /\.statusPill\s*\{[^}]*border-radius:\s*var\(--radius-composer-squircle\);[^}]*corner-shape:\s*var\(--corner-row\);/s);
  assert.match(css, /\.tooltip\s*\{[^}]*max-width:\s*min\(320px, calc\(100vw - 16px\)\);/s);
  assert.match(css, /\.tooltipTrigger:hover \.tooltip/s);
  assert.match(css, /\.tooltipTrigger:focus-within \.tooltip/s);
  assert.match(css, /\.changesTooltip\s*\{[^}]*bottom:\s*calc\(100% \+ 4px\);/s);
});
