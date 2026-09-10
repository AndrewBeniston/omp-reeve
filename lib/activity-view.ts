import type { SessionInfo } from "./types";

export const ACTIVITY_VIEW_STORAGE_KEY = "omp-web:activity-view";

export interface ActivityViewPreferences {
  showPriority: boolean;
  showPinned: boolean;
  showScheduled: boolean;
}

export interface ActivityViewState extends ActivityViewPreferences {
  open: boolean;
}

export const DEFAULT_ACTIVITY_VIEW_STATE: ActivityViewState = {
  open: false,
  showPriority: true,
  showPinned: false,
  showScheduled: false,
};

export type ActivityRelativeDay = "today" | "yesterday" | "weekday";

export interface ActivitySection {
  key: string;
  kind: "priority" | "pinned" | "recent";
  sessions: SessionInfo[];
  dayStart?: number;
  relativeDay?: ActivityRelativeDay;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function loadActivityViewState(storage?: StorageLike): ActivityViewState {
  if (!storage) return DEFAULT_ACTIVITY_VIEW_STATE;
  try {
    const raw = storage.getItem(ACTIVITY_VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_ACTIVITY_VIEW_STATE;
    const parsed = JSON.parse(raw) as Partial<ActivityViewState>;
    return {
      open: booleanOr(parsed.open, DEFAULT_ACTIVITY_VIEW_STATE.open),
      showPriority: booleanOr(parsed.showPriority, DEFAULT_ACTIVITY_VIEW_STATE.showPriority),
      showPinned: booleanOr(parsed.showPinned, DEFAULT_ACTIVITY_VIEW_STATE.showPinned),
      showScheduled: booleanOr(parsed.showScheduled, DEFAULT_ACTIVITY_VIEW_STATE.showScheduled),
    };
  } catch {
    return DEFAULT_ACTIVITY_VIEW_STATE;
  }
}

export function saveActivityViewState(state: ActivityViewState, storage?: StorageLike): void {
  if (!storage) return;
  try {
    if (JSON.stringify(state) === JSON.stringify(DEFAULT_ACTIVITY_VIEW_STATE)) {
      storage.removeItem(ACTIVITY_VIEW_STORAGE_KEY);
      return;
    }
    storage.setItem(ACTIVITY_VIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore unavailable storage and quota errors.
  }
}

function timestampOf(session: SessionInfo): number {
  const modified = Date.parse(session.modified);
  if (Number.isFinite(modified)) return modified;
  const created = Date.parse(session.created);
  return Number.isFinite(created) ? created : 0;
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function recentSectionFor(timestamp: number, todayStart: number): Pick<ActivitySection, "key" | "dayStart" | "relativeDay"> {
  const dayStart = startOfLocalDay(timestamp);
  const dayOffset = Math.round((todayStart - dayStart) / 86_400_000);
  return {
    key: `recent:${dayStart}`,
    dayStart,
    relativeDay: dayOffset === 0 ? "today" : dayOffset === 1 ? "yesterday" : "weekday",
  };
}

export function isPrioritySession(
  session: SessionInfo,
  runningSessionIds: ReadonlySet<string>,
  unreadSessionIds: ReadonlySet<string>,
): boolean {
  return runningSessionIds.has(session.id) || unreadSessionIds.has(session.id);
}

export function buildActivitySections({
  sessions,
  runningSessionIds,
  unreadSessionIds,
  preferences,
  now = new Date(),
}: {
  sessions: SessionInfo[];
  runningSessionIds: ReadonlySet<string>;
  unreadSessionIds: ReadonlySet<string>;
  preferences: ActivityViewPreferences;
  now?: Date;
}): ActivitySection[] {
  const sorted = [...sessions].sort((left, right) => timestampOf(right) - timestampOf(left));
  const priorityIds = new Set(
    preferences.showPriority
      ? sorted.filter((session) => isPrioritySession(session, runningSessionIds, unreadSessionIds)).map((session) => session.id)
      : [],
  );
  const pinnedIds = new Set(
    preferences.showPinned
      ? sorted.filter((session) => !priorityIds.has(session.id) && session.pinned).map((session) => session.id)
      : [],
  );
  const sections: ActivitySection[] = [];

  if (preferences.showPriority) {
    sections.push({
      key: "priority",
      kind: "priority",
      sessions: sorted.filter((session) => priorityIds.has(session.id)),
    });
  }

  if (preferences.showPinned && pinnedIds.size > 0) {
    sections.push({
      key: "pinned",
      kind: "pinned",
      sessions: sorted.filter((session) => pinnedIds.has(session.id)),
    });
  }

  const todayStart = startOfLocalDay(now.getTime());
  const recent = sorted.filter((session) => !priorityIds.has(session.id) && !pinnedIds.has(session.id));
  for (const session of recent) {
    const descriptor = recentSectionFor(timestampOf(session), todayStart);
    const existing = sections.at(-1);
    if (existing?.key === descriptor.key) {
      existing.sessions.push(session);
      continue;
    }
    sections.push({ ...descriptor, kind: "recent", sessions: [session] });
  }

  return sections;
}

export function activitySessionTitle(session: SessionInfo): string {
  return session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);
}

export function activityProjectName(session: SessionInfo, chatsLabel = "Chats"): string {
  const path = session.projectRoot ?? session.cwd;
  if (/[\\/]omp-cwd-\d{8}$/.test(path)) return chatsLabel;
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || path;
}
