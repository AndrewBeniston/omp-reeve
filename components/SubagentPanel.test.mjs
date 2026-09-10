import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const {
  isSubagentActive,
  formatSubagentDuration,
  subagentTitle,
  subagentActivity,
  getSubagentStatus,
} = await jiti.import("./SubagentPanel.tsx");

const source = await readFile(new URL("./SubagentPanel.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("./subagents/SubagentDetail.tsx", import.meta.url), "utf8");
const rowSource = await readFile(new URL("./subagents/SubagentRow.tsx", import.meta.url), "utf8");
const glyphSource = await readFile(new URL("./subagents/SubagentStatusGlyph.tsx", import.meta.url), "utf8");
const helpersSource = await readFile(new URL("./subagents/subagent-helpers.ts", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const shellLayoutSource = await readFile(new URL("./shell/ShellLayout.tsx", import.meta.url), "utf8");
const shellCss = await readFile(new URL("./shell/shell.module.css", import.meta.url), "utf8");
const subagentCss = await readFile(
  new URL("./subagents/subagent-panel.module.css", import.meta.url),
  "utf8",
);

const allSubagentSources = [source, detailSource, rowSource, glyphSource, helpersSource].join("\n");

test("isSubagentActive identifies pending and running subagents", () => {
  assert.equal(isSubagentActive({ status: "pending" }), true);
  assert.equal(isSubagentActive({ status: "starting" }), true);
  assert.equal(isSubagentActive({ status: "waiting" }), true);
  assert.equal(isSubagentActive({ status: "running" }), true);
  assert.equal(isSubagentActive({ status: "completed" }), false);
  assert.equal(isSubagentActive({ status: "failed" }), false);
  assert.equal(isSubagentActive({ status: "aborted" }), false);
  assert.equal(isSubagentActive({ status: "cancelled" }), false);
});

test("formatSubagentDuration formats milliseconds into human readable strings", () => {
  assert.equal(formatSubagentDuration(0), "0s");
  assert.equal(formatSubagentDuration(-1000), "0s");
  assert.equal(formatSubagentDuration(800), "1s");
  assert.equal(formatSubagentDuration(45000), "45s");
  assert.equal(formatSubagentDuration(60000), "1m 00s");
  assert.equal(formatSubagentDuration(65000), "1m 05s");
  assert.equal(formatSubagentDuration(125000), "2m 05s");
  assert.equal(formatSubagentDuration(3600000), "60m 00s");
});

test("subagentTitle resolves task, assignment, description, or fallback with strict priority", () => {
  assert.equal(
    subagentTitle({ task: "Task A", assignment: "Assign B", description: "Desc C" }, "fallback"),
    "Task A",
  );
  assert.equal(
    subagentTitle({ assignment: "Assign B", description: "Desc C" }, "fallback"),
    "Assign B",
  );
  assert.equal(
    subagentTitle({ description: "Desc C" }, "fallback"),
    "Desc C",
  );
  assert.equal(subagentTitle({}, "fallback"), "fallback");
  assert.equal(subagentTitle({ task: undefined, description: undefined }, "subagent-1"), "subagent-1");
});

test("subagentActivity reports status, retries, and active tools", () => {
  const mockT = (key, params) => {
    if (key === "subagents.retrying") return `Retrying ${params?.attempt}/${params?.max}`;
    if (key === "subagents.usingTool") return `Using tool ${params?.tool}`;
    if (key === "subagents.running") return "Running";
    if (key === "subagents.failed") return "Failed";
    if (key === "subagents.aborted") return "Aborted";
    if (key === "subagents.finished") return "Finished";
    return key;
  };
  assert.equal(subagentActivity({ progress: { retryState: { attempt: 2, maxAttempts: 3 } } }, mockT), "Retrying 2/3");
  assert.equal(subagentActivity({ status: "running", progress: { currentTool: "readFile" } }, mockT), "Using tool readFile");
  assert.equal(subagentActivity({ status: "running", progress: { lastIntent: "Reading file" } }, mockT), "Reading file");
  assert.equal(subagentActivity({ status: "running" }, mockT), "Running");
  assert.equal(subagentActivity({ status: "pending" }, mockT), "Running");
  assert.equal(subagentActivity({ status: "starting" }, mockT), "Running");
  assert.equal(subagentActivity({ status: "failed" }, mockT), "Failed");
  assert.equal(subagentActivity({ status: "aborted" }, mockT), "Aborted");
  assert.equal(subagentActivity({ status: "cancelled" }, mockT), "Aborted");
  assert.equal(subagentActivity({ status: "completed" }, mockT), "Finished");
});

test("getSubagentStatus maps snapshot to semantic status state", () => {
  assert.equal(getSubagentStatus({ progress: { retryState: { attempt: 1, maxAttempts: 3 } }, status: "running" }), "retry");
  assert.equal(getSubagentStatus({ status: "running" }), "running");
  assert.equal(getSubagentStatus({ status: "pending" }), "running");
  assert.equal(getSubagentStatus({ status: "starting" }), "running");
  assert.equal(getSubagentStatus({ status: "waiting" }), "running");
  assert.equal(getSubagentStatus({ status: "failed" }), "failed");
  assert.equal(getSubagentStatus({ status: "aborted" }), "aborted");
  assert.equal(getSubagentStatus({ status: "cancelled" }), "aborted");
  assert.equal(getSubagentStatus({ status: "completed" }), "completed");
});

test("renders live and completed subagent groups beside the chat", () => {
  assert.match(source, /subagent-panel/);
  assert.match(source, /styles\.panel/);
  assert.match(source, /const running = subagents\.filter\(isSubagentActive\)/);
  assert.match(source, /const finished = subagents\.filter\(\(subagent\) => !isSubagentActive\(subagent\)\)/);
  assert.match(source, /t\("subagents\.history"\)/);
  assert.match(source, /t\("subagents\.running"\)/);
});

test("returns null when session is absent or subagent list is empty", () => {
  assert.match(source, /if \(!sessionId \|\| subagents\.length === 0\) return null;/);
});

test("uses a desktop sibling column instead of an absolute overlay", () => {
  assert.doesNotMatch(allSubagentSources, /position:\s*"absolute"/);
  assert.match(shellLayoutSource, /className=\{styles\.contentLayout\}/);
  assert.match(shellLayoutSource, /<main className=\{styles\.mainContent\}>/);
  assert.match(shellLayoutSource, /secondaryPanel && \(\s*<aside className=\{styles\.secondaryPanel\}>/);
  assert.match(
    appShellSource,
    /const showSubagentPanel = !isMobile && selectedSession !== null && subagents\.length > 0/,
  );
  assert.match(appShellSource, /secondaryPanel=\{showSubagentPanel \?/);
  assert.match(shellCss, /\.contentLayout\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;[^}]*\}/);
  assert.match(
    shellCss,
    /\.secondaryPanel\s*\{[^}]*display:\s*flex;[^}]*flex:\s*0 0 clamp\(280px, 28vw, 360px\);[^}]*border-left:\s*1px solid var\(--ui-border\);[^}]*\}/,
  );
  assert.match(
    shellCss,
    /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.secondaryPanel,[\s\S]*?display:\s*none;[\s\S]*?\}/,
  );
});

test("loads a selected subagent transcript and handles live polling", () => {
  assert.match(detailSource, /type: "get_subagent_messages"/);
  assert.match(detailSource, /subagentId: subagent\.id/);
  assert.match(detailSource, /active \? setInterval/);
  assert.match(detailSource, /clearInterval\(interval\)/);
  assert.match(detailSource, /subagents\.transcriptUnavailable/);
  assert.match(detailSource, /subagents\.loadingTranscript/);
  assert.match(detailSource, /subagents\.noTranscript/);
});

test("subagent controls expose public state and ARIA attributes", () => {
  assert.match(source, /aria-expanded={!collapsed}/);
  assert.match(source, /data-active={running\.length > 0}/);
  assert.match(source, /role="list"/);
  assert.match(source, /aria-label=/);
  assert.match(rowSource, /role="listitem"/);
  assert.match(rowSource, /data-selected={selected}/);
  assert.match(rowSource, /data-status={status}/);
  assert.match(detailSource, /<section aria-label={t\("subagents\.details"\)}/);
  assert.doesNotMatch(detailSource, /role="dialog"/);
});

test("detail view handles escape key navigation to return to list", () => {
  assert.match(detailSource, /event\.key === "Escape"/);
  assert.match(detailSource, /onBack\(\)/);
});

test("replaces direct style mutations and state-only inline styles with CSS module classes", () => {
  assert.doesNotMatch(allSubagentSources, /currentTarget\.style|target\.style/);
  assert.doesNotMatch(allSubagentSources, /transform:\s*collapsed/);
  assert.doesNotMatch(allSubagentSources, /background:\s*selected/);
  assert.doesNotMatch(allSubagentSources, /border:\s*selected/);
  assert.doesNotMatch(allSubagentSources, /color:\s*running\.length/);
  assert.doesNotMatch(allSubagentSources, /color:\s*progress\?\.retryState/);
  assert.doesNotMatch(allSubagentSources, /\bstyle\s*=/);
  assert.match(subagentCss, /\.collapseToggle\[aria-expanded="false"\]/);
  assert.match(subagentCss, /\.subagentRow\[data-selected="true"\]/);
  assert.match(subagentCss, /\.subagentRow:hover/);
  assert.match(subagentCss, /\[data-status="running"\]/);
  assert.match(subagentCss, /\[data-status="retry"\]/);
  assert.match(subagentCss, /\[data-status="failed"\]/);
  assert.match(subagentCss, /\[data-status="completed"\]/);
});

test("uses Tier 2 semantic tokens for subagent interface colors", () => {
  assert.match(subagentCss, /var\(--ui-(?:accent|border|canvas|danger|sidebar|success|text|warning)\)/);
  assert.doesNotMatch(
    subagentCss,
    /var\(--(?:accent|accent-hover|assistant-bg|bg|bg-hover|bg-panel|bg-selected|bg-subtle|border|danger|success|text|text-dim|text-muted|tool-bg|user-bg|warning)\)/,
  );
  assert.doesNotMatch(subagentCss, /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i);
});

test("subagent panel CSS defines focus-visible rings on interactive controls", () => {
  assert.match(subagentCss, /\.collapseToggle:focus-visible/);
  assert.match(subagentCss, /\.subagentRow:focus-visible/);
  assert.match(subagentCss, /\.backButton:focus-visible/);
  assert.match(subagentCss, /var\(--ui-focus-ring\)/);
});

test("subagent panel CSS defines reduced-motion behavior", () => {
  assert.match(subagentCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(glyphSource, /animateTransform/);
  assert.match(subagentCss, /\.statusGlyph\s*\{[^}]*animation:\s*subagentStatusSpin/);
  assert.match(
    subagentCss,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.statusGlyph\s*\{[^}]*animation:\s*none/,
  );
});

test("subagent panel contains no Inter font references", () => {
  assert.doesNotMatch(allSubagentSources, /\bInter\b/i);
  assert.doesNotMatch(subagentCss, /\bInter\b/i);
});

test("subagent panel geometry uses semantic tokens matching Codex", () => {
  assert.match(
    subagentCss,
    /\.detailAgentBadge\s*\{[^}]*font-size:\s*var\(--text-2xs\);/,
  );
  assert.match(
    subagentCss,
    /\.rowAgentBadge\s*\{[^}]*font-size:\s*var\(--text-2xs\);/,
  );
  assert.doesNotMatch(
    subagentCss,
    /\.(?:detailAgentBadge|rowAgentBadge)\s*\{[^}]*font-size:\s*8?\.?5?9px/,
  );
  assert.match(
    subagentCss,
    /\.subagentRow\s*\{[^}]*border-radius:\s*var\(--radius-lg\);[^}]*corner-shape:\s*var\(--corner-row\);/,
  );
  assert.doesNotMatch(
    subagentCss,
    /\.subagentRow\s*\{[^}]*border-radius:\s*7px;/,
  );
});
