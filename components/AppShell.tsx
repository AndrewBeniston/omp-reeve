"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useShortcutLabel } from "@/hooks/useShortcutLabel";
import { SessionSidebar } from "./SessionSidebar";
import { CommandPalette } from "./navigation/CommandPalette";
import { OpenProjectPicker } from "./navigation/OpenProjectPicker";
import { QuickChat } from "./chat/QuickChat";
import { SubagentPanel } from "./SubagentPanel";
import { ChatWindow } from "./ChatWindow";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { SettingsConfig } from "./SettingsConfig";
import { ProjectTrustDialog } from "./ProjectTrustDialog";
import { SummaryPanel } from "./SummaryPanel";
import { SourcesView } from "./SourcesView";
import { BranchNavigator } from "./BranchNavigator";
import { SidebarFooter } from "./SidebarFooter";
import { UpdateCard } from "./UpdateCard";
import { WhatsNewDialog } from "./WhatsNewDialog";
import { AppHeader, HeaderAction } from "./shell/AppHeader";
import { ShellLayout } from "./shell/ShellLayout";
import { ApplicationMenuBar } from "./shell/ApplicationMenuBar";
import { TypographyTunerPrototype } from "./debug/TypographyTunerPrototype";
import shellStyles from "./shell/shell.module.css";
import shellStateStyles from "./shell/state-styles.module.css";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useCaptionInsets } from "@/hooks/useCaptionInsets";
import { subscribeApplicationMenuAction } from "@/lib/desktop-application-menu";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useAudio } from "@/hooks/useAudio";
import { getFileName } from "@/lib/file-paths";
import { buildAtMentionText, buildFileLineMentionText } from "@/lib/file-fuzzy";
import {
  claimExtensionAttentionNotification,
  shouldShowBrowserNotification,
  showBrowserNotification,
} from "@/lib/browser-notifications";
import { getInitialNavigation } from "@/lib/initial-navigation";
import type { SummarySource } from "@/lib/session-summary";
import { clearLastOpen, getLastOpenSession, setLastOpenSession } from "@/lib/workspace-memory";
import {
  getDefaultRightPanelWidth,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  RIGHT_PANEL_FALLBACK_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/lib/panel-layout";
import type { BlockingExtensionUiRequest, SessionInfo, SessionTreeNode, SubagentSnapshot } from "@/lib/types";
import type { ProjectTrustStatus } from "@/lib/api-types";
import { COMPOSER_IMAGE_INPUT_ID, type ChatInputHandle } from "./ChatInput";
import type { SessionStatsInfo } from "@/lib/omp-types";
import type { GitStatusResponse } from "@/lib/git-types";

type AutoNameStatus =
  | { kind: "idle" }
  | { kind: "naming" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const SUMMARY_DEBUG_SOURCES: SummarySource[] = [
  {
    activity: "attached",
    id: "debug-image-1",
    kind: "image",
    label: "Summary reference 01.png",
    url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="black"/><path d="M4 26 13 17l6 6 5-7 8 10" fill="none" stroke="deepskyblue" stroke-width="2"/></svg>')}`,
  },
  {
    activity: "attached",
    id: "debug-image-2",
    kind: "image",
    label: "Summary reference 02.png",
    url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="black"/><rect x="5" y="6" width="26" height="5" rx="2" fill="silver"/><rect x="5" y="15" width="18" height="3" rx="1" fill="gray"/><rect x="5" y="22" width="23" height="3" rx="1" fill="gray"/></svg>')}`,
  },
  {
    activity: "read",
    id: "debug-file-1",
    kind: "file",
    label: "fixture-sample.ts",
    path: "/home/user/omp-cwd-design-fixture/fixture-sample.ts",
  },
  {
    activity: "provided",
    id: "debug-url-1",
    kind: "url",
    label: "github.com",
    url: "https://github.com",
  },
];

const SUMMARY_DEBUG_SUBAGENTS: SubagentSnapshot[] = [{
  id: "Pauli",
  index: 0,
  agent: "Pauli",
  agentSource: "bundled",
  status: "running",
  lastUpdate: 0,
}];

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showTypographyTuner = process.env.NODE_ENV === "development" && !searchParams.has("hideTuner");
  const showSummaryDebug = process.env.NODE_ENV === "development" && searchParams.has("summaryDebug");
  const [initialNavigation] = useState(() => getInitialNavigation(searchParams));
  const { t: translate } = useI18n();
  const isMobile = useIsMobile();
  useViewportHeight();
  useCaptionInsets();
  // Audio ownership lives here (not in ChatWindow) so the completion tone can
  // also fire for tasks finishing in a non-active workspace whose ChatWindow
  // is not mounted. ChatWindow receives the audio callbacks as props.
  const { soundEnabled, onSoundToggle, playDoneSound, unlockAudio, soundEnabledRef } = useAudio();
  const notifiedAttentionRequestIdsRef = useRef(new Set<string>());
  const handleBackgroundTaskDone = useCallback(() => {
    if (soundEnabledRef.current) playDoneSound();
  }, [playDoneSound, soundEnabledRef]);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [newSessionKind, setNewSessionKind] = useState<"project" | "chat" | null>(null);
  const [projectlessStartStatus, setProjectlessStartStatus] = useState<"idle" | "loading" | "error">("idle");
  const [projectlessStartError, setProjectlessStartError] = useState<string | null>(null);
  const projectlessStartRef = useRef<Promise<void> | null>(null);
  const [initialCwdStatus, setInitialCwdStatus] = useState<"idle" | "validating" | "ready" | "error">(
    () => initialNavigation.requestedCwd ? "validating" : "idle",
  );
  const [initialCwdError, setInitialCwdError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [fileViewerRefreshKey, setFileViewerRefreshKey] = useState(0);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [settingsConfigOpen, setSettingsConfigOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const shortcutLabel = useShortcutLabel();
  const [paletteFiles, setPaletteFiles] = useState(false);
  const [openProjectPicker, setOpenProjectPicker] = useState(false);
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [quickChatSession, setQuickChatSession] = useState<SessionInfo | null>(null);
  const quickChatConflictsWithMain = Boolean(quickChatSession && quickChatSession.id === selectedSession?.id);
  useEffect(() => {
    if (!quickChatConflictsWithMain) return;
    setQuickChatOpen(false);
    setQuickChatSession(null);
  }, [quickChatConflictsWithMain]);
  useEffect(() => {
    const openPalette = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.altKey && !event.shiftKey && event.code === "KeyN") {
        event.preventDefault();
        setQuickChatOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteFiles(false);
        setCommandPaletteOpen(open => !open);
      }
    };
    window.addEventListener("keydown", openPalette);
    return () => window.removeEventListener("keydown", openPalette);
  }, []);
  const [settingsSidebarWidth, setSettingsSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustStatus | null>(null);
  const [projectTrustDialogOpen, setProjectTrustDialogOpen] = useState(false);
  const [projectTrustBusy, setProjectTrustBusy] = useState(false);
  const [projectTrustError, setProjectTrustError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => !(process.env.NODE_ENV === "development" && searchParams.has("hideSidebar")),
  );
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [mobileSidebarReady, setMobileSidebarReady] = useState(false);
  const sidebarWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const rightPanelWidthRef = useRef(RIGHT_PANEL_FALLBACK_WIDTH);
  const getResponsiveRightPanelWidth = useCallback(
    () => typeof window === "undefined"
      ? RIGHT_PANEL_FALLBACK_WIDTH
      : getDefaultRightPanelWidth(window.innerWidth),
    [],
  );
  const getResponsiveSidebarMaxWidth = useCallback(
    () => !mobileSidebarReady || typeof window === "undefined"
      ? SIDEBAR_MAX_WIDTH
      : getSidebarMaxWidth({
        viewportWidth: window.innerWidth,
        rightPanelOpen,
        rightPanelWidth: rightPanelWidthRef.current,
      }),
    [mobileSidebarReady, rightPanelOpen],
  );
  const getResponsiveRightPanelMaxWidth = useCallback(
    () => !mobileSidebarReady || typeof window === "undefined"
      ? RIGHT_PANEL_MAX_WIDTH
      : getRightPanelMaxWidth({
        viewportWidth: window.innerWidth,
        sidebarOpen,
        sidebarWidth: sidebarWidthRef.current,
      }),
    [mobileSidebarReady, sidebarOpen],
  );
  const sidebarResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeSidebar"),
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    getMaxWidth: getResponsiveSidebarMaxWidth,
    growthDirection: "right",
    maxWidth: SIDEBAR_MAX_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    storageKey: "omp-sidebar-width",
    widthRef: sidebarWidthRef,
  });
  const rightPanelResizer = useResizablePanel({
    ariaLabel: translate("layout.resizeFilePanel"),
    defaultWidth: RIGHT_PANEL_FALLBACK_WIDTH,
    getDefaultWidth: getResponsiveRightPanelWidth,
    getMaxWidth: getResponsiveRightPanelMaxWidth,
    growthDirection: "left",
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    storageKey: "omp-right-panel-width",
    widthRef: rightPanelWidthRef,
  });
  const reclampSidebarWidth = sidebarResizer.reclampWidth;
  const reclampRightPanelWidth = rightPanelResizer.reclampWidth;
  // On mobile the sidebar is an overlay drawer; hide it by default so the chat
  // is visible on load. Runs once the breakpoint resolves after hydration.
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);
  useEffect(() => {
    setMobileSidebarReady(true);
  }, []);
  useEffect(() => {
    if (!rightPanelOpen) return;
    reclampSidebarWidth();
    reclampRightPanelWidth();
  }, [reclampRightPanelWidth, reclampSidebarWidth, rightPanelOpen]);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  // Session stats preserve auto-name behavior after compaction.
  const [sessionStats, setSessionStats] = useState<SessionStatsInfo | null>(null);
  const [subagents, setSubagents] = useState<SubagentSnapshot[]>([]);
  const [summarySources, setSummarySources] = useState<SummarySource[]>([]);
  const [autoNameStatus, setAutoNameStatus] = useState<AutoNameStatus>({ kind: "idle" });
  const autoNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string | null>(selectedSession?.id ?? null);
  activeSessionIdRef.current = selectedSession?.id ?? null;
  const handleSessionStatsChange = useCallback((stats: SessionStatsInfo | null) => {
    setSessionStats(stats);
  }, []);
  useEffect(() => {
    return () => {
      if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    };
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"summary" | null>(null);
  const toggleTopPanel = useCallback((panel: "summary") => {
    if (isMobile) setSidebarOpen(false);
    setActiveTopPanel((current) => current === panel ? null : panel);
  }, [isMobile]);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) setActiveTopPanel(null);
    setSidebarOpen((open) => !open);
  }, [isMobile]);

  useEffect(() => {
    if (!activeTopPanel && !sidebarOpen && !rightPanelOpen) return;
    const closeShellOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveTopPanel(null);
      if (window.matchMedia("(max-width: 959px)").matches) {
        setSidebarOpen(false);
        setRightPanelOpen(false);
      }
    };
    document.addEventListener("keydown", closeShellOverlay);
    return () => document.removeEventListener("keydown", closeShellOverlay);
  }, [activeTopPanel, rightPanelOpen, sidebarOpen]);

  // Right panel tabs
  const [fileTabs, setFileTabs] = useState<Tab[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);

  // Same @mention format as the chat input's @ autocomplete, so the agent's
  // read tool resolves it the same way (it strips the @ prefix).
  const handleAtMention = useCallback((relativePath: string, isDir: boolean) => {
    chatInputRef.current?.insertText(buildAtMentionText(relativePath, isDir));
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const handleFileLineMention = useCallback((relativePath: string, startLine: number, endLine: number) => {
    chatInputRef.current?.insertText(buildFileLineMentionText(relativePath, startLine, endLine));
    if (isMobile) { setRightPanelOpen(false); setSidebarOpen(false); }
  }, [isMobile]);

  const initialSessionId = initialNavigation.sessionId;
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  useTheme({
    cwd: selectedSession?.cwd ?? newSessionCwd ?? activeCwd,
    syncWithOmp: true,
  });
  const activeProjectRootRef = useRef<string | null>(null);
  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !initialSessionId);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);
  // Guards the async workspace restore so a slow response from an earlier
  // switch cannot resurrect a session into a project the user already left.
  const workspaceRestoreTokenRef = useRef(0);

  const invalidateWorkspaceRestore = useCallback(() => {
    workspaceRestoreTokenRef.current += 1;
  }, []);

  // Persist every active-session transition, including new and forked sessions
  // that bypass the sidebar selection handler. Transient sessions do not yet
  // carry projectRoot, so use the active project identity until hydration.
  useEffect(() => {
    if (!selectedSession) return;
    const projectKey = selectedSession.projectRoot
      ?? activeProjectRootRef.current
      ?? selectedSession.cwd;
    setLastOpenSession(projectKey, selectedSession.id);
  }, [selectedSession]);

  useEffect(() => {
    const requestedCwd = initialNavigation.requestedCwd;
    if (!requestedCwd) return;

    const controller = new AbortController();
    setInitialCwdStatus("validating");
    setInitialCwdError(null);

    void fetch("/api/cwd/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: requestedCwd }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { cwd?: string; error?: string };
        if (!response.ok || !data.cwd) {
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        // The sidebar will notify us when it adopts this cwd. Avoid remounting
        // the just-created empty chat during that initial synchronization.
        suppressCwdBumpRef.current = true;
        setNewSessionCwd(data.cwd);
        setInitialCwdStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setInitialCwdError(error instanceof Error ? error.message : String(error));
        setInitialCwdStatus("error");
      });

    return () => controller.abort();
  }, [initialNavigation]);

  // Restore the workspace's last open session after switching to it. Called
  // from handleCwdChange once the outgoing context has been reset. The session
  // is looked up against the live list so a deleted or drifted session falls
  // back to the default welcome page instead of erroring.
  const restoreWorkspaceContext = useCallback((projectKey: string) => {
    const token = ++workspaceRestoreTokenRef.current;
    const lastOpenSessionId = getLastOpenSession(projectKey);
    if (!lastOpenSessionId) return;
    void fetch("/api/sessions")
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then((d) => {
        if (token !== workspaceRestoreTokenRef.current) return; // stale switch
        const s = d?.sessions.find((x) => x.id === lastOpenSessionId);
        if (!s) {
          // The list loaded but the remembered session is gone — forget it.
          // When the list itself failed (d === null) keep the memory so a
          // later switch retries the restore.
          if (d) clearLastOpen(projectKey);
          return;
        }
        if ((s.projectRoot ?? s.cwd) !== projectKey) {
          // Defensive: the remembered session drifted out of this workspace.
          clearLastOpen(projectKey);
          return;
        }
        // Selecting the session must remount the chat with the session
        // present: useAgentSession loads content in a mount-only effect, so
        // the null-session welcome mount from the switch would never load
        // the restored session's messages.
        setSelectedSession(s);
        setSessionKey((k) => k + 1);
        if (new URLSearchParams(window.location.search).get("session") !== s.id) {
          router.replace(`?session=${encodeURIComponent(s.id)}`, { scroll: false });
        }
      })
      .catch(() => {
        // Network hiccup: keep the remembered session for a later retry.
      });
  }, [router]);

  const handleCwdChange = useCallback((cwd: string | null, projectRoot?: string | null) => {
    invalidateWorkspaceRestore();
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount).
    if (!cwd) return;
    const newProject = projectRoot ?? cwd;
    const currentProject = activeProjectRootRef.current
      ?? (selectedSession ? (selectedSession.projectRoot ?? selectedSession.cwd) : null);
    activeProjectRootRef.current = newProject;

    // Keep the project identity in sync during the initial URL restore without
    // remounting the just-created or restored chat.
    if (suppressCwdBumpRef.current) {
      suppressCwdBumpRef.current = false;
      return;
    }
    // Worktrees of one repo share a project root. Moving the effective cwd
    // within the same project (e.g. switching worktree, or clicking a session
    // that lives in another worktree) must not close the open session.
    if (currentProject === newProject) {
      return;
    }
    // Close any session that belongs to a different project — it no longer
    // matches the selected project directory.
    setSelectedSession(null);
    setNewSessionCwd((prev) => {
      if (prev && prev !== cwd) return null;
      return prev;
    });
    setNewSessionKind(null);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    // File tabs are keyed by absolute path, so tabs opened in the previous
    // project would otherwise linger after switching to a different project.
    // Reached only past the same-project early return above, so worktrees of
    // one repo keep their open tabs. Mirror handleCloseFileTab and close the
    // now-empty right panel.
    setFileTabs([]);
    setActiveFileTabId(null);
    setRightPanelOpen(false);
    // Restore the workspace we switched to: its last open session, or keep
    // the default welcome page when none is remembered.
    restoreWorkspaceContext(newProject);
    router.replace("/", { scroll: false });
  }, [router, selectedSession, invalidateWorkspaceRestore, restoreWorkspaceContext]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    // Mark the target project before the cwd synchronization effect runs.
    // Otherwise selecting a session in another project looks like a manual
    // project switch and the just-selected session is cleared.
    activeProjectRootRef.current = session.projectRoot ?? session.cwd;
    invalidateWorkspaceRestore();
    // Re-clicking the already-open session must not remount the chat and
    // re-run the full load/positioning cycle. Only skip when the effective
    // cwd context already matches — otherwise a pending cwd move still needs
    // the full re-select flow.
    if (!isRestore && selectedSession) {
      const sameProject =
        (selectedSession.projectRoot ?? selectedSession.cwd) ===
        (session.projectRoot ?? session.cwd);
      if (selectedSession.id === session.id && sameProject) {
        if (isMobile) setSidebarOpen(false);
        return;
      }
    }
    setNewSessionCwd(null);
    setNewSessionKind(null);
    setSelectedSession(session);
    setSessionKey((k) => k + 1);
    setSystemPrompt(null);
    setInitialSessionRestored(true);
    // On mobile, collapse the overlay drawer so the chat is revealed after pick.
    if (isMobile && !isRestore) setSidebarOpen(false);
    if (isRestore) {
      // Suppress the redundant sessionKey bump that would come from the
      // onCwdChange effect firing after setSelectedCwd in the sidebar
      suppressCwdBumpRef.current = true;
    }
    // Skip router.replace when restoring from URL — the param is already correct
    // and calling replace in production Next.js triggers a Suspense remount loop
    if (!isRestore) {
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    }
  }, [invalidateWorkspaceRestore, router, isMobile, selectedSession]);

  const beginNewSession = useCallback((cwd: string, kind: "project" | "chat") => {
    invalidateWorkspaceRestore();
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    setNewSessionKind(kind);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    if (isMobile) setSidebarOpen(false);
    router.replace("/", { scroll: false });
  }, [invalidateWorkspaceRestore, router, isMobile]);

  const handleNewSession = useCallback((_sessionId: string, cwd: string) => {
    beginNewSession(cwd, "project");
  }, [beginNewSession]);

  const handleNewProjectlessSession = useCallback(async () => {
    if (newSessionKind === "chat" && newSessionCwd) return;
    if (projectlessStartRef.current) return projectlessStartRef.current;

    const request = (async () => {
      setProjectlessStartStatus("loading");
      setProjectlessStartError(null);
      try {
        const response = await fetch("/api/default-cwd", { method: "POST" });
        const data = await response.json() as { cwd?: string; error?: string };
        if (!response.ok || !data.cwd) throw new Error(data.error ?? `HTTP ${response.status}`);
        beginNewSession(data.cwd, "chat");
        setProjectlessStartStatus("idle");
      } catch (error) {
        setProjectlessStartError(error instanceof Error ? error.message : String(error));
        setProjectlessStartStatus("error");
      } finally {
        projectlessStartRef.current = null;
      }
    })();
    projectlessStartRef.current = request;
    return request;
  }, [beginNewSession, newSessionCwd, newSessionKind]);

  // Global keyboard shortcuts (handles Esc, Ctrl+Alt+N etc.)
  useGlobalKeyboardShortcuts({
    onNewSession: (cwd: string) => handleNewSession(`kb-${Date.now()}`, cwd),
    activeCwd,
  });

  // Client-built transient SessionInfo (new session / fork) lacks the
  // server-computed projectRoot, which the same-project check in
  // handleCwdChange relies on. Hydrate it from the session list so switching
  // worktrees right after creating a session doesn't close the chat.
  const hydrateSelectedSession = useCallback((sessionId: string) => {
    void fetch("/api/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sessions: SessionInfo[] }>) : null))
      .then((d) => {
        const full = d?.sessions.find((s) => s.id === sessionId);
        if (!full) return;
        setSelectedSession((prev) => (
          prev?.id === sessionId
            ? { ...prev, ...full, transient: full.transient ?? false }
            : prev
        ));
      })
      .catch(() => {});
  }, []);

  // Called by ChatWindow when a new session gets its real id from omp
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    invalidateWorkspaceRestore();
    setNewSessionCwd(null);
    setNewSessionKind(null);
    setSelectedSession(session);
    setRefreshKey((k) => k + 1);
    hydrateSelectedSession(session.id);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [invalidateWorkspaceRestore, router, hydrateSelectedSession]);

  const handleSessionNameChanged = useCallback((sessionId: string, name: string) => {
    setRefreshKey((key) => key + 1);
    setSelectedSession((current) => current?.id === sessionId ? { ...current, name } : current);
    setSessionStats((current) => current?.sessionId === sessionId ? { ...current, sessionName: name } : current);
  }, []);

  const deliverSessionNotification = useCallback(({
    targetSession,
    title,
    body,
    tag,
  }: {
    targetSession: SessionInfo | null;
    title: string;
    body: string;
    tag?: string;
  }) => {
    if (!("Notification" in window)) return;

    const fire = () => {
      const sessionUrl = targetSession ? `/?session=${encodeURIComponent(targetSession.id)}` : "/";
      void showBrowserNotification({
        title,
        body,
        sessionUrl,
        tag,
        onClick: () => {
          window.focus();
          if (targetSession) handleSelectSession(targetSession);
        },
      });
    };

    if (Notification.permission === "granted") {
      fire();
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((p) => { if (p === "granted") fire(); });
    }
  }, [handleSelectSession]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setFileViewerRefreshKey((key) => key + 1);
    if (selectedSession) hydrateSelectedSession(selectedSession.id);

    if (!shouldShowBrowserNotification()) return;
    const targetSession = selectedSession;
    deliverSessionNotification({
      targetSession,
      title: targetSession?.name ?? translate("i18n.sessionComplete"),
      body: translate("i18n.taskFinished"),
    });
  }, [deliverSessionNotification, hydrateSelectedSession, selectedSession, translate]);

  const handleAttentionNeeded = useCallback((request: BlockingExtensionUiRequest) => {
    if (!shouldShowBrowserNotification()) return;
    if (!claimExtensionAttentionNotification(request, notifiedAttentionRequestIdsRef.current)) return;

    deliverSessionNotification({
      targetSession: selectedSession,
      title: translate("i18n.attentionNeeded"),
      body: request.method === "custom"
        ? translate("i18n.extensionInputNeeded")
        : request.title,
      tag: `pi-extension-ui:${request.id}`,
    });
  }, [deliverSessionNotification, selectedSession, translate]);

  const handleAutoName = useCallback(async () => {
    const sessionId = selectedSession?.id;
    if (!sessionId || autoNameStatus.kind === "naming") return;
    if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    setActiveTopPanel(null);
    setAutoNameStatus({ kind: "naming" });

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/auto-name`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as { title?: string; error?: string };
      if (!response.ok || !body.title) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const title = body.title.trim();
      setRefreshKey((key) => key + 1);
      if (activeSessionIdRef.current !== sessionId) return;
      setSelectedSession((current) => current?.id === sessionId ? { ...current, name: title } : current);
      setSessionStats((current) => current?.sessionId === sessionId ? { ...current, sessionName: title } : current);
      setAutoNameStatus({ kind: "success" });
      autoNameTimerRef.current = setTimeout(() => setAutoNameStatus({ kind: "idle" }), 1800);
    } catch (error) {
      if (activeSessionIdRef.current !== sessionId) return;
      const message = error instanceof Error ? error.message : String(error);
      setAutoNameStatus({ kind: "error", message });
      autoNameTimerRef.current = setTimeout(() => setAutoNameStatus({ kind: "idle" }), 5000);
    }
  }, [autoNameStatus.kind, selectedSession?.id]);

  useEffect(() => {
    if (autoNameTimerRef.current) clearTimeout(autoNameTimerRef.current);
    setAutoNameStatus({ kind: "idle" });
  }, [selectedSession?.id]);

  const handleSessionForked = useCallback((newSessionId: string) => {
    invalidateWorkspaceRestore();
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setNewSessionKind(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
      transient: false,
    }));
    hydrateSelectedSession(newSessionId);
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [invalidateWorkspaceRestore, router, hydrateSelectedSession]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleOpenFile = useCallback((
    filePath: string,
    fileName: string,
    options?: { sourceSessionId?: string | null; modeHint?: "diff" },
  ) => {
    const sourceSessionId = options?.sourceSessionId;
    const modeHint = options?.modeHint;
    const tabId = `file:${filePath}`;
    setFileTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId);
      if (!existing) {
        return [...prev, {
          id: tabId,
          kind: "file",
          label: fileName,
          filePath,
          sourceSessionId,
          initialDisplayMode: modeHint,
        }];
      }
      if (existing.kind !== "file") return prev;
      const sourceUnchanged = !sourceSessionId || existing.sourceSessionId === sourceSessionId;
      const modeUnchanged = !modeHint || existing.initialDisplayMode === modeHint;
      if (sourceUnchanged && modeUnchanged) return prev;
      return prev.map((t) => {
        if (t.id !== tabId || t.kind !== "file") return t;
        const next = { ...t };
        if (sourceSessionId) next.sourceSessionId = sourceSessionId;
        if (modeHint) next.initialDisplayMode = modeHint;
        return next;
      });
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
    // On mobile the file panel is full-screen; close the drawer so it shows.
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleOpenLinkedFile = useCallback((filePath: string) => {
    handleOpenFile(filePath, getFileName(filePath), { sourceSessionId: selectedSession?.id ?? null });
  }, [handleOpenFile, selectedSession?.id]);

  const handleCloseFileTab = useCallback((tabId: string) => {
    setFileTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveFileTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = fileTabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [fileTabs]);

  const handleViewFullHistory = useCallback(() => {
    if (!selectedSession) return;
    window.open(
      `/api/sessions/${encodeURIComponent(selectedSession.id)}/export?inline=1`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [selectedSession]);

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const summaryCwd = selectedSession?.cwd ?? effectiveNewSessionCwd;
  const [summaryGitStatus, setSummaryGitStatus] = useState<GitStatusResponse | null>(null);

  useEffect(() => {
    if (!summaryCwd) {
      setSummaryGitStatus(null);
      return;
    }

    const controller = new AbortController();
    setSummaryGitStatus(null);
    void fetch(`/api/git/status?cwd=${encodeURIComponent(summaryCwd)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() as Promise<GitStatusResponse> : null)
      .then(setSummaryGitStatus)
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSummaryGitStatus(null);
        }
      });
    return () => controller.abort();
  }, [summaryCwd]);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;
  const showSubagentPanel = !isMobile && selectedSession !== null && subagents.length > 0;
  const projectTrustCwd = selectedSession?.cwd ?? effectiveNewSessionCwd;
  // While restoring initial session from URL, don't show the placeholder
  const showPlaceholder = initialSessionRestored && !showChat;

  useEffect(() => {
    if (!showPlaceholder || activeCwd || projectlessStartStatus !== "idle") return;
    void handleNewProjectlessSession();
  }, [activeCwd, handleNewProjectlessSession, projectlessStartStatus, showPlaceholder]);

  useEffect(() => {
    setProjectTrust(null);
    setProjectTrustDialogOpen(false);
    setProjectTrustError(null);
    if (!projectTrustCwd) return;

    const controller = new AbortController();
    fetch(`/api/project-trust?cwd=${encodeURIComponent(projectTrustCwd)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as ProjectTrustStatus & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        setProjectTrust(data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load project trust:", error);
      });
    return () => controller.abort();
  }, [projectTrustCwd]);

  const handleTrustProject = useCallback(async () => {
    if (!projectTrustCwd || projectTrustBusy) return;
    setProjectTrustBusy(true);
    setProjectTrustError(null);
    try {
      const response = await fetch("/api/project-trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: projectTrustCwd }),
      });
      const data = await response.json() as ProjectTrustStatus & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setProjectTrust(data);
      setProjectTrustDialogOpen(false);
      setModelsRefreshKey((key) => key + 1);
      setSessionKey((key) => key + 1);
    } catch (error) {
      setProjectTrustError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectTrustBusy(false);
    }
  }, [projectTrustBusy, projectTrustCwd]);

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  const activeCwdName = activeCwd
    ? (isManagedChatCwd(activeCwd) ? translate("workspace.chats") : getFileName(activeCwd) || activeCwd)
    : null;
  const headerSessionTitle = selectedSession?.name?.trim()
    || selectedSession?.firstMessage.trim().slice(0, 50)
    || activeCwdName
    || translate("sidebar.newChat");
  const windowTitle = activeCwdName ? `${activeCwdName} - Reeve` : "Reeve";

  const handleOpenSettings = useCallback(() => {
    setSettingsSidebarWidth(sidebarWidthRef.current);
    setSettingsConfigOpen(true);
  }, []);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.code === "KeyO") {
        event.preventDefault(); setOpenProjectPicker(true);
      } else if (event.code === "KeyP" && activeCwd) {
        event.preventDefault(); setPaletteFiles(true); setCommandPaletteOpen(true);
      } else if (event.code === "KeyN") {
        event.preventDefault();
        if (activeCwd) handleNewSession(`shortcut:${Date.now()}`, activeCwd);
        else void handleNewProjectlessSession();
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [activeCwd, handleNewSession, handleNewProjectlessSession]);

  // The application menu lives in the main process, so an item that needs the
  // browser sends its action here. ADR-0008.
  useEffect(() => subscribeApplicationMenuAction((action) => {
    if (action === "toggle-sidebar") {
      handleSidebarToggle();
      return;
    }
    if (activeCwd) handleNewSession(`menu:${Date.now()}`, activeCwd);
    else void handleNewProjectlessSession();
  }), [activeCwd, handleNewSession, handleNewProjectlessSession, handleSidebarToggle]);

  useEffect(() => {
    const syncWindowTitle = () => {
      if (document.title !== windowTitle) document.title = windowTitle;
    };

    syncWindowTitle();
    const observer = new MutationObserver(syncWindowTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [windowTitle]);

  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        optimisticSession={selectedSession}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onNewProjectlessSession={() => void handleNewProjectlessSession()}
        onQuickChat={() => setQuickChatOpen(true)}
        onSearch={() => { setPaletteFiles(false); setCommandPaletteOpen(true); }}
        initialSessionId={initialSessionId}
        skipInitialProjectSelection={initialNavigation.requestedCwd !== null}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        selectedCwd={selectedSession?.cwd ?? (newSessionKind === "project" ? newSessionCwd : null)}
        onCwdChange={handleCwdChange}
        onBackgroundTaskDone={handleBackgroundTaskDone}
        onSidebarToggle={handleSidebarToggle}
      />
      <UpdateCard />
      <SidebarFooter onOpenSettings={handleOpenSettings} />
    </>
  );

  const selectedSessionHasMessages = Boolean(
    selectedSession
    && ((sessionStats?.userMessages ?? 0) > 0 || selectedSession.messageCount > 0),
  );
  const summaryTitleActionDisabled = !selectedSession
    || selectedSession.transient
    || !selectedSessionHasMessages
    || autoNameStatus.kind === "naming";
  const summaryTitleActionLabel = autoNameStatus.kind === "naming"
    ? translate("title.generating")
    : autoNameStatus.kind === "success"
      ? translate("title.updated")
      : autoNameStatus.kind === "error"
        ? translate("title.failed")
        : translate("title.generate");
  const visibleSummarySources = useMemo(
    () => showSummaryDebug ? [...summarySources, ...SUMMARY_DEBUG_SOURCES] : summarySources,
    [showSummaryDebug, summarySources],
  );
  const visibleSummarySubagents = showSummaryDebug && subagents.length === 0
    ? SUMMARY_DEBUG_SUBAGENTS
    : subagents;

  useEffect(() => {
    const sourceSessionId = selectedSession?.id ?? null;
    setFileTabs((current) => current.map((tab) => {
      if (tab.kind !== "sources" || tab.sourceSessionId !== sourceSessionId) return tab;
      if (tab.sources === visibleSummarySources) return tab;
      return { ...tab, sources: visibleSummarySources };
    }));
  }, [selectedSession?.id, visibleSummarySources]);

  const handleViewAllSources = useCallback(() => {
    const sourceSessionId = selectedSession?.id ?? null;
    const tabId = `sources:${sourceSessionId ?? "new"}`;
    setFileTabs((current) => {
      const nextTab: Tab = {
        id: tabId,
        kind: "sources",
        label: translate("summary.sources"),
        sourceSessionId,
        sources: visibleSummarySources,
      };
      return current.some((tab) => tab.id === tabId)
        ? current.map((tab) => tab.id === tabId ? nextTab : tab)
        : [...current, nextTab];
    });
    setActiveFileTabId(tabId);
    setRightPanelOpen(true);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, selectedSession?.id, translate, visibleSummarySources]);

  return (
    <>
      {showTypographyTuner && <TypographyTunerPrototype />}
      <WhatsNewDialog />
      <ShellLayout
        isMobile={isMobile}
        topBar={(
          <ApplicationMenuBar
            sidebarOpen={sidebarOpen}
            onSidebarToggle={handleSidebarToggle}
          />
        )}
        sidebar={{
          content: sidebarContent,
          label: translate("sidebar.projects"),
          mobileReady: mobileSidebarReady,
          onBackdropClick: () => setSidebarOpen(false),
          open: sidebarOpen,
          resize: {
            isResizing: sidebarResizer.isResizing,
            separatorProps: { ...sidebarResizer.separatorProps },
            title: `${translate("layout.resizeSidebar")}: ${translate("layout.resizeHint")}`,
            width: sidebarResizer.width,
          },
        }}
        header={
          <AppHeader
           ref={topBarRef}
           activeTopPanel={activeTopPanel}
           panels={
             activeTopPanel && (
               <>
                 {activeTopPanel === "summary" && (
                   <SummaryPanel
                     session={selectedSession}
                     cwd={selectedSession?.cwd ?? effectiveNewSessionCwd}
                     gitStatus={summaryGitStatus}
                     repositoryLabel={selectedSession?.repositoryLabel}
                     systemPrompt={systemPrompt}
                     sessionStats={sessionStats}
                     sources={visibleSummarySources}
                     subagents={visibleSummarySubagents}
                     sourceInputId={COMPOSER_IMAGE_INPUT_ID}
                     onOpenSourceFile={handleOpenLinkedFile}
                     onViewAllSources={handleViewAllSources}
                     onOpenHistory={handleViewFullHistory}
                     onGenerateTitle={() => void handleAutoName()}
                     titleAction={{
                       disabled: summaryTitleActionDisabled,
                       label: summaryTitleActionLabel,
                       state: autoNameStatus.kind,
                     }}
                     branchContent={(
                       <BranchNavigator
                         tree={branchTree}
                         activeLeafId={branchActiveLeafId}
                         onLeafChange={handleBranchLeafChange}
                         embedded
                         hasSession={Boolean(selectedSession)}
                       />
                     )}
                   />
                 )}
               </>
             )
           }
         >
           <div className={shellStyles.headerLeading} data-sidebar-open={sidebarOpen}>
             <button
               type="button"
               onClick={handleSidebarToggle}
               title={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
               aria-label={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
               className={`${shellStyles.headerControl} ${shellStyles.mainSidebarToggle} ${shellStateStyles.topBarIconButton}`}
             >
               {sidebarOpen ? (
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                   <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
                 </svg>
               ) : (
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                   <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                 </svg>
               )}
             </button>
             <button
               type="button"
               className={shellStyles.headerNewChatButton}
               onClick={() => {
                 if (activeCwd && !isManagedChatCwd(activeCwd)) handleNewSession(`header-${Date.now()}`, activeCwd);
                 else void handleNewProjectlessSession();
               }}
               disabled={projectlessStartStatus === "loading"}
               title={activeCwd && !isManagedChatCwd(activeCwd)
                 ? translate("sidebar.newSessionTitle", { path: activeCwd })
                 : translate("workspace.newChat")}
               aria-label={translate("sidebar.newChat")}
             >
               <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                 <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                 <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
               </svg>
             </button>
             <span className={shellStyles.headerClosedDivider} aria-hidden="true" />
             <div className={shellStyles.headerSessionIdentity}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                 <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
               </svg>
               <span className={shellStyles.headerSessionTitle}>{headerSessionTitle}</span>
               <span className={shellStyles.headerSessionMore} aria-hidden="true">•••</span>
             </div>
           </div>
           <div className={shellStyles.headerSpacer} />
           <div className={shellStyles.headerFileAction}>
             {showChat && (
               <HeaderAction
                 onClick={() => toggleTopPanel("summary")}
                 title={translate("summary.toggle")}
                 aria-label={translate("summary.toggle")}
                 aria-pressed={activeTopPanel === "summary"}
                 className={shellStyles.summaryToggle}
               >
                 <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                   <circle cx="4" cy="4" r="1.2" />
                   <path d="M7 4h5" />
                   <circle cx="4" cy="8" r="1.2" />
                   <path d="M7 8h5" />
                   <circle cx="4" cy="12" r="1.2" />
                   <path d="M7 12h5" />
                 </svg>
               </HeaderAction>
             )}
             <button
               type="button"
               onClick={() => setRightPanelOpen((open) => !open)}
               aria-controls="file-panel"
               aria-expanded={rightPanelOpen}
               title={rightPanelOpen ? translate("files.hidePanel") : translate("files.showPanel")}
               aria-label={rightPanelOpen ? translate("files.hidePanel") : translate("files.showPanel")}
               className={`${shellStyles.filePanelToggle} ${shellStateStyles.filePanelToggle}`}
             >
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                 <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
               </svg>
             </button>
           </div>
          </AppHeader>
        }
        main={
          <>
          {showChat ? (
            <ChatWindow
              key={sessionKey}
              session={selectedSession}
              newSessionCwd={effectiveNewSessionCwd}
              onAgentEnd={handleAgentEnd}
              onAttentionNeeded={handleAttentionNeeded}
              onSessionCreated={handleSessionCreated}
              onSessionForked={handleSessionForked}
              onSessionNameChanged={handleSessionNameChanged}
              modelsRefreshKey={modelsRefreshKey}
              chatInputRef={chatInputRef}
              onBranchDataChange={handleBranchDataChange}
              onSystemPromptChange={handleSystemPromptChange}
              onSessionStatsChange={handleSessionStatsChange}
              onSummarySourcesChange={setSummarySources}
              onSubagentsChange={setSubagents}
              onOpenFile={handleOpenLinkedFile}
              soundEnabled={soundEnabled}
              playDoneSound={playDoneSound}
              unlockAudio={unlockAudio}
              projectTrust={projectTrust}
              onProjectTrustClick={() => {
                setProjectTrustError(null);
                setProjectTrustDialogOpen(true);
              }}
              homeContextLabel={newSessionKind === "chat"
                ? translate("workspace.chats")
                : activeCwdName ?? translate("workspace.chats")}
              homeProjectless={newSessionKind === "chat" || isManagedChatCwd(effectiveNewSessionCwd)}
              homeProjectPath={selectedSession?.cwd ?? effectiveNewSessionCwd}
              onHomeProjectSelected={(path) => handleNewSession(`home-${Date.now()}`, path)}
              onHomeProjectlessSelected={() => void handleNewProjectlessSession()}
            />
          ) : initialCwdStatus === "validating" ? (
            <div
              role="status"
              className={shellStyles.workspaceState}
            >
              <div className={shellStyles.workspaceStateTitle}>{translate("workspace.opening")}</div>
              <div className={shellStyles.workspacePath}>
                {initialNavigation.requestedCwd}
              </div>
            </div>
          ) : initialCwdStatus === "error" ? (
            <div
              role="alert"
              className={shellStyles.workspaceState}
            >
              <div data-error="true" className={shellStyles.workspaceStateTitle}>{translate("workspace.unable")}</div>
              <div className={shellStyles.workspacePath}>
                {initialNavigation.requestedCwd}
              </div>
              <div className={shellStyles.workspaceError}>{initialCwdError}</div>
            </div>
          ) : projectlessStartStatus === "loading" ? (
            <div role="status" className={shellStyles.workspaceState}>
              <div className={shellStyles.workspaceStateTitle}>{translate("workspace.preparingChat")}</div>
            </div>
          ) : projectlessStartStatus === "error" ? (
            <div role="alert" className={shellStyles.workspaceState}>
              <div data-error="true" className={shellStyles.workspaceStateTitle}>{translate("workspace.chatUnavailable")}</div>
              <div className={shellStyles.workspaceError}>{projectlessStartError}</div>
              <button type="button" className={shellStyles.workspaceRetry} onClick={() => {
                setProjectlessStartStatus("idle");
              }}>
                {translate("workspace.retry")}
              </button>
            </div>
          ) : showPlaceholder ? (
            <div role="status" className={shellStyles.workspaceState}>
              <div className={shellStyles.workspaceStateTitle}>{translate("workspace.preparingChat")}</div>
            </div>
          ) : null}
          </>
        }
        secondaryPanel={showSubagentPanel ? (
          <SubagentPanel
            sessionId={selectedSession?.id ?? null}
            cwd={selectedSession?.cwd ?? effectiveNewSessionCwd ?? undefined}
            subagents={subagents}
          />
        ) : undefined}
        rightPanel={{
          content: activeFileTab?.kind === "sources" ? (
            <SourcesView
              sources={activeFileTab.sources}
              onOpenFile={(filePath) => handleOpenFile(
                filePath,
                getFileName(filePath),
                { sourceSessionId: activeFileTab.sourceSessionId },
              )}
            />
          ) : activeFileTab?.kind === "file" ? (
            <FileViewer
              filePath={activeFileTab.filePath}
              cwd={activeCwd ?? undefined}
              sourceSessionId={activeFileTab.sourceSessionId}
              gitRefreshKey={fileViewerRefreshKey}
              initialDisplayMode={activeFileTab.initialDisplayMode}
              onMentionLines={rightPanelOpen ? handleFileLineMention : undefined}
              onAtMention={handleAtMention}
              onOpenFile={(filePath) => handleOpenFile(
                filePath,
                getFileName(filePath),
                { sourceSessionId: activeFileTab.sourceSessionId },
              )}
            />
          ) : (
            <div className={shellStyles.fileEmpty}>
              {translate("files.noneOpen")}
            </div>
          ),
          header: (
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={setActiveFileTabId}
              onCloseTab={handleCloseFileTab}
            />
          ),
          label: activeFileTab?.kind === "sources" ? translate("summary.sources") : translate("files.panel"),
          onBackdropClick: () => setRightPanelOpen(false),
          open: rightPanelOpen,
          resize: {
            isResizing: rightPanelResizer.isResizing,
            separatorProps: { ...rightPanelResizer.separatorProps },
            title: `${translate("layout.resizeFilePanel")}: ${translate("layout.resizeHint")}`,
            width: rightPanelResizer.width,
          },
        }}
      />
    {quickChatOpen && !quickChatConflictsWithMain && <QuickChat initialSession={quickChatSession}
      mainSessionId={selectedSession?.id ?? null} onSessionChange={setQuickChatSession}
      onResourcesChanged={() => {
        setModelsRefreshKey(key => key + 1);
        setSessionKey(key => key + 1);
      }}
      onSessionForked={(id, source) => {
        if (source) {
          handleSelectSession({ ...source, id, path: "", transient: false });
          hydrateSelectedSession(id);
          setRefreshKey(key => key + 1);
        } else {
          handleSessionForked(id);
        }
      }}
      onOpenFile={(path, source) => {
        if (source) handleSelectSession(source);
        handleOpenFile(path, getFileName(path), { sourceSessionId: source?.id ?? null });
      }}
      onOpenMain={handleSelectSession} onClose={() => setQuickChatOpen(false)} />}
    {openProjectPicker && <OpenProjectPicker onCancel={() => setOpenProjectPicker(false)} onSelect={path => {
      setOpenProjectPicker(false); handleNewSession(`folder:${Date.now()}`, path);
    }} />}
    {commandPaletteOpen && <CommandPalette
      key={paletteFiles ? "files" : "commands"}
      fileSearchCwd={paletteFiles ? activeCwd ?? undefined : undefined}
      onBack={() => setPaletteFiles(false)}
      onOpenFile={handleOpenLinkedFile}
      onClose={() => setCommandPaletteOpen(false)}
      onSelectSession={handleSelectSession}
      actions={[
        { id: "new", label: translate("sidebar.newChat"), group: translate("commandMenu.quickActions"), icon: "edit", shortcut: shortcutLabel("N"), run: () => {
          if (activeCwd) handleNewSession(`palette:${Date.now()}`, activeCwd);
          else void handleNewProjectlessSession();
        } },
        { id: "folder", label: translate("commandMenu.openFolder"), group: translate("commandMenu.quickActions"), icon: "folder", shortcut: shortcutLabel("O"), run: () => setOpenProjectPicker(true) },
        ...(activeCwd ? [{ id: "files", label: translate("commandMenu.files"), group: translate("commandMenu.quickActions"), icon: "search", shortcut: shortcutLabel("P"), run: () => { setPaletteFiles(true); setCommandPaletteOpen(true); } }] : []),
        { id: "quick", label: translate("quickChat.title"), group: translate("commandMenu.quickActions"), icon: "chat", shortcut: shortcutLabel("N", true), run: () => setQuickChatOpen(true) },
        { id: "sidebar", label: translate("commandMenu.toggleSidebar"), group: translate("commandMenu.navigation"), icon: "layout", run: handleSidebarToggle },
        { id: "settings", label: translate("commandMenu.general"), group: translate("common.settings"), icon: "settings", run: handleOpenSettings },
      ]}
    />}
    {settingsConfigOpen && (
      <SettingsConfig
        cwd={projectTrustCwd}
        sessionId={selectedSession?.id ?? null}
        sidebarWidth={settingsSidebarWidth}
        soundEnabled={soundEnabled}
        onSoundToggle={onSoundToggle}
        onClose={() => setSettingsConfigOpen(false)}
        onModelsChanged={() => setModelsRefreshKey((key) => key + 1)}
        onReloaded={() => setSessionKey((key) => key + 1)}
        onArchivedSessionsChanged={() => setRefreshKey((key) => key + 1)}
      />
    )}
    {projectTrustDialogOpen && projectTrustCwd && (
      <ProjectTrustDialog
        cwd={projectTrustCwd}
        busy={projectTrustBusy}
        error={projectTrustError}
        onCancel={() => {
          if (!projectTrustBusy) setProjectTrustDialogOpen(false);
        }}
        onConfirm={() => void handleTrustProject()}
      />
    )}
    </>
  );
}

function isManagedChatCwd(cwd: string | null | undefined): boolean {
  return typeof cwd === "string" && /[\\/]omp-cwd-\d{8}$/.test(cwd);
}
