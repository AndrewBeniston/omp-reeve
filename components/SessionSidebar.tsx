"use client";
import { useShortcutLabel } from "@/hooks/useShortcutLabel";

import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { SessionInfo } from "@/lib/types";
import { loadCollapsedProjectIds, saveCollapsedProjectIds } from "@/lib/sidebar-disclosure-state";
import { dispatchSessionRowContextMenu } from "@/lib/session-row-context-menu";
import { hasDesktopProjectMenu, showDesktopProjectMenu } from "@/lib/desktop-project-menu";
import { hasDesktopSessionMenu, showDesktopSessionMenu } from "@/lib/desktop-session-menu";
import { skillExpansionToCommand } from "@/lib/slash-display";
import { applySavedProjectOrder, mergeVisibleProjectOrder } from "@/lib/project-order";
import {
  DEFAULT_ACTIVITY_VIEW_STATE,
  activityProjectName,
  activitySessionTitle,
  buildActivitySections,
  isPrioritySession,
  loadActivityViewState,
  saveActivityViewState,
  type ActivityViewState,
} from "@/lib/activity-view";
import { sendAgentCommand } from "@/lib/agent-client";
import { useI18n } from "@/hooks/useI18n";
import { DynamicStyleVars } from "@/components/ui/DynamicStyleVars";
import { Menu } from "@/components/ui/Menu";
import { NewSessionIcon, ProjectFolderIcon } from "./navigation/CodexIcons";
import { ProjectHoverCard, RichHoverCard, SessionHoverCard } from "./navigation/SidebarHoverCards";
import { SortableProjectList } from "./navigation/SortableProjectList";
import { ActivityArchiveDialog } from "./navigation/ActivityArchiveDialog";
import { DirectoryPicker } from "./DirectoryPicker";
import { ReeveWordmark } from "./ReeveWordmark";
import { SessionRenameDialog } from "./SessionRenameDialog";
import styles from "./navigation/navigation.module.css";

declare global {
  interface Window {
    ompDesktop?: {
      selectDirectory?: () => Promise<string | null>;
    };
  }
}

interface Props {
  selectedSessionId: string | null;
  optimisticSession?: SessionInfo | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  onNewProjectlessSession?: () => void;
  onQuickChat?: () => void;
  onSearch?: () => void;
  initialSessionId?: string | null;
  skipInitialProjectSelection?: boolean;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null, projectRoot?: string | null) => void;
  /** Fired when a session that is not currently selected finishes running.
   *  Lets the app play a cross-workspace completion tone. */
  onBackgroundTaskDone?: () => void;
  onSidebarToggle: () => void;
}

interface WorktreeEntry {
  path: string;
  branch: string | null;
  isMain: boolean;
}

interface WorktreeState {
  /** The cwd this data was fetched for — guards against stale responses */
  forCwd: string;
  projectRoot: string;
  repositoryLabel: string | null;
  isGit: boolean;
  /** False when forCwd is a repo subdirectory — the switcher is hidden there
   *  because subdir sessions keep their own project identity */
  isTopLevel: boolean;
  worktrees: WorktreeEntry[];
}

const UNREAD_SESSIONS_STORAGE_KEY = "omp-web:unread-session-ids";
const RUNNING_SESSIONS_POLL_MS = 2500;
const PROJECT_SESSION_LIMIT = 5;
const REMOVED_PROJECTS_STORAGE_KEY = "omp-web:removed-projects";

function normalizeProjectKey(project: string): string {
  const normalized = project.replace(/\\/g, "/");
  return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function isManagedChatCwd(cwd: string): boolean {
  return /[\\/]omp-cwd-\d{8}$/.test(cwd);
}

const PROJECTLESS_GROUP = "reeve:projectless-chats";

function sidebarProjectKey(path: string): string {
  return isManagedChatCwd(path) ? PROJECTLESS_GROUP : path;
}

function loadRemovedProjects(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(REMOVED_PROJECTS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((project): project is string => typeof project === "string").map(normalizeProjectKey))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveRemovedProjects(projects: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (projects.size === 0) window.localStorage.removeItem(REMOVED_PROJECTS_STORAGE_KEY);
    else window.localStorage.setItem(REMOVED_PROJECTS_STORAGE_KEY, JSON.stringify([...projects]));
  } catch {
    // Ignore storage quota and privacy-mode errors.
  }
}

function loadUnreadSessionIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(UNREAD_SESSIONS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((id): id is string => typeof id === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveUnreadSessionIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (ids.size === 0) window.localStorage.removeItem(UNREAD_SESSIONS_STORAGE_KEY);
    else window.localStorage.setItem(UNREAD_SESSIONS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage quota / privacy-mode errors
  }
}

/**
 * Return all projects (deduped by projectRoot so worktrees collapse into their
 * main repo) sorted by most recent session activity.
 */
export function getRecentProjects(sessions: SessionInfo[]): string[] {
  const latestByRoot = new Map<string, string>(); // projectRoot -> most recent modified
  for (const s of sessions) {
    const root = sidebarProjectKey(s.projectRoot ?? s.cwd);
    if (!root) continue;
    const prev = latestByRoot.get(root);
    if (!prev || s.modified > prev) {
      latestByRoot.set(root, s.modified);
    }
  }
  return [...latestByRoot.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([root]) => root);
}

/** Substitute the home dir prefix with ~ (no path truncation — see PathLabel) */
function displayCwd(cwd: string, homeDir?: string): string {
  return (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
}

/**
 * Path label that ellipsizes on the LEFT, keeping the (most relevant) trailing
 * segments visible: "…orkspace/omp-reeve". Shows as much of the path as fits
 * instead of a fixed number of segments. The rtl container moves the ellipsis
 * to the left edge; the inner plaintext bidi isolation keeps the path itself
 * rendered strictly left-to-right (no punctuation reordering).
 */
function PathLabel({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className ? `${styles.pathLabel} ${className}` : styles.pathLabel}>
      <span className={styles.pathLabelText}>{text}</span>
    </span>
  );
}

const DROPDOWN_ANIMATION_MS = 140;

function AnimatedDropdown({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    let frame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setMounted(true);
      setVisible(false);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timeout = setTimeout(() => setMounted(false), DROPDOWN_ANIMATION_MS);
    }

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={className ? `${styles.animatedDropdown} ${className}` : styles.animatedDropdown}
      data-visible={visible}
      data-open={open}
    >
      {children}
    </div>
  );
}

function ActivityCheckboxItem({
  label,
  checked,
  disabled = false,
  title,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      className={styles.activityMenuItem}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.activityMenuCheck} aria-hidden="true">
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="m2.25 6 2.25 2.25 5.25-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

interface SessionTreeNode {
  session: SessionInfo;
  children: SessionTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so we can resolve missing ancestors
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  // Walk up the parentSessionId chain to find the nearest ancestor that exists in byId
  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id);
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) return cur;
      cur = parentOf.get(cur);
    }
    return null;
  }

  const roots: SessionTreeNode[] = [];
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id);
    if (ancestor) {
      byId.get(ancestor)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => Number(Boolean(b.session.pinned)) - Number(Boolean(a.session.pinned))
      || b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

function useScramble(target: string, running: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setDisplay(target);
      return;
    }
    iterRef.current = 0;
    const totalFrames = target.length * 4;

    const step = () => {
      iterRef.current += 1;
      const progress = iterRef.current / totalFrames;
      const resolved = Math.floor(progress * target.length);

      setDisplay(
        target
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < resolved) return char;
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );

      if (iterRef.current < totalFrames) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, running]);

  return display;
}

function ReeveTitle() {
  const [showVersion, setShowVersion] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = showVersion ? `${process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}/${process.env.NEXT_PUBLIC_OMP_VERSION ?? "0.0.0"}` : "Reeve";
  const display = useScramble(target, scrambling);

  const triggerScramble = useCallback((toVersion: boolean) => {
    setShowVersion(toVersion);
    setScrambling(true);
    setTimeout(() => setScrambling(false), (toVersion ? 6 : 8) * 4 * (1000 / 60) + 100);
  }, []);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);

    const next = !showVersion;
    triggerScramble(next);

    if (next) {
      revertTimerRef.current = setTimeout(() => triggerScramble(false), 3000);
    }
  }, [showVersion, triggerScramble]);

  useEffect(() => () => { if (revertTimerRef.current) clearTimeout(revertTimerRef.current); }, []);

  return (
    <button
      onClick={handleClick}
      className={styles.wordmarkButton}
      data-version={showVersion}
    >
      <ReeveWordmark
        label={display}
        monospace={showVersion}
      />
    </button>
  );
}

export function SessionSidebar({ selectedSessionId, optimisticSession, onSelectSession, onNewSession, onNewProjectlessSession, onQuickChat, onSearch, initialSessionId, skipInitialProjectSelection, onInitialRestoreDone, refreshKey, selectedCwd: selectedCwdProp, onCwdChange, onBackgroundTaskDone, onSidebarToggle }: Props) {
  const shortcutLabel = useShortcutLabel();
  const { t } = useI18n();
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const sessionsForDisplay = useMemo(() => optimisticSession && !allSessions.some((session) => session.id === optimisticSession.id)
    ? [optimisticSession, ...allSessions]
    : allSessions, [allSessions, optimisticSession]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState("");
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => new Set());
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [projectHoverCard, setProjectHoverCard] = useState<{ project: string; anchor: HTMLElement } | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState<string | null>(null);
  const [removedProjects, setRemovedProjects] = useState<Set<string>>(() => new Set());
  const [projectOrder, setProjectOrder] = useState<string[]>([]);
  const [projectOrderError, setProjectOrderError] = useState<string | null>(null);
  const [wtFilter, setWtFilter] = useState("");
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customPathError, setCustomPathError] = useState<string | null>(null);
  const [customPathValidating, setCustomPathValidating] = useState(false);
  // Worktree switcher state
  const [worktreeState, setWorktreeState] = useState<WorktreeState | null>(null);
  const [wtDropdownOpen, setWtDropdownOpen] = useState(false);
  const [wtNewOpen, setWtNewOpen] = useState(false);
  const [wtNewBranch, setWtNewBranch] = useState("");
  const [wtError, setWtError] = useState<string | null>(null);
  const [wtBusy, setWtBusy] = useState(false);
  const [wtConfirmRemove, setWtConfirmRemove] = useState<string | null>(null);
  const wtDropdownRef = useRef<HTMLDivElement>(null);
  const wtNewInputRef = useRef<HTMLInputElement>(null);
  const [sessionRefreshDone, setSessionRefreshDone] = useState(false);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set());
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(() => new Set());
  const [unreadSessionIdsLoaded, setUnreadSessionIdsLoaded] = useState(false);
  const [activityViewState, setActivityViewState] = useState<ActivityViewState>(DEFAULT_ACTIVITY_VIEW_STATE);
  const [activityViewStateLoaded, setActivityViewStateLoaded] = useState(false);
  const [activityOptionsOpen, setActivityOptionsOpen] = useState(false);
  const [activityArchiveOpen, setActivityArchiveOpen] = useState(false);
  const [activityArchiveBusy, setActivityArchiveBusy] = useState(false);
  const [activityArchiveError, setActivityArchiveError] = useState<string | null>(null);
  const previousRunningSessionIdsRef = useRef<Set<string>>(new Set());
  // Once polling has delivered a snapshot it is the source of truth for
  // running state; late /api/sessions responses must not overwrite it.
  const runningPollAuthoritativeRef = useRef(false);
  const sessionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectSearchInputRef = useRef<HTMLInputElement>(null);
  const projectHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectOrderSaveRef = useRef<Promise<void>>(Promise.resolve());
  const activityOptionsRef = useRef<HTMLDivElement>(null);
  const activityOptionsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setCollapsedProjects(loadCollapsedProjectIds());
    setRemovedProjects(loadRemovedProjects());
    const savedUnreadSessionIds = loadUnreadSessionIds();
    setUnreadSessionIds((current) => new Set([...savedUnreadSessionIds, ...current]));
    setUnreadSessionIdsLoaded(true);
  }, []);

  useEffect(() => () => {
    if (projectHoverOpenTimerRef.current) clearTimeout(projectHoverOpenTimerRef.current);
    if (projectHoverCloseTimerRef.current) clearTimeout(projectHoverCloseTimerRef.current);
  }, []);

  const loadSessions = useCallback(async (showLoading = false, force = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch(force ? "/api/sessions?force=1" : "/api/sessions", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { sessions: SessionInfo[]; runningSessionIds?: string[]; projectOrder?: string[] };
      setAllSessions(data.sessions);
      if (data.projectOrder) setProjectOrder(data.projectOrder);
      // Treat the fetched running set as an initial fallback only. Once the
      // lightweight poll is live, a slow session-list fetch cannot overwrite it.
      if (!runningPollAuthoritativeRef.current) {
        setRunningSessionIds(new Set(data.runningSessionIds ?? []));
      }
      // Drop unread markers for sessions that no longer exist (e.g. deleted).
      const existingIds = new Set(data.sessions.map((s) => s.id));
      setUnreadSessionIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set([...prev].filter((id) => existingIds.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setError(null);
      if (!showLoading) {
        setSessionRefreshDone(true);
        if (sessionRefreshTimerRef.current) clearTimeout(sessionRefreshTimerRef.current);
        sessionRefreshTimerRef.current = setTimeout(() => setSessionRefreshDone(false), 2000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Refresh the active list after archive changes.
  const handleSessionArchived = useCallback(() => {
    loadSessions();
  }, [loadSessions]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst, !isFirst);
  }, [loadSessions, refreshKey]);

  // Persist unread markers so they survive a browser refresh before the user
  // has actually opened the completed session.
  useEffect(() => {
    if (!unreadSessionIdsLoaded) return;
    saveUnreadSessionIds(unreadSessionIds);
  }, [unreadSessionIds, unreadSessionIdsLoaded]);

  useEffect(() => {
    const saved = loadActivityViewState(window.localStorage);
    const debugOpen = new URLSearchParams(window.location?.search ?? "").get("activityDebug") === "1";
    setActivityViewState(debugOpen ? { ...saved, open: true } : saved);
    setActivityViewStateLoaded(true);
  }, []);

  useEffect(() => {
    if (!activityViewStateLoaded) return;
    saveActivityViewState(activityViewState, window.localStorage);
  }, [activityViewState, activityViewStateLoaded]);

  useEffect(() => {
    if (!activityOptionsOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!activityOptionsRef.current?.contains(event.target as Node)) setActivityOptionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivityOptionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [activityOptionsOpen]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      clearTimer();
      if (stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(() => void poll(), RUNNING_SESSIONS_POLL_MS);
    };

    const poll = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const current = new AbortController();
      controller?.abort();
      controller = current;
      try {
        const res = await fetch("/api/agent/running", {
          cache: "no-store",
          signal: current.signal,
        });
        if (!res.ok) return;
        const data = await res.json() as { runningSessionIds?: string[] };
        if (stopped || controller !== current) return;
        runningPollAuthoritativeRef.current = true;
        setRunningSessionIds(new Set(data.runningSessionIds ?? []));
      } catch {
        // Keep the last known state; the next visible-tab poll retries.
      } finally {
        if (controller === current) controller = null;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
        return;
      }
      clearTimer();
      controller?.abort();
      controller = null;
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const previous = previousRunningSessionIdsRef.current;
    const completedInBackground = [...previous].filter((id) => !runningSessionIds.has(id) && id !== selectedSessionId);
    const newlyRunning = [...runningSessionIds].filter((id) => !previous.has(id));

    if (completedInBackground.length > 0 || newlyRunning.length > 0) {
      setUnreadSessionIds((prev) => {
        const next = new Set(prev);
        runningSessionIds.forEach((id) => next.delete(id));
        completedInBackground.forEach((id) => next.add(id));
        return next;
      });
    }
    const hasUnlistedRunningSession = newlyRunning.some(
      (id) => !allSessions.some((session) => session.id === id),
    );
    if (completedInBackground.length > 0 || hasUnlistedRunningSession) {
      loadSessions(false, true);
    }
    if (completedInBackground.length > 0) {
      onBackgroundTaskDone?.();
    }

    previousRunningSessionIdsRef.current = runningSessionIds;
  }, [runningSessionIds, selectedSessionId, allSessions, loadSessions, onBackgroundTaskDone]);

  useEffect(() => {
    if (!selectedSessionId) return;
    setUnreadSessionIds((prev) => {
      if (!prev.has(selectedSessionId)) return prev;
      const next = new Set(prev);
      next.delete(selectedSessionId);
      return next;
    });
  }, [selectedSessionId]);

  const handleUnreadChange = useCallback((id: string, unread: boolean) => {
    setUnreadSessionIds((current) => {
      const next = new Set(current);
      if (unread) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetch("/api/home").then((r) => r.json()).then((d: { home?: string }) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
  }, []);

  const restoredRef = useRef(false);

  /** Resolve the project root for a cwd from the freshest data available */
  const projectRootFor = useCallback((cwd: string | null): string | null => {
    if (!cwd) return null;
    if (worktreeState && worktreeState.forCwd === cwd) return worktreeState.projectRoot;
    // Any path in the loaded worktree list belongs to that project — covers
    // worktrees without sessions, so switching to them keeps the row mounted.
    if (worktreeState?.worktrees.some((w) => w.path === cwd)) return worktreeState.projectRoot;
    const match = sessionsForDisplay.find((s) => s.cwd === cwd);
    return match?.projectRoot ?? cwd;
  }, [worktreeState, sessionsForDisplay]);

  // Notify parent only when the effective cwd actually changes (not when
  // projectRootFor identity changes due to session/worktree refreshes).
  const lastNotifiedCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastNotifiedCwdRef.current === selectedCwd) return;
    lastNotifiedCwdRef.current = selectedCwd;
    onCwdChange?.(selectedCwd, projectRootFor(selectedCwd));
  }, [selectedCwd, onCwdChange, projectRootFor]);

  // Sync the worktree switcher to the selected session's cwd. Sessions of all
  // worktrees in a project share one list, so clicking a session from another
  // worktree should move the effective cwd there. Only fires when the prop
  // value changes, so a manual switcher change is not snapped back.
  const lastSyncedCwdPropRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCwdProp && selectedCwdProp !== lastSyncedCwdPropRef.current) {
      lastSyncedCwdPropRef.current = selectedCwdProp;
      setSelectedCwd(selectedCwdProp);
    }
  }, [selectedCwdProp]);

  // Load worktrees for the current effective cwd
  const [wtRefreshKey, setWtRefreshKey] = useState(0);
  useLayoutEffect(() => {
    if (!selectedCwd) {
      setWorktreeState(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/worktrees?cwd=${encodeURIComponent(selectedCwd)}`)
      .then((r) => r.json())
      .then((d: { projectRoot?: string; repositoryLabel?: string | null; isGit?: boolean; isTopLevel?: boolean; worktrees?: WorktreeEntry[]; error?: string }) => {
        if (cancelled) return;
        if (d.error || !d.projectRoot) {
          setWorktreeState(null);
          return;
        }
        setWorktreeState({
          forCwd: selectedCwd,
          projectRoot: d.projectRoot,
          repositoryLabel: d.repositoryLabel ?? null,
          isGit: d.isGit ?? false,
          isTopLevel: d.isTopLevel ?? false,
          worktrees: d.worktrees ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) {
          setWorktreeState(null);
        }
      });
    return () => { cancelled = true; };
  }, [selectedCwd, wtRefreshKey, refreshKey]);

  // Restore a session only when the URL names it. A plain launch keeps the
  // home composer visible instead of selecting the newest project.
  useEffect(() => {
    if (allSessions.length === 0 || skipInitialProjectSelection) return;

    if (selectedCwd === null) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId && !restoredRef.current) {
        restoredRef.current = true;
        const target = allSessions.find((s) => s.id === initialSessionId);
        if (target) {
          setSelectedCwd(target.cwd);
          onSelectSession(target, true);
          return;
        }
        // Session not found — notify parent so it can show the placeholder
        onInitialRestoreDone?.();
      }
    }
  }, [allSessions, selectedCwd, initialSessionId, skipInitialProjectSelection, onSelectSession, onInitialRestoreDone]);

  const commitCustomPath = useCallback(async (candidate: string) => {
    const path = candidate.trim();
    if (!path || customPathValidating) return;

    setCustomPathValidating(true);
    setCustomPathError(null);
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: path }),
      });
      const data = await res.json().catch(() => ({})) as { cwd?: string; error?: string };
      if (!res.ok || data.error) {
        setCustomPathError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const selectedPath = data.cwd ?? path;
      setRemovedProjects((current) => {
        const key = normalizeProjectKey(selectedPath);
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        saveRemovedProjects(next);
        return next;
      });
      setSelectedCwd(selectedPath);
      setCustomPathOpen(false);
    } catch (error) {
      setCustomPathError(error instanceof Error ? error.message : String(error));
    } finally {
      setCustomPathValidating(false);
    }
  }, [customPathValidating]);

  const handleCustomPathClick = useCallback(async () => {
    setCustomPathError(null);
    const selectDirectory = window.ompDesktop?.selectDirectory;
    if (!selectDirectory) {
      setCustomPathOpen(true);
      return;
    }
    try {
      const path = await selectDirectory();
      if (path) await commitCustomPath(path);
    } catch (error) {
      setCustomPathError(error instanceof Error ? error.message : String(error));
      setCustomPathOpen(true);
    }
  }, [commitCustomPath]);

  const handleCreateWorktree = useCallback(async () => {
    const branch = wtNewBranch.trim();
    if (!branch || wtBusy || !worktreeState) return;
    setWtBusy(true);
    setWtError(null);
    try {
      const res = await fetch("/api/worktrees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: worktreeState.projectRoot, branch }),
      });
      const data = await res.json().catch(() => ({})) as { path?: string; error?: string };
      if (!res.ok || data.error || !data.path) {
        setWtError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setWtNewOpen(false);
      setWtNewBranch("");
      setWtDropdownOpen(false);
      // Optimistically register the new worktree so projectRootFor() resolves
      // it to the main repo before the refetch lands (keeps AppShell from
      // treating the new cwd as a different project).
      setWorktreeState((prev) => prev ? {
        ...prev,
        forCwd: data.path!,
        worktrees: [...prev.worktrees, { path: data.path!, branch, isMain: false }],
      } : prev);
      setSelectedCwd(data.path);
      setWtRefreshKey((k) => k + 1);
    } catch (e) {
      setWtError(e instanceof Error ? e.message : String(e));
    } finally {
      setWtBusy(false);
    }
  }, [wtNewBranch, wtBusy, worktreeState]);

  const handleRemoveWorktree = useCallback(async (path: string, force: boolean) => {
    if (!worktreeState || wtBusy) return;
    setWtBusy(true);
    setWtError(null);
    try {
      const res = await fetch("/api/worktrees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: worktreeState.projectRoot, path, force }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; dirty?: boolean };
      if (!res.ok) {
        if (data.dirty && !force) {
          // Dirty worktree — ask the user to confirm a force removal
          setWtConfirmRemove(path);
          return;
        }
        setWtError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setWtConfirmRemove(null);
      if (selectedCwd === path) setSelectedCwd(worktreeState.projectRoot);
      setWtRefreshKey((k) => k + 1);
    } catch (e) {
      setWtError(e instanceof Error ? e.message : String(e));
    } finally {
      setWtBusy(false);
    }
  }, [worktreeState, wtBusy, selectedCwd]);

  // Close the project actions menu on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wtDropdownRef.current && !wtDropdownRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(null);
        setWtDropdownOpen(false);
        setWtNewOpen(false);
        setWtNewBranch("");
        setWtError(null);
        setWtConfirmRemove(null);
        setWtFilter("");
        setHoveredProject(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Clicking a session moves the effective cwd to that session's worktree.
  // Done on the click path (not via the selectedCwd prop sync) so it also
  // works when the prop value won't change — e.g. re-clicking the already
  // open session after manually switching worktrees.
  const handleSelectSessionFromList = useCallback((s: SessionInfo) => {
    if (s.cwd) setSelectedCwd(s.cwd);
    onSelectSession(s);
  }, [onSelectSession]);

  const handleProjectSearchToggle = useCallback(() => {
    if (projectSearchOpen) {
      setProjectSearchOpen(false);
      setProjectFilter("");
      return;
    }
    setProjectSearchOpen(true);
    requestAnimationFrame(() => projectSearchInputRef.current?.focus());
  }, [projectSearchOpen]);

  const beginProjectHover = useCallback((project: string, anchor: HTMLElement) => {
    setHoveredProject(project);
    if (projectHoverCloseTimerRef.current) clearTimeout(projectHoverCloseTimerRef.current);
    if (projectHoverOpenTimerRef.current) clearTimeout(projectHoverOpenTimerRef.current);
    projectHoverOpenTimerRef.current = setTimeout(() => {
      setProjectHoverCard({ project, anchor });
    }, 500);
  }, []);

  const endProjectHover = useCallback((project: string) => {
    if (projectHoverOpenTimerRef.current) clearTimeout(projectHoverOpenTimerRef.current);
    setHoveredProject((current) => current === project && projectMenuOpen !== project ? null : current);
    projectHoverCloseTimerRef.current = setTimeout(() => {
      setProjectHoverCard((current) => current?.project === project ? null : current);
    }, 120);
  }, [projectMenuOpen]);

  const keepProjectHoverCard = useCallback(() => {
    if (projectHoverCloseTimerRef.current) clearTimeout(projectHoverCloseTimerRef.current);
  }, []);

  const toggleActivityView = useCallback(() => {
    setActivityViewState((current) => ({ ...current, open: !current.open }));
    setActivityOptionsOpen(false);
  }, []);

  const updateActivityViewState = useCallback((updates: Partial<ActivityViewState>) => {
    setActivityViewState((current) => ({ ...current, ...updates }));
  }, []);

  const handleNewSession = useCallback((project = selectedCwd) => {
    if (!project || project === PROJECTLESS_GROUP || isManagedChatCwd(project)) {
      onNewProjectlessSession?.();
      return;
    }
    // Generate a temporary UUID client-side — no backend call needed.
    // Pi will be spawned lazily when the user sends the first message.
    const tempId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setSelectedCwd(project);
    onNewSession?.(tempId, project);
  }, [selectedCwd, onNewSession, onNewProjectlessSession]);

  const toggleProjectCollapsed = useCallback((project: string) => {
    setCollapsedProjects((current) => {
      const next = new Set(current);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      saveCollapsedProjectIds(next);
      return next;
    });
  }, []);

  // Codex desktop: a press on the project name only opens or closes the group.
  // It never changes the Session. New uses the current Session's Project, and the
  // per-Project New Session action passes its own Project.
  const handleProjectPress = useCallback((project: string) => {
    toggleProjectCollapsed(project);
  }, [toggleProjectCollapsed]);

  const selectedProjectPath = projectRootFor(selectedCwd);
  const selectedProject = selectedProjectPath ? sidebarProjectKey(selectedProjectPath) : null;
  const discoveredProjectPaths = getRecentProjects(sessionsForDisplay)
    .filter((project) => !removedProjects.has(normalizeProjectKey(project)));
  if (selectedProject && !removedProjects.has(normalizeProjectKey(selectedProject)) && !discoveredProjectPaths.includes(selectedProject)) {
    discoveredProjectPaths.unshift(selectedProject);
  }
  const projectPaths = applySavedProjectOrder(discoveredProjectPaths, projectOrder);
  const handleRemoveProject = (project: string) => {
    const key = normalizeProjectKey(project);
    setRemovedProjects((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      saveRemovedProjects(next);
      return next;
    });
    setProjectMenuOpen(null);
    setWtDropdownOpen(false);
    setWtNewOpen(false);
    setWtNewBranch("");
    setWtError(null);
    setWtConfirmRemove(null);
    setWtFilter("");
    if (selectedProject && normalizeProjectKey(selectedProject) === key) {
      setSelectedCwd(null);
    }
  };

  const handleArchiveProjectChats = async (sessions: SessionInfo[]) => {
    const archiveable = sessions.filter((session) => !session.transient);
    if (archiveable.length === 0) return;
    const responses = await Promise.all(archiveable.map((session) => fetch(
      `/api/sessions/${encodeURIComponent(session.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      },
    )));
    if (responses.some((response) => !response.ok)) {
      setError(t("sidebar.archiveProjectFailed"));
      return;
    }
    const archivedIds = new Set(archiveable.map((session) => session.id));
    setUnreadSessionIds((current) => {
      const next = new Set([...current].filter((id) => !archivedIds.has(id)));
      return next.size === current.size ? current : next;
    });
    handleSessionArchived();
  };

  const handleProjectMenu = async (
    event: React.MouseEvent<HTMLElement>,
    project: string,
    sessions: SessionInfo[],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (projectHoverOpenTimerRef.current) clearTimeout(projectHoverOpenTimerRef.current);
    if (projectHoverCloseTimerRef.current) clearTimeout(projectHoverCloseTimerRef.current);
    setProjectHoverCard(null);

    if (!hasDesktopProjectMenu()) {
      const nextOpen = projectMenuOpen === project ? null : project;
      setProjectMenuOpen(nextOpen);
      setWtDropdownOpen(false);
      setWtNewOpen(false);
      setWtError(null);
      if (selectedProject !== project) setSelectedCwd(project);
      return;
    }

    setProjectMenuOpen(null);
    if (selectedProject !== project) setSelectedCwd(project);
    const projectWorktrees = worktreeState?.projectRoot === project && worktreeState.isTopLevel
      ? worktreeState.worktrees
      : [];
    const action = await showDesktopProjectMenu({
      archiveEnabled: sessions.some((session) => !session.transient),
      worktrees: projectWorktrees.map((worktree) => ({
        label: worktree.branch ?? displayCwd(worktree.path, homeDir),
        current: worktree.path === selectedCwd,
      })),
    });
    if (!action) return;
    if (action.type === "archive-chats") await handleArchiveProjectChats(sessions);
    if (action.type === "remove-project") handleRemoveProject(project);
    if (action.type === "select-worktree") {
      const worktree = projectWorktrees[action.index];
      if (worktree) setSelectedCwd(worktree.path);
    }
  };

  const sessionsByProject = new Map<string, SessionInfo[]>();
  for (const session of sessionsForDisplay) {
    const project = sidebarProjectKey(session.projectRoot ?? session.cwd);
    if (!project) continue;
    const projectSessions = sessionsByProject.get(project);
    if (projectSessions) projectSessions.push(session);
    else sessionsByProject.set(project, [session]);
  }

  // Per-project activity counts (running / unread) for the project rows, keyed
  // the same way as getRecentProjects (projectRoot ?? cwd). Small data set —
  // cheap to recompute.
  const projectActivity = useMemo(() => {
    const counts = new Map<string, { running: number; unread: number }>();
    for (const session of sessionsForDisplay) {
      const key = sidebarProjectKey(session.projectRoot ?? session.cwd);
      if (!key) continue;
      let entry = counts.get(key);
      if (!entry) { entry = { running: 0, unread: 0 }; counts.set(key, entry); }
      if (runningSessionIds.has(session.id)) entry.running++;
      if (unreadSessionIds.has(session.id)) entry.unread++;
    }
    return counts;
  }, [sessionsForDisplay, runningSessionIds, unreadSessionIds]);

  const normalizedProjectFilter = projectFilter.trim().toLowerCase();
  const projectGroups = projectPaths.flatMap((project) => {
    const segments = project.replace(/[\\/]+$/, "").split(/[\\/]/);
    const name = project === PROJECTLESS_GROUP ? t("workspace.chats") : segments.at(-1) || project;
    const sessions = sessionsByProject.get(project) ?? [];
    if (!normalizedProjectFilter) return [{ project, name, sessions }];

    const projectMatches = name.toLowerCase().includes(normalizedProjectFilter);
    const matchingSessions = sessions.filter((session) => {
      const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);
      return title.toLowerCase().includes(normalizedProjectFilter);
    });
    if (!projectMatches && matchingSessions.length === 0) return [];
    return [{ project, name, sessions: projectMatches ? sessions : matchingSessions }];
  });

  const activitySessions = useMemo(() => {
    if (!normalizedProjectFilter) return sessionsForDisplay;
    return sessionsForDisplay.filter((session) => {
      const title = activitySessionTitle(session).toLowerCase();
      const project = activityProjectName(session, t("workspace.chats")).toLowerCase();
      return title.includes(normalizedProjectFilter) || project.includes(normalizedProjectFilter);
    });
  }, [normalizedProjectFilter, sessionsForDisplay, t]);

  const activitySections = useMemo(() => buildActivitySections({
    sessions: activitySessions,
    runningSessionIds,
    unreadSessionIds,
    preferences: activityViewState,
  }), [activitySessions, activityViewState, runningSessionIds, unreadSessionIds]);

  const prioritySessions = useMemo(() => sessionsForDisplay.filter((session) => (
    isPrioritySession(session, runningSessionIds, unreadSessionIds)
  )), [runningSessionIds, sessionsForDisplay, unreadSessionIds]);

  const archiveablePrioritySessions = prioritySessions.filter((session) => !session.transient);
  const priorityIncludesRunning = archiveablePrioritySessions.some((session) => runningSessionIds.has(session.id));

  const markAllPriorityRead = useCallback(() => {
    const priorityIds = new Set(prioritySessions.map((session) => session.id));
    setUnreadSessionIds((current) => {
      const next = new Set([...current].filter((id) => !priorityIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setActivityOptionsOpen(false);
  }, [prioritySessions]);

  const confirmArchivePriority = useCallback(async () => {
    setActivityArchiveBusy(true);
    setActivityArchiveError(null);
    const results = await Promise.all(archiveablePrioritySessions.map(async (session) => {
      try {
        if (runningSessionIds.has(session.id)) await sendAgentCommand(session.id, { type: "abort" });
        const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        });
        return { id: session.id, success: response.ok };
      } catch {
        return { id: session.id, success: false };
      }
    }));
    const succeededIds = new Set(results.filter(({ success }) => success).map(({ id }) => id));
    const failedCount = results.length - succeededIds.size;
    setUnreadSessionIds((current) => {
      const next = new Set([...current].filter((id) => !succeededIds.has(id)));
      return next.size === current.size ? current : next;
    });
    await loadSessions(false, true);
    setActivityArchiveBusy(false);
    if (failedCount > 0) {
      setActivityArchiveError(`Archived ${succeededIds.size}; ${failedCount} could not be archived.`);
      return;
    }
    setActivityArchiveOpen(false);
  }, [archiveablePrioritySessions, loadSessions, runningSessionIds]);

  const handleProjectOrderChange = (nextVisibleOrder: string[]) => {
    const previousOrder = projectOrder;
    const previousVisibleOrder = projectGroups.map(({ project }) => project);
    const nextOrder = mergeVisibleProjectOrder(projectPaths, previousVisibleOrder, nextVisibleOrder);
    setProjectOrder(nextOrder);
    setProjectOrderError(null);
    const save = projectOrderSaveRef.current.catch(() => {}).then(async () => {
      const response = await fetch("/api/sidebar/project-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectOrder: nextOrder }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    });
    projectOrderSaveRef.current = save;
    void save.catch(() => {
      setProjectOrder((current) => current === nextOrder ? previousOrder : current);
      setProjectOrderError(t("sidebar.saveProjectOrderFailed"));
    });
  };

  const handleProjectDragStateChange = (project: string | null) => {
    if (!project) return;
    if (projectHoverOpenTimerRef.current) clearTimeout(projectHoverOpenTimerRef.current);
    if (projectHoverCloseTimerRef.current) clearTimeout(projectHoverCloseTimerRef.current);
    setProjectHoverCard(null);
    setHoveredProject(null);
  };

  const showWorktreeSwitcher = Boolean(
    worktreeState?.isGit
    && worktreeState.isTopLevel
    && selectedCwd
    && selectedProject === worktreeState.projectRoot
  );
  const currentWt = worktreeState?.worktrees.find((worktree) => worktree.path === selectedCwd)
    ?? worktreeState?.worktrees.find((worktree) => worktree.isMain);
  const showWtFilter = (worktreeState?.worktrees.length ?? 0) >= 8;
  const visibleWorktrees = showWtFilter && wtFilter.trim()
    ? (worktreeState?.worktrees ?? []).filter((worktree) =>
        (worktree.branch ?? displayCwd(worktree.path, homeDir)).toLowerCase().includes(wtFilter.trim().toLowerCase()))
    : (worktreeState?.worktrees ?? []);

  const activityDefaultsChanged = activityViewState.showPriority !== DEFAULT_ACTIVITY_VIEW_STATE.showPriority
    || activityViewState.showPinned !== DEFAULT_ACTIVITY_VIEW_STATE.showPinned
    || activityViewState.showScheduled !== DEFAULT_ACTIVITY_VIEW_STATE.showScheduled;
  const unreadPriorityCount = prioritySessions.filter((session) => unreadSessionIds.has(session.id)).length;
  const activityOptionsControl = (
    <div ref={activityOptionsRef} className={styles.activityOptionsWrapper}>
      <button
        ref={activityOptionsButtonRef}
        type="button"
        className={styles.activityOptionsButton}
        title={t("activity.options")}
        aria-label={t("activity.options")}
        aria-haspopup="menu"
        aria-expanded={activityOptionsOpen}
        data-open={activityOptionsOpen}
        onClick={() => setActivityOptionsOpen((open) => !open)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="7" r="1.1" />
          <circle cx="7" cy="7" r="1.1" />
          <circle cx="11" cy="7" r="1.1" />
        </svg>
      </button>
      <Menu
        open={activityOptionsOpen}
        label={t("activity.options")}
        onClose={() => setActivityOptionsOpen(false)}
        triggerRef={activityOptionsButtonRef}
        surface="plain"
        className={styles.activityOptionsDropdown}
      >
          <div className={styles.activityMenuLabelRow}>
            <span>{t("activity.show")}</span>
            {activityDefaultsChanged ? (
              <button
                type="button"
                className={styles.activityRestoreButton}
                title={t("activity.restoreDefaults")}
                aria-label={t("activity.restoreDefaults")}
                onClick={() => updateActivityViewState({
                  showPriority: DEFAULT_ACTIVITY_VIEW_STATE.showPriority,
                  showPinned: DEFAULT_ACTIVITY_VIEW_STATE.showPinned,
                  showScheduled: DEFAULT_ACTIVITY_VIEW_STATE.showScheduled,
                })}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            ) : null}
          </div>
          <ActivityCheckboxItem
            label={t("activity.prioritySection")}
            checked={activityViewState.showPriority}
            onChange={(showPriority) => updateActivityViewState({ showPriority })}
          />
          <ActivityCheckboxItem
            label={t("activity.pinned")}
            checked={activityViewState.showPinned}
            onChange={(showPinned) => updateActivityViewState({ showPinned })}
          />
          <ActivityCheckboxItem
            label={t("activity.scheduled")}
            checked={activityViewState.showScheduled}
            disabled
            title={t("activity.scheduledUnavailable")}
            onChange={(showScheduled) => updateActivityViewState({ showScheduled })}
          />
          <div className={styles.activityMenuSeparator} />
          <button
            type="button"
            role="menuitem"
            className={styles.activityMenuItem}
            disabled={unreadPriorityCount === 0}
            onClick={markAllPriorityRead}
          >
            <span className={styles.activityMenuCheck} aria-hidden="true" />
            <span>{t("activity.markAllRead")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.activityMenuItem}
            disabled={archiveablePrioritySessions.length === 0}
            onClick={() => {
              setActivityOptionsOpen(false);
              setActivityArchiveError(null);
              setActivityArchiveOpen(true);
            }}
          >
            <span className={styles.activityMenuCheck} aria-hidden="true" />
            <span>{t("activity.archiveChats")}</span>
          </button>
      </Menu>
    </div>
  );

  return (
    <div className={styles.sidebarContainer}>
      {activityArchiveOpen ? (
        <ActivityArchiveDialog
          count={archiveablePrioritySessions.length}
          includesRunning={priorityIncludesRunning}
          busy={activityArchiveBusy}
          error={activityArchiveError}
          onCancel={() => {
            if (activityArchiveBusy) return;
            setActivityArchiveOpen(false);
            setActivityArchiveError(null);
          }}
          onConfirm={() => void confirmArchivePriority()}
        />
      ) : null}
      {customPathOpen && (
        <DirectoryPicker
          busy={customPathValidating}
          error={customPathError}
          onCancel={() => {
            setCustomPathOpen(false);
            setCustomPathError(null);
          }}
          onSelect={(path) => void commitCustomPath(path)}
        />
      )}

      <div className={styles.desktopTitleBar}>
        <button
          type="button"
          className={styles.desktopSidebarToggle}
          onClick={onSidebarToggle}
          title={t("sidebar.hide")}
          aria-label={t("sidebar.hide")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.desktopHistoryButton}
          onClick={() => window.history.back()}
          title={t("sidebar.back")}
          aria-label={t("sidebar.back")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.desktopHistoryButton}
          onClick={() => window.history.forward()}
          title={t("sidebar.forward")}
          aria-label={t("sidebar.forward")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarHeaderRow}>
          <div className={styles.sidebarIdentity}>
            <ReeveTitle />
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4 5.5 3 3 3-3" />
            </svg>
          </div>
          <div className={styles.sidebarHeaderActions}>
            <button
              type="button"
              className={styles.sidebarSearchButton}
              onClick={onSearch ?? handleProjectSearchToggle}
              title={t("sidebar.searchProjectsAndSessions")}
              aria-label={t("sidebar.searchProjectsAndSessions")}
              aria-expanded={onSearch ? undefined : projectSearchOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.sidebarNotificationsButton}
              onClick={toggleActivityView}
              title={activityViewState.open
                ? t("activity.close")
                : prioritySessions.length > 0 ? t("activity.needsAttention") : t("activity.open")}
              aria-label={activityViewState.open
                ? t("activity.close")
                : prioritySessions.length > 0 ? t("activity.needsAttention") : t("activity.open")}
              aria-pressed={activityViewState.open}
              data-open={activityViewState.open}
              data-unread={unreadSessionIds.size > 0}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              <span className={styles.notificationDot} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.newSessionRow}>
        <button
          className={styles.newSessionButton}
          onClick={() => handleNewSession()}
          disabled={!selectedCwd && !onNewProjectlessSession}
          title={selectedCwd ? t("sidebar.newSessionTitle", { path: selectedCwd }) : t("workspace.newChat")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
          <span>{t("sidebar.newChat")}</span>
        </button>
        {onQuickChat && <button type="button" className={styles.quickChatButton} onClick={onQuickChat}
          title={`${t("quickChat.title")} (${shortcutLabel("N", true)})`} aria-label={t("quickChat.title")}>
          <NewSessionIcon />
        </button>}
      </div>

      {!activityViewState.open ? (
        <div className={styles.projectsHeader}>
          <h2 className={styles.projectsTitle}>
            {t("sidebar.projects")}
          </h2>
          <div className={styles.projectsHeaderActions}>
            <button
              className={styles.refreshSessionsButton}
              data-complete={sessionRefreshDone}
              onClick={() => loadSessions(false, true)}
              title={t("sidebar.refresh")}
              aria-label={t("sidebar.refresh")}
            >
              {sessionRefreshDone ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ui-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </button>
            <button
              className={styles.addProjectButton}
              type="button"
              onClick={() => void handleCustomPathClick()}
              title={t("sidebar.addProject")}
              aria-label={t("sidebar.addProject")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
                <path d="M15.5 10.5v5M13 13h5" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
      <label className={styles.projectSearchLabel} data-open={projectSearchOpen}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className={styles.projectSearchIcon}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={projectSearchInputRef}
          type="search"
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setProjectFilter("");
              setProjectSearchOpen(false);
              event.currentTarget.blur();
            }
          }}
          placeholder={t("sidebar.searchProjectsAndSessions")}
          aria-label={t("sidebar.searchProjectsAndSessions")}
          className={styles.projectSearchInput}
        />
      </label>

      <div className={styles.projectsList}>
        {loading && (
          <div className={styles.sidebarNotice}>
            {t("sidebar.loading")}
          </div>
        )}
        {error && (
          <div className={`${styles.sidebarNotice} ${styles.sidebarNoticeError}`}>
            {error}
          </div>
        )}
        {!activityViewState.open && projectOrderError && (
          <div className={`${styles.sidebarNotice} ${styles.sidebarNoticeError}`}>
            {projectOrderError}
          </div>
        )}
        {!loading && !error && activityViewState.open && (
          <div className={styles.activityView} role="list" aria-label={t("activity.open")}>
            {activitySections.length === 0 ? (
              <section className={styles.activitySection}>
                <div className={styles.activitySectionHeader}>
                  <h2 className={styles.activitySectionTitle}>{t("activity.today")}</h2>
                  {activityOptionsControl}
                </div>
                <div className={styles.activityEmpty}>
                  {normalizedProjectFilter ? t("activity.noMatches") : t("activity.empty")}
                </div>
              </section>
            ) : activitySections.map((section, index) => {
              const title = section.kind === "priority"
                ? t("activity.priority")
                : section.kind === "pinned"
                  ? t("activity.pinned")
                  : section.relativeDay === "today"
                    ? t("activity.today")
                    : section.relativeDay === "yesterday"
                      ? t("activity.yesterday")
                      : new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(section.dayStart);
              const showOptions = section.kind === "priority" || (!activityViewState.showPriority && index === 0);
              return (
                <section key={section.key} className={styles.activitySection}>
                  <div className={styles.activitySectionHeader}>
                    <h2 className={styles.activitySectionTitle}>{title}</h2>
                    {showOptions ? activityOptionsControl : null}
                  </div>
                  {section.kind === "priority" && section.sessions.length === 0 ? (
                    <div className={styles.activityEmpty}>
                      {normalizedProjectFilter ? t("activity.noMatches") : t("activity.empty")}
                    </div>
                  ) : null}
                  {section.sessions.map((session) => (
                    <div key={session.id} role="listitem">
                      <SessionItem
                        session={session}
                        variant="activity"
                        secondaryLabel={activityProjectName(session, t("workspace.chats"))}
                        isSelected={session.id === selectedSessionId}
                        isRunning={runningSessionIds.has(session.id)}
                        isUnread={unreadSessionIds.has(session.id)}
                        onClick={() => handleSelectSessionFromList(session)}
                        onRenamed={() => loadSessions(false, true)}
                        onUnreadChange={handleUnreadChange}
                        onArchived={handleSessionArchived}
                        homeDir={homeDir}
                      />
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        )}
        {!activityViewState.open && !loading && !error && projectGroups.length === 0 && (
          <div className={styles.sidebarNotice}>
            {normalizedProjectFilter ? t("sidebar.noMatchingProjects") : t("sidebar.noSessions")}
          </div>
        )}
        {!activityViewState.open && !loading && !error && (
          <SortableProjectList
            items={projectGroups}
            getId={({ project }) => project}
            getLabel={({ name }) => name}
            getIcon={({ project }) => (
              <ProjectFolderIcon open={!(collapsedProjects.has(project) && !normalizedProjectFilter)} />
            )}
            onOrderChange={handleProjectOrderChange}
            onDragStateChange={handleProjectDragStateChange}
          >
          {({ project, name, sessions }, dragHandle) => {
          const isSelectedProject = project === selectedProject;
          const isCollapsed = collapsedProjects.has(project) && !normalizedProjectFilter;
          const isExpanded = expandedProjects.has(project);
          const visibleSessionsForProject = isExpanded ? sessions : sessions.slice(0, PROJECT_SESSION_LIMIT);
          const sessionTree = buildSessionTree(visibleSessionsForProject);
          const showMore = sessions.length > PROJECT_SESSION_LIMIT;
          const disclosureId = `project-disclosure-${encodeURIComponent(project)}`;
          const projectRepositoryLabel = sessions.find((session) => session.repositoryLabel)?.repositoryLabel
            ?? (worktreeState?.projectRoot === project ? worktreeState.repositoryLabel ?? undefined : undefined);

          return (
            <section key={project} className={styles.projectSection} data-collapsed={isCollapsed}>
              <div
                ref={projectMenuOpen === project ? wtDropdownRef : undefined}
                onContextMenu={(event) => {
                  if (project === PROJECTLESS_GROUP) { event.preventDefault(); return; }
                  void handleProjectMenu(event, project, sessions);
                }}
                onMouseEnter={(event) => { if (project !== PROJECTLESS_GROUP) beginProjectHover(project, event.currentTarget); }}
                onMouseLeave={() => endProjectHover(project)}
                className={styles.projectRow}
                data-selected={isSelectedProject}
              >
                <button
                  id={`${disclosureId}-trigger`}
                  type="button"
                  onClick={() => handleProjectPress(project)}
                  aria-label={project === PROJECTLESS_GROUP ? t("workspace.chats") : project}
                  aria-expanded={!isCollapsed}
                  aria-controls={`${disclosureId}-region`}
                  className={styles.projectSelectButton}
                  data-selected={isSelectedProject}
                  {...dragHandle.attributes}
                >
                  <span className={styles.projectFolderIconBox}>
                    <ProjectFolderIcon open={!isCollapsed} />
                  </span>
                  <span
                    ref={dragHandle.setActivatorNodeRef}
                    className={styles.projectDragHandle}
                    data-project-drag-handle="true"
                    {...dragHandle.listeners}
                  >
                    <span className={styles.projectName}>{name}</span>
                    {showProjectActivity(projectActivity.get(project), t)}
                  </span>
                </button>

                <button
                  className={styles.projectNewSessionButton}
                  data-visible={project === PROJECTLESS_GROUP || hoveredProject === project}
                  data-projectless={project === PROJECTLESS_GROUP}
                  type="button"
                  onClick={() => handleNewSession(project)}
                  title={project === PROJECTLESS_GROUP ? t("sidebar.newChat") : t("sidebar.newSessionTitle", { path: project })}
                  aria-label={project === PROJECTLESS_GROUP ? t("sidebar.newChat") : t("sidebar.newSessionTitle", { path: project })}
                  onFocus={(event) => { if (project !== PROJECTLESS_GROUP) beginProjectHover(project, event.currentTarget.parentElement ?? event.currentTarget); }}
                >
                  <NewSessionIcon />
                </button>
                <div className={styles.projectMenuWrapper} hidden={project === PROJECTLESS_GROUP}>
                  <button
                    type="button"
                    onClick={(event) => void handleProjectMenu(event, project, sessions)}
                    title={t("sidebar.projectActions")}
                    aria-label={t("sidebar.projectActions")}
                    aria-expanded={projectMenuOpen === project}
                    className={styles.projectMenuButton}
                    data-visible={hoveredProject === project || projectMenuOpen === project}
                    data-open={projectMenuOpen === project}
                    data-worktree={isSelectedProject && currentWt && !currentWt.isMain}
                    onFocus={(event) => beginProjectHover(project, event.currentTarget.closest(`.${styles.projectRow}`) as HTMLElement ?? event.currentTarget)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                      <circle cx="3" cy="7" r="1.1" />
                      <circle cx="7" cy="7" r="1.1" />
                      <circle cx="11" cy="7" r="1.1" />
                    </svg>
                  </button>
                  <AnimatedDropdown
                    open={projectMenuOpen === project}
                    className={styles.projectMenuDropdown}
                  >
                    {showWorktreeSwitcher && worktreeState && (
                      <>
                        <button
                          type="button"
                          onClick={() => setWtDropdownOpen((open) => !open)}
                          title={currentWt ? t("sidebar.switchWorktreeTitle", { path: currentWt.path }) : t("sidebar.switchWorktree")}
                          aria-label={t("sidebar.worktrees")}
                          aria-expanded={wtDropdownOpen}
                          className={styles.worktreeToggle}
                          data-open={wtDropdownOpen}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="6" y1="3" x2="6" y2="15" />
                            <circle cx="18" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <path d="M18 9a9 9 0 0 1-9 9" />
                          </svg>
                          <span className={styles.worktreeToggleLabel}>{t("sidebar.worktrees")}</span>
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="4 2.5 8 6 4 9.5" />
                          </svg>
                        </button>
                        <AnimatedDropdown
                          open={wtDropdownOpen}
                          className={styles.worktreeSubDropdown}
                        >
                          {showWtFilter && (
                            <div className={styles.worktreeFilterContainer}>
                              <input
                                value={wtFilter}
                                onChange={(e) => setWtFilter(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setWtFilter("");
                                    setWtDropdownOpen(false);
                                  }
                                }}
                                placeholder={t("sidebar.filterWorktrees")}
                                autoFocus
                                className={styles.worktreeFilterInput}
                              />
                            </div>
                          )}
                          <div className={styles.worktreeList}>
                            {visibleWorktrees.map((wt) => {
                              const isCurrent = wt.path === selectedCwd || (wt.isMain && !worktreeState.worktrees.some((w) => w.path === selectedCwd));
                              if (wtConfirmRemove === wt.path) {
                                return (
                                  <div key={wt.path} className={styles.worktreeConfirmRow}>
                                    <span className={styles.worktreeConfirmText}>
                                      {t("sidebar.forceRemoveCheckout")}
                                    </span>
                                    <button
                                      onClick={() => void handleRemoveWorktree(wt.path, true)}
                                      disabled={wtBusy}
                                      className={styles.worktreeForceButton}
                                    >
                                      {t("sidebar.force")}
                                    </button>
                                    <button
                                      onClick={() => setWtConfirmRemove(null)}
                                      className={styles.worktreeCancelButton}
                                    >
                                      {t("sidebar.cancel")}
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={wt.path}
                                  className={styles.worktreeRow}
                                >
                                  <button
                                    onClick={() => {
                                      setSelectedCwd(wt.path);
                                      setWtDropdownOpen(false);
                                      setWtError(null);
                                      setWtFilter("");
                                    }}
                                    title={wt.path}
                                    className={styles.worktreeSelectButton}
                                    data-current={isCurrent}
                                  >
                                    {isCurrent ? (
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.worktreeCheckIcon}>
                                        <polyline points="1.5 5 4 7.5 8.5 2.5" />
                                      </svg>
                                    ) : (
                                      <span className={styles.worktreeSpacer} />
                                    )}
                                    <PathLabel text={wt.branch ?? displayCwd(wt.path, homeDir)} className={styles.worktreePathLabel} />
                                    {wt.isMain && <span className={styles.worktreeMainTag}>{t("sidebar.main")}</span>}
                                  </button>
                                  {!wt.isMain && (
                                    <button
                                      className={styles.worktreeRemoveButton}
                                      onClick={() => void handleRemoveWorktree(wt.path, false)}
                                      disabled={wtBusy}
                                      title={t("sidebar.removeWorktreeTitle", { path: wt.path })}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        <path d="M10 11v6M14 11v6" />
                                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            {showWtFilter && visibleWorktrees.length === 0 && wtFilter.trim() && (
                              <div className={styles.worktreeEmpty}>{t("sidebar.noMatchingWorktrees")}</div>
                            )}
                          </div>

                          {!wtNewOpen ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setWtNewOpen(true);
                                setWtError(null);
                                setTimeout(() => wtNewInputRef.current?.focus(), 0);
                              }}
                              title={t("sidebar.createWorktreeTitle")}
                              className={styles.worktreeNewButton}
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" className={styles.worktreeCheckIcon}>
                                <line x1="5" y1="1" x2="5" y2="9" />
                                <line x1="1" y1="5" x2="9" y2="5" />
                              </svg>
                              <span>{t("sidebar.newWorktree")}</span>
                            </button>
                          ) : (
                            <div className={styles.worktreeNewForm}>
                              <input
                                ref={wtNewInputRef}
                                value={wtNewBranch}
                                onChange={(e) => {
                                  setWtNewBranch(e.target.value);
                                  setWtError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleCreateWorktree();
                                  }
                                  if (e.key === "Escape") {
                                    setWtNewOpen(false);
                                    setWtNewBranch("");
                                    setWtError(null);
                                  }
                                }}
                                placeholder={t("sidebar.branchName")}
                                className={styles.worktreeNewInput}
                              />
                              <div className={styles.worktreeNewActions}>
                                <button
                                  onClick={() => void handleCreateWorktree()}
                                  disabled={wtBusy || !wtNewBranch.trim()}
                                  className={styles.worktreeCreateButton}
                                >
                                  {wtBusy ? t("sidebar.creating") : t("sidebar.create")}
                                </button>
                                <button
                                  onClick={() => { setWtNewOpen(false); setWtNewBranch(""); setWtError(null); }}
                                  className={styles.worktreeFormCancelButton}
                                >
                                  {t("sidebar.cancel")}
                                </button>
                              </div>
                            </div>
                          )}
                          {wtError && (
                            <div className={styles.worktreeError}>
                              {wtError}
                            </div>
                          )}
                        </AnimatedDropdown>
                      </>
                    )}
                    <button
                      className={styles.removeProjectButton}
                      type="button"
                      onClick={() => handleRemoveProject(project)}
                      title={t("sidebar.removeProjectTitle")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                      {t("sidebar.removeProject")}
                    </button>
                  </AnimatedDropdown>
                </div>
              </div>

              <RichHoverCard
                open={projectHoverCard?.project === project && projectMenuOpen !== project}
                anchor={projectHoverCard?.project === project ? projectHoverCard.anchor : null}
                width={336}
                className={styles.projectHoverCard}
                onMouseEnter={keepProjectHoverCard}
                onMouseLeave={() => setProjectHoverCard(null)}
              >
                <ProjectHoverCard
                  projectName={name}
                  taskCount={sessions.length}
                  repositoryLabel={projectRepositoryLabel}
                  projectPath={displayCwd(project, homeDir)}
                  onEdit={() => {
                    setProjectHoverCard(null);
                    setHoveredProject(project);
                    setProjectMenuOpen(project);
                    if (!isSelectedProject) setSelectedCwd(project);
                  }}
                />
              </RichHoverCard>

              <div
                id={`${disclosureId}-region`}
                role="region"
                aria-labelledby={`${disclosureId}-trigger`}
                className={styles.projectChildren}
                data-collapsed={isCollapsed}
                inert={isCollapsed}
              >
              <div className={styles.projectChildrenInner}>
              {sessions.length === 0 && isSelectedProject && (
                <div className={styles.projectEmptySessions}>
                  {t("sidebar.noSessions")}
                </div>
              )}
              {sessionTree.length > 0 && (
                <div className={styles.projectSessionsTree}>
                  {sessionTree.map((node) => (
                    <SessionTreeItem
                      key={node.session.id}
                      node={node}
                      selectedSessionId={selectedSessionId}
                      runningSessionIds={runningSessionIds}
                      unreadSessionIds={unreadSessionIds}
                      onSelectSession={handleSelectSessionFromList}
                      onRenamed={loadSessions}
                      onUnreadChange={handleUnreadChange}
                      onSessionArchived={handleSessionArchived}
                      homeDir={homeDir}
                      depth={0}
                    />
                  ))}
                </div>
              )}
              {showMore && (
                <button
                  type="button"
                  onClick={() => {
                    setExpandedProjects((current) => {
                      const next = new Set(current);
                      if (next.has(project)) next.delete(project);
                      else next.add(project);
                      return next;
                    });
                  }}
                  className={styles.projectShowMoreButton}
                >
                  {isExpanded ? t("sidebar.showLess") : t("sidebar.showMore")}
                </button>
              )}
              </div>
              </div>
            </section>
          );
          }}
          </SortableProjectList>
        )}
      </div>

    </div>
  );
}

function SessionTreeItem({
  node,
  selectedSessionId,
  runningSessionIds,
  unreadSessionIds,
  onSelectSession,
  onRenamed,
  onUnreadChange,
  onSessionArchived,
  homeDir,
  depth,
}: {
  node: SessionTreeNode;
  selectedSessionId: string | null;
  runningSessionIds: Set<string>;
  unreadSessionIds: Set<string>;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onUnreadChange: (id: string, unread: boolean) => void;
  onSessionArchived?: (id: string) => void;
  homeDir: string;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div className={styles.sessionTreeItemWrapper}>
        {/* Indent line for child sessions */}
        {depth > 0 && (
          <DynamicStyleVars
            className={styles.sessionTreeIndentLine}
            variables={{ "--ui-tree-depth": depth }}
          />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedSessionId}
          isRunning={runningSessionIds.has(node.session.id)}
          isUnread={unreadSessionIds.has(node.session.id)}
          onClick={() => onSelectSession(node.session)}
          onRenamed={onRenamed}
          onUnreadChange={onUnreadChange}
          onArchived={(id) => onSessionArchived?.(id)}
          homeDir={homeDir}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              runningSessionIds={runningSessionIds}
              unreadSessionIds={unreadSessionIds}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onUnreadChange={onUnreadChange}
              onSessionArchived={onSessionArchived}
              homeDir={homeDir}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RunningSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      className={styles.runningSessionIndicator}
      data-state="running"
      title={t("sidebar.agentRunning")}
      aria-label={t("sidebar.agentRunning")}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${styles.indicatorSvg} ${styles.runningIndicatorSvg}`}>
        <path
          d="M21 12a9 9 0 1 1-3.8-7.4"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function UnreadSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      className={styles.unreadSessionIndicator}
      title={t("sidebar.newActivity")}
      aria-label={t("sidebar.newSessionActivity")}
    >
      <span className={styles.unreadSessionDot} aria-hidden="true" />
    </span>
  );
}

/**
 * Compact per-project activity badges for the workspace selector dropdown items:
 * a spinning running icon + count and an unread dot + count. Renders nothing
 * when the project has no activity. Counts share the accent / unread colors of
 * the per-session indicators so the two stay visually consistent.
 */
function showProjectActivity(
  activity: { running: number; unread: number } | undefined,
  t: (key: string) => string,
): ReactNode {
  if (!activity || (activity.running === 0 && activity.unread === 0)) return null;
  return (
    <span className={styles.projectActivityContainer}>
      {activity.running > 0 && (
        <span
          className={styles.projectActivityRunning}
          title={t("sidebar.agentRunning")}
          aria-label={`${t("sidebar.agentRunning")} (${activity.running})`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${styles.indicatorSvg} ${styles.runningIndicatorSvg}`}>
            <path d="M21 12a9 9 0 1 1-3.8-7.4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
          </svg>
          {activity.running}
        </span>
      )}
      {activity.unread > 0 && (
        <span
          className={styles.projectActivityUnread}
          title={t("sidebar.newSessionActivity")}
          aria-label={`${t("sidebar.newSessionActivity")} (${activity.unread})`}
        >
          <span className={styles.projectActivityDot} />
          {activity.unread}
        </span>
      )}
    </span>
  );
}

function SessionItem({
  session,
  variant = "project",
  secondaryLabel,
  isSelected,
  isRunning,
  isUnread,
  onClick,
  onRenamed,
  onUnreadChange,
  onArchived,
  homeDir,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
}: {
  session: SessionInfo;
  variant?: "project" | "activity";
  secondaryLabel?: string;
  isSelected: boolean;
  isRunning?: boolean;
  isUnread?: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onUnreadChange: (id: string, unread: boolean) => void;
  onArchived?: (id: string) => void;
  homeDir: string;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [hoverCardOpen, setHoverCardOpen] = useState(false);
  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInnerRef = useRef<HTMLSpanElement>(null);
  // Overflow in px between the title text and its viewport. Zero means the
  // title fits. The Codex marquee scrolls this distance at 2em per second.
  const [titleShift, setTitleShift] = useState(0);
  const [titleShiftEm, setTitleShiftEm] = useState(0);

  const measureTitle = useCallback(() => {
    const inner = titleInnerRef.current;
    const viewport = inner?.parentElement;
    if (!inner || !viewport) return;
    const styles = getComputedStyle(viewport);
    const fontSize = Number.parseFloat(styles.fontSize) || 13;
    const shift = Math.max(0, Math.ceil(inner.scrollWidth - viewport.clientWidth));
    setTitleShift(shift);
    setTitleShiftEm(shift / fontSize);
  }, []);

  useLayoutEffect(() => {
    measureTitle();
    const viewport = titleInnerRef.current?.parentElement;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureTitle);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measureTitle, hovered]);

  useEffect(() => () => {
    if (hoverOpenTimerRef.current) clearTimeout(hoverOpenTimerRef.current);
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
  }, []);

  // A stored first message may be an SDK-expanded <skill> block; collapse it
  // back to the compact /skill:name args command the user typed before using
  // it as the auto-name fallback, mirroring MessageView's rendering.
  const displayFirstMessage = skillExpansionToCommand(session.firstMessage) ?? session.firstMessage;
  const fullTitle = session.name || displayFirstMessage || session.id.slice(0, 12);
  const title = session.name || displayFirstMessage.slice(0, 50) || session.id.slice(0, 12);
  const projectPath = session.projectRoot ?? session.cwd;
  const projectName = projectPath.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || projectPath;

  const beginSessionHover = useCallback((anchor: HTMLElement) => {
    setHovered(true);
    setHoverAnchor(anchor);
    if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    if (hoverOpenTimerRef.current) clearTimeout(hoverOpenTimerRef.current);
    hoverOpenTimerRef.current = setTimeout(() => setHoverCardOpen(true), 500);
  }, []);

  const endSessionHover = useCallback(() => {
    setHovered(false);
    if (hoverOpenTimerRef.current) clearTimeout(hoverOpenTimerRef.current);
    hoverCloseTimerRef.current = setTimeout(() => setHoverCardOpen(false), 120);
  }, []);

  const startRename = useCallback(() => {
    if (session.transient) return;
    setRenaming(true);
  }, [session.transient]);

  const commitRename = useCallback(async (name: string): Promise<boolean> => {
    if (name === title || name === (session.name ?? "")) {
      setRenaming(false);
      return true;
    }
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) return false;
      onRenamed?.();
      setRenaming(false);
      return true;
    } catch {
      return false;
    }
  }, [session.id, session.name, onRenamed, title]);

  const performPin = useCallback(async () => {
    if (session.transient) return;
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !session.pinned }),
      });
      if (response.ok) onRenamed?.();
    } catch {
      // Keep the current list when the preference cannot be written.
    }
  }, [session.id, session.pinned, session.transient, onRenamed]);

  const performArchive = useCallback(async () => {
    if (session.transient) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      onArchived?.(session.id);
    } catch {
      // ignore
    }
  }, [session.id, session.transient, onArchived]);

  const handleContextMenu = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const handled = dispatchSessionRowContextMenu({
      id: session.id,
      path: session.path,
      cwd: session.cwd,
      name: session.name,
      clientX: e.clientX,
      clientY: e.clientY,
      refresh: () => { onRenamed?.(); },
    });
    if (!handled && !hasDesktopSessionMenu()) return;
    e.preventDefault();
    e.stopPropagation();
    if (handled) return;
    const action = await showDesktopSessionMenu({
      pinned: Boolean(session.pinned),
      unread: Boolean(isUnread),
    });
    if (action === "rename") startRename();
    if (action === "toggle-pin") await performPin();
    if (action === "toggle-unread") onUnreadChange(session.id, !isUnread);
    if (action === "archive") await performArchive();
  }, [isUnread, onRenamed, onUnreadChange, performArchive, performPin, session.cwd, session.id, session.name, session.path, session.pinned, startRename]);

  return (
    <DynamicStyleVars
      variables={{
        "--ui-tree-depth": depth,
        "--ui-title-shift": `${titleShift}px`,
        "--ui-title-shift-em": titleShiftEm,
      }}
      className={variant === "activity" ? `${styles.sessionRow} ${styles.activitySessionRow}` : styles.sessionRow}
      data-variant={variant}
      data-selected={isSelected}
      data-hovered={hovered}
      data-renaming={renaming}
      data-pinned={Boolean(session.pinned)}
      onClick={renaming ? undefined : onClick}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        startRename();
      }}
      onContextMenu={renaming ? undefined : handleContextMenu}
      onMouseEnter={(event) => beginSessionHover(event.currentTarget)}
      onMouseLeave={endSessionHover}
    >
      {depth > 0 && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.sessionForkIcon}>
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      )}
      <div className={styles.sessionTitleContainer} data-selected={isSelected}>
        <div className={styles.sessionPrimaryLine}>
          <span className={styles.sessionTitleText} data-overflow={titleShift > 0}>
            <span ref={titleInnerRef} className={styles.sessionTitleInner}>{title}</span>
          </span>
          {isRunning && <RunningSessionIndicator />}
          {!isRunning && isUnread && <UnreadSessionIndicator />}
          {session.worktreeBranch && (
            <span title={t("sidebar.worktreePath", { path: session.cwd })} className={styles.sessionWorktreeIcon}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </span>
          )}
        </div>
        {secondaryLabel ? (
          <div className={styles.activitySessionProject}>
            <ProjectFolderIcon open={false} width="12" height="12" />
            <span>{secondaryLabel}</span>
          </div>
        ) : null}
      </div>
      {hasChildren && (
        <button
          onClick={(event) => { event.stopPropagation(); onToggleCollapse?.(); }}
          title={collapsed ? t("sidebar.expandForks") : t("sidebar.collapseForks")}
          className={styles.sessionForksToggle}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.sessionForksChevron} data-collapsed={collapsed}>
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
      )}
      {hovered && !session.transient && (
        <div className={styles.sessionActions}>
          <button
            className={styles.sessionPinButton}
            data-pinned={Boolean(session.pinned)}
            onClick={(event) => { event.stopPropagation(); void performPin(); }}
            title={session.pinned ? t("sidebar.unpin") : t("sidebar.pin")}
            aria-label={session.pinned ? t("sidebar.unpin") : t("sidebar.pin")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={session.pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 17v5M5 3h14l-3 6v4l2 2H6l2-2V9Z" />
            </svg>
          </button>
          <button
            className={styles.sessionArchiveButton}
            onClick={(event) => { event.stopPropagation(); void performArchive(); }}
            title={t("sidebar.archive")}
            aria-label={t("sidebar.archive")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
              <path d="M10 12h4" />
            </svg>
          </button>
        </div>
      )}
      <RichHoverCard
        open={hoverCardOpen && !renaming}
        anchor={hoverAnchor}
        width={320}
        className={styles.sessionHoverCard}
        onMouseEnter={() => {
          if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
        }}
        onMouseLeave={() => setHoverCardOpen(false)}
      >
        <SessionHoverCard
          title={fullTitle}
          modified={session.modified}
          projectName={projectName}
          repositoryLabel={session.repositoryLabel}
          cwd={displayCwd(session.cwd, homeDir)}
          gitBranch={session.gitBranch}
          isWorktree={session.isWorktree}
          unread={isUnread}
        />
      </RichHoverCard>
      <SessionRenameDialog
        initialName={title}
        open={renaming}
        onCancel={() => setRenaming(false)}
        onSave={commitRename}
      />
    </DynamicStyleVars>
  );
}
