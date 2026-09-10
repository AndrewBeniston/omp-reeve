import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { readFile } from "node:fs/promises";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { SummaryPanel } = await jiti.import("./SummaryPanel.tsx");
const { I18nProvider } = await jiti.import("../hooks/useI18n.tsx");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const summarySource = await readFile(new URL("./SummaryPanel.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("./shell/summary-panel.module.css", import.meta.url), "utf8");
const shellStyles = await readFile(new URL("./shell/shell.module.css", import.meta.url), "utf8");
const tokens = await readFile(new URL("../app/tokens.css", import.meta.url), "utf8");

test("Summary shows each available OMP section", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(SummaryPanel, {
        branchContent: React.createElement("div", null, "Branch tree"),
        cwd: "/Users/test/omp-web",
        onGenerateTitle() {},
        onOpenHistory() {},
        repositoryLabel: "ddallabenetta/omp-web",
        session: {
          path: "/tmp/session.jsonl",
          id: "session-1",
          cwd: "/Users/test/omp-web",
          created: "2026-09-04T10:00:00.000Z",
          modified: "2026-09-04T11:00:00.000Z",
          messageCount: 4,
          firstMessage: "Test",
          gitBranch: "codex/interface",
          isWorktree: true,
        },
        sessionStats: {
          sessionId: "session-1",
          userMessages: 2,
          assistantMessages: 2,
          toolCalls: 1,
          toolResults: 1,
          totalMessages: 4,
          tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 },
          cost: 0.12,
        },
        sources: [
          { activity: "attached", id: "image:1", kind: "image", label: "Reference image", url: "data:image/png;base64,aGVsbG8=" },
          { activity: "read", id: "file:1", kind: "file", label: "guide.md", path: "/Users/test/omp-web/guide.md" },
          { activity: "provided", id: "url:1", kind: "url", label: "example.com", url: "https://example.com" },
          { activity: "read", id: "file:2", kind: "file", label: "notes.md", path: "/Users/test/omp-web/notes.md" },
        ],
        onOpenSourceFile() {},
        onViewAllSources() {},
        sourceInputId: "reeve-composer-image-input",
        subagents: [{ id: "agent-1", agent: "Reviewer", status: "running" }],
        systemPrompt: "System text",
        titleAction: { disabled: false, label: "Generate title", state: "idle" },
      }),
    ),
  );

  for (const label of ["Environment", "Session", "Branches", "System", "Usage", "Subagents", "Sources"]) {
    assert.match(markup, new RegExp(`>${label}<`));
  }
  assert.match(markup, /ddallabenetta\/omp-web/);
  assert.match(markup, /codex\/interface/);
  assert.match(markup, /Git worktree/);
  assert.match(markup, /Full history/);
  assert.match(markup, /Generate title/);
  assert.match(markup, /Branch tree/);
  assert.match(markup, /System text/);
  assert.match(markup, /165/);
  assert.match(markup, /Reviewer/);
  assert.equal((markup.match(/data-summary-source=/g) ?? []).length, 3);
  assert.match(markup, /Reference image/);
  assert.match(markup, /View all/);
});

test("the Summary panel uses the shipped Codex geometry", () => {
  assert.match(styles, /\.panel\s*\{[^}]*width:\s*300px;/);
  assert.match(styles, /\.panel\s*\{[^}]*border-radius:\s*24px;[^}]*corner-shape:\s*superellipse\(1\.5\);/);
  assert.match(styles, /\.panel\s*\{[^}]*padding:\s*10px 0 6px;/);
  assert.match(styles, /\.section > button\s*\{[^}]*height:\s*28px;[^}]*padding:\s*0 14px;[^}]*font-size:\s*var\(--text-base\);[^}]*line-height:\s*21px;/);
  assert.match(styles, /\.section \+ \.section\s*\{[^}]*border-top:\s*0\.5px solid var\(--ui-border\);/);
  assert.match(appShellSource, /summaryToggle[\s\S]*?<svg width="16" height="16"/);
  assert.match(
    shellStyles,
    /\.summaryToggle\.summaryToggle\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--ui-toolbar-selected\);/,
  );
  assert.match(tokens, /--ui-toolbar-selected:\s*color-mix\(in srgb, var\(--text\) 10%, transparent\);/);
});

test("the chat top bar exposes Summary instead of history, branches, and system", () => {
  const actionStart = appShellSource.indexOf("<div className={shellStyles.headerFileAction}>");
  const actionEnd = appShellSource.indexOf("</div>", actionStart);
  const actionSource = appShellSource.slice(actionStart, actionEnd);

  assert.match(actionSource, /summary\.toggle/);
  assert.ok(actionSource.indexOf("summary.toggle") < actionSource.indexOf("files.hidePanel"));
  assert.doesNotMatch(actionSource, /history\.full|title\.generateSession|i18n\.branches|system\.prompt/);
  assert.match(appShellSource, /<SummaryPanel[\s\S]*?onOpenHistory=\{handleViewFullHistory\}[\s\S]*?branchContent=/);
  assert.match(appShellSource, /<BranchNavigator[\s\S]*?embedded[\s\S]*?hasSession=/);
});

test("Summary reads the current Git change metrics", () => {
  assert.match(appShellSource, /fetch\(`\/api\/git\/status\?cwd=\$\{encodeURIComponent\(summaryCwd\)\}`/);
  assert.doesNotMatch(summarySource, /\bfetch\(/);
  assert.match(summarySource, /gitStatus\.additions/);
  assert.match(summarySource, /gitStatus\.deletions/);
  assert.match(summarySource, /summary\.changes/);
  assert.match(summarySource, /summary\.local/);
  assert.match(styles, /\.changeAdditions\s*\{[^}]*color:\s*var\(--ui-success\);/);
  assert.match(styles, /\.changeDeletions\s*\{[^}]*color:\s*var\(--ui-danger\);/);
});

test("Summary sections use the shared accessible Disclosure primitive", () => {
  assert.match(summarySource, /import \{ Disclosure \} from "\.\/ui\/Disclosure"/);
  assert.match(summarySource, /<Disclosure[\s\S]*?defaultExpanded=\{open\}/);
  assert.doesNotMatch(summarySource, /<details|<summary/);
});

test("Summary sources use Codex-sized previews and interactive rows", () => {
  assert.match(summarySource, /const visibleSources = sources\.slice\(0, 3\)/);
  assert.doesNotMatch(summarySource, /showAllSources|showLessSources/);
  assert.match(summarySource, /className=\{styles\.sourcePreview\}/);
  assert.match(summarySource, /openExternal\(source\.url\)/);
  assert.match(summarySource, /className=\{styles\.sectionAction\}[\s\S]*?document\.getElementById\(sourceInputId\)\?\.click\(\)/);
  assert.match(summarySource, /className=\{styles\.viewAllSources\}[\s\S]*?onClick=\{onViewAllSources\}/);
  assert.match(styles, /\.sourcePreview\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);
  assert.match(styles, /\.sourceRow:hover,[\s\S]*?\.viewAllSources:hover\s*\{[^}]*background:\s*var\(--ui-row-hover\);/s);
  assert.match(styles, /\.sourceRow:focus-visible,[\s\S]*?\.sourcePreviewClose:focus-visible\s*\{[^}]*outline:\s*var\(--ui-focus-ring\);/s);
});

test("Summary receives sources through the ChatWindow data seam", () => {
  assert.match(appShellSource, /const \[summarySources, setSummarySources\] = useState<SummarySource\[]>\(\[\]\)/);
  assert.match(appShellSource, /sources=\{visibleSummarySources\}/);
  assert.match(appShellSource, /onSummarySourcesChange=\{setSummarySources\}/);
  assert.match(appShellSource, /sourceInputId=\{COMPOSER_IMAGE_INPUT_ID\}/);
  assert.match(appShellSource, /onViewAllSources=\{handleViewAllSources\}/);
  assert.match(appShellSource, /kind:\s*"sources"/);
  assert.match(appShellSource, /<SourcesView[\s\S]*?sources=\{activeTab\.sources\}/);
});
