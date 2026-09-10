import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./navigation/navigation.module.css", import.meta.url), "utf8");

test("the Activity button replaces the project list and publishes its pressed state", () => {
  assert.match(source, /onClick=\{toggleActivityView\}/);
  assert.match(source, /aria-pressed=\{activityViewState\.open\}/);
  assert.match(source, /!activityViewState\.open && !loading/);
  assert.match(source, /activityViewState\.open && \(/);
});

test("the Activity view matches the Codex section and options contract", () => {
  assert.match(source, /activity\.prioritySection/);
  assert.match(source, /activity\.pinned/);
  assert.match(source, /activity\.scheduled/);
  assert.match(source, /activity\.markAllRead/);
  assert.match(source, /activity\.archiveChats/);
  assert.match(source, /new Intl\.DateTimeFormat\(undefined, \{ weekday: "long" \}\)/);
  assert.match(source, /<Menu[\s\S]*?triggerRef=\{activityOptionsButtonRef\}/);
  assert.match(source, /role="menuitemcheckbox"/);
  assert.doesNotMatch(source, /<AnimatedDropdown open=\{activityOptionsOpen\}/);
});

test("Priority archive stops running OMP sessions before archiving them", () => {
  assert.match(source, /runningSessionIds\.has\(session\.id\)\) await sendAgentCommand\(session\.id, \{ type: "abort" \}\)/);
  assert.match(source, /body: JSON\.stringify\(\{ archived: true \}\)/);
  assert.match(source, /<ActivityArchiveDialog/);
});

test("Activity rows show the chat title, project, and current state", () => {
  assert.match(source, /variant="activity"/);
  assert.match(source, /secondaryLabel=\{activityProjectName/);
  assert.match(source, /isRunning=\{runningSessionIds\.has\(session\.id\)\}/);
  assert.match(source, /isUnread=\{unreadSessionIds\.has\(session\.id\)\}/);
  assert.match(css, /\.activitySessionRow\s*\{[^}]*height:\s*52px;/);
  assert.match(css, /\.activitySessionProject\s*\{[^}]*font-size:\s*var\(--text-xs\);/);
});

test("the Activity menu stays above later sticky day headings", () => {
  assert.match(css, /\.activitySectionHeader:has\(\.activityOptionsButton\[data-open="true"\]\)\s*\{[^}]*z-index:\s*130;/);
  assert.match(css, /\.activityOptionsDropdown\s*\{[^}]*z-index:\s*120;/);
});

test("Activity headings share the sidebar surface without filled strips", () => {
  const headerRule = css.match(/\.activitySectionHeader\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(headerRule, /background\s*:/);
  assert.doesNotMatch(headerRule, /backdrop-filter\s*:/);
});

test("stored Activity and unread state loads after hydration", () => {
  assert.match(source, /useState<ActivityViewState>\(DEFAULT_ACTIVITY_VIEW_STATE\)/);
  assert.match(source, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(source, /if \(!activityViewStateLoaded\) return;/);
  assert.match(source, /if \(!unreadSessionIdsLoaded\) return;/);
});
