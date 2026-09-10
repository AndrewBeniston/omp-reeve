import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_VIEW_STORAGE_KEY,
  DEFAULT_ACTIVITY_VIEW_STATE,
  activityProjectName,
  buildActivitySections,
  loadActivityViewState,
  saveActivityViewState,
} from "./activity-view.ts";

function session(id, modified, extra = {}) {
  return {
    path: `/sessions/${id}.jsonl`,
    id,
    cwd: `/projects/${extra.project ?? "alpha"}`,
    created: modified,
    modified,
    messageCount: 1,
    firstMessage: `${id} message`,
    ...extra,
  };
}

function preferences(extra = {}) {
  return { showPriority: true, showPinned: false, showScheduled: false, ...extra };
}

test("builds mutually exclusive Priority and chronological sections", () => {
  const sessions = [
    session("running", "2026-09-05T10:00:00Z"),
    session("unread", "2026-09-05T09:00:00Z"),
    session("today", "2026-09-05T08:00:00Z"),
    session("yesterday", "2026-09-04T08:00:00Z"),
    session("older", "2026-09-02T08:00:00Z"),
  ];

  const sections = buildActivitySections({
    sessions,
    runningSessionIds: new Set(["running"]),
    unreadSessionIds: new Set(["unread"]),
    preferences: preferences(),
    now: new Date("2026-09-05T12:00:00Z"),
  });

  assert.deepEqual(sections.map((section) => [section.kind, section.relativeDay, section.sessions.map(({ id }) => id)]), [
    ["priority", undefined, ["running", "unread"]],
    ["recent", "today", ["today"]],
    ["recent", "yesterday", ["yesterday"]],
    ["recent", "weekday", ["older"]],
  ]);
});

test("hidden Priority sessions return to their chronological day", () => {
  const sections = buildActivitySections({
    sessions: [session("running", "2026-09-05T10:00:00Z")],
    runningSessionIds: new Set(["running"]),
    unreadSessionIds: new Set(),
    preferences: preferences({ showPriority: false }),
    now: new Date("2026-09-05T12:00:00Z"),
  });

  assert.equal(sections.length, 1);
  assert.equal(sections[0].kind, "recent");
  assert.deepEqual(sections[0].sessions.map(({ id }) => id), ["running"]);
});

test("shown pinned chats are separated without duplicating Priority chats", () => {
  const sections = buildActivitySections({
    sessions: [
      session("priority-pinned", "2026-09-05T10:00:00Z", { pinned: true }),
      session("pinned", "2026-09-05T09:00:00Z", { pinned: true }),
    ],
    runningSessionIds: new Set(),
    unreadSessionIds: new Set(["priority-pinned"]),
    preferences: preferences({ showPinned: true }),
    now: new Date("2026-09-05T12:00:00Z"),
  });

  assert.deepEqual(sections.map((section) => [section.kind, section.sessions.map(({ id }) => id)]), [
    ["priority", ["priority-pinned"]],
    ["pinned", ["pinned"]],
  ]);
});

test("persists valid Activity choices and restores defaults after removal", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const changed = { open: true, showPriority: false, showPinned: true, showScheduled: false };

  saveActivityViewState(changed, storage);
  assert.deepEqual(loadActivityViewState(storage), changed);
  saveActivityViewState(DEFAULT_ACTIVITY_VIEW_STATE, storage);
  assert.equal(values.has(ACTIVITY_VIEW_STORAGE_KEY), false);
});

test("labels managed chats separately from project folders", () => {
  assert.equal(activityProjectName(session("chat", "2026-09-05T10:00:00Z", { cwd: "/Users/a/omp-cwd-20260905" })), "Chats");
  assert.equal(activityProjectName(session("work", "2026-09-05T10:00:00Z", { projectRoot: "/Users/a/omp-web" })), "omp-web");
});
