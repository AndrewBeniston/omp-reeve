"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAcceleratorLabel, useShortcutLabel } from "@/hooks/useShortcutLabel";
import { SessionSidebar } from "./SessionSidebar";
import { CommandPalette } from "./navigation/CommandPalette";
import { OpenProjectPicker } from "./navigation/OpenProjectPicker";
import { QuickChat } from "./chat/QuickChat";
import { SubagentPanel } from "./SubagentPanel";
import { ChatWindow } from "./ChatWindow";
import { FileViewer } from "./FileViewer";
import { fileTabId, reviewScopeFromSelection, type FileReviewOrigin } from "@/lib/file-review-origin";
import type { ReviewSourceContext } from "./file-source/FileSourceView";
import { ReviewPanel } from "./review/ReviewPanel";
import { TabBar, assertNeverTab, type BrowserTab, type ReviewTab, type Tab, type TerminalTab } from "./TabBar";
import { Launcher, type LauncherAction } from "./tabs/Launcher";
import { BrowserTabs, browserTabCommand, useSupportsBrowserTab } from "./browser/BrowserTabs";
import { RenameDialog } from "./RenameDialog";
import { applyPageTitle, insertTabAfter, renameBrowserTab } from "@/lib/browser-tabs";
import { toStoredBrowserTabs } from "@/lib/browser-tab-store";
import { hasBrowserTabMenu, showBrowserTabMenu } from "@/lib/desktop-browser-tab-menu";
import { openExternal } from "@/lib/open-external";
import { TerminalTabs, useSupportsTerminalTab } from "./terminal/TerminalTabs";
import { SettingsConfig } from "./SettingsConfig";
import { ProjectTrustDialog } from "./ProjectTrustDialog";
import { SummaryPanel } from "./SummaryPanel";
import { SourcesView } from "./SourcesView";
import { BranchNavigator } from "./BranchNavigator";
import { SidebarFooter } from "./SidebarFooter";
import { UpdateCard } from "./UpdateCard";
import { WhatsNewDialog } from "./WhatsNewDialog";
import { AppHeader, HeaderAction } from "./shell/AppHeader";
import { PanelControls } from "./shell/PanelControls";
import { PanelVisibilityToggle } from "./shell/PanelVisibilityToggle";
import { ShellLayout } from "./shell/ShellLayout";
import { ApplicationMenuBar } from "./shell/ApplicationMenuBar";
import shellStyles from "./shell/shell.module.css";
import shellStateStyles from "./shell/state-styles.module.css";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useCaptionInsets } from "@/hooks/useCaptionInsets";
import {
  isTabFocusAction,
  subscribeApplicationMenuAction,
  TAB_FOCUS_POSITIONS,
} from "@/lib/desktop-application-menu";
import {
  isReopenableTabKind,
  PANEL_ACCELERATORS,
  stepTabIndex,
  type PanelActionId,
} from "@/lib/panel-actions";
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
  getBrowserTabPanelWidth,
  getMaximisedRightPanelWidth,
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
import { reviewTabMatchesSession } from "@/lib/review-comments";
import { reviewComposerSessionId, reviewTabLabel } from "@/lib/review-owner";
import { reviewOwnerBody, type ReviewRequestContext } from "@/lib/review-owner";
import { readReviewSettings, writeReviewSettings } from "@/lib/review-settings-store";
import type { ReviewDelivery } from "@/lib/review-settings";
import { reviewComposerDelivery } from "@/lib/review-dispatch";
import {
  reviewBaseBranchChoices,
  reviewBranchDisplayName,
  type ReviewSlashOutcome,
  type ReviewSlashRequest,
} from "@/lib/review-slash-entries";
import { ReviewTabSync } from "@/lib/review-tab-sync";
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

/**
 * The Review a file Tab is following, or null when there is not one.
 *
 * Resolved from the Tab strip on every render rather than copied onto the file
 * Tab: a Review's owner and what it is comparing belong to that Review, and a
 * copy of them would keep answering after its Tab had closed or moved on.
 */
function reviewSourceContext(tabs: Tab[], origin?: FileReviewOrigin): ReviewSourceContext | null {
  if (!origin?.tabId) return null;
  const source = tabs.find((tab): tab is ReviewTab => tab.kind === "review" && tab.id === origin.tabId);
  if (!source) return null;
  const scope = reviewScopeFromSelection(source.selection, source.owner);
  return scope ? { context: { tabId: source.id, owner: source.owner }, scope } : null;
}

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSummaryDebug = process.env.NODE_ENV === "development" && searchParams.has("summaryDebug");
  const [initialNavigation] = useState(() => getInitialNavigation(searchParams));
  const { t: translate } = useI18n();
  const isMobile = useIsMobile();
  // False on the server and the first client render, so the strip's trailing
  // control cannot differ between the two trees.
  const supportsBrowserTabs = useSupportsBrowserTab();
  const supportsTerminalTabs = useSupportsTerminalTab();
  /** The Browser tab whose name the human is editing, if any. */
  const [renamingBrowserTab, setRenamingBrowserTab] = useState<string | null>(null);
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
  const acceleratorLabel = useAcceleratorLabel();
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
  // Read by the sidebar's own maximum, which is measured before the right
  // panel's resizer exists.
  const rightPanelMaximisedRef = useRef(false);
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
        // A maximised panel covers the chat rather than competing with it, so
        // it does not take room from the sidebar.
        rightPanelOpen: rightPanelOpen && !rightPanelMaximisedRef.current,
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
  const getResponsiveMaximisedRightPanelWidth = useCallback(
    () => typeof window === "undefined"
      ? RIGHT_PANEL_MAX_WIDTH
      : getMaximisedRightPanelWidth({
        viewportWidth: window.innerWidth,
        sidebarOpen,
        sidebarWidth: sidebarWidthRef.current,
      }),
    [sidebarOpen],
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
    getMaximisedWidth: getResponsiveMaximisedRightPanelWidth,
    growthDirection: "left",
    // No absolute ceiling. The responsive maximum above already encodes the
    // real limit — the workspace less the chat's reserve — and a fixed ceiling
    // on top of it stopped the panel growing part-way across a wide display,
    // which is where a web page most wants the room.
    maxWidth: Number.POSITIVE_INFINITY,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    storageKey: "omp-right-panel-width",
    widthRef: rightPanelWidthRef,
  });
  const reclampSidebarWidth = sidebarResizer.reclampWidth;
  const reclampRightPanelWidth = rightPanelResizer.reclampWidth;
  const growRightPanelToAtLeast = rightPanelResizer.growToAtLeast;
  const toggleRightPanelMaximised = rightPanelResizer.toggleMaximised;
  const rightPanelMaximised = rightPanelResizer.isMaximised;
  useEffect(() => {
    rightPanelMaximisedRef.current = rightPanelMaximised;
  }, [rightPanelMaximised]);
  /** One action for the header, the panel's own control and the menu chord. */
  const toggleRightPanel = useCallback(() => setRightPanelOpen((open) => !open), []);
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
  /*
   * Reeve's own record of the Review Tabs, and what it has to say when it
   * cannot keep up: opening, restoring and saving all report rather than fail
   * quietly, and the panel says so with a way to try again.
   */
  const reviewSync = useMemo(() => new ReviewTabSync(), []);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [reviewSyncRetry, setReviewSyncRetry] = useState(0);
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
  const [tabs, setTabs] = useState<Tab[]>([]);
  /**
   * The Tabs closed in this window, newest last, for Cmd+Shift+T.
   *
   * A ref rather than state: nothing renders from it, and a re-render on every
   * close would be paid for nothing. It holds at most ten, and a Terminal is
   * never among them.
   */
  const closedTabsRef = useRef<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

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
  /** Where the human is now, read after an answer rather than closed over. */
  const activeCwdRef = useRef<string | null>(null);
  activeCwdRef.current = activeCwd;
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
    // A file Tab is keyed by absolute path, so Tabs opened in the previous
    // project would otherwise linger after switching to a different project.
    // Reached only past the same-project early return above, so worktrees of
    // one repo keep their open tabs. Mirror handleCloseTab and close the
    // now-empty right panel.
    setTabs([]);
    closedTabsRef.current = [];
    setActiveTabId(null);
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
    options?: { sourceSessionId?: string | null; modeHint?: "diff"; reviewOrigin?: FileReviewOrigin },
  ) => {
    const sourceSessionId = options?.sourceSessionId;
    const modeHint = options?.modeHint;
    const reviewOrigin = options?.reviewOrigin;
    /*
     * A file opened from a Review is that Review's Tab. Two Reviews looking at
     * one file are two Tabs, each keeping its own line and its own comparison,
     * rather than one whose context the other quietly takes. Every other way
     * of opening a file keeps the identity it has always had.
     */
    const tabId = fileTabId(filePath, reviewOrigin);
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === tabId);
      if (!existing) {
        return [...prev, {
          id: tabId,
          kind: "file",
          label: fileName,
          filePath,
          sourceSessionId,
          initialDisplayMode: modeHint,
          reviewOrigin,
        }];
      }
      if (existing.kind !== "file") return prev;
      const sourceUnchanged = !sourceSessionId || existing.sourceSessionId === sourceSessionId;
      const modeUnchanged = !modeHint || existing.initialDisplayMode === modeHint;
      /*
       * Opening a file that is already open at a different line has to move
       * it. The Tab is not replaced and nothing remounts: the line arrives as
       * a property, and the view scrolls.
       */
      const originUnchanged = !reviewOrigin
        || (existing.reviewOrigin?.line === reviewOrigin.line
          && existing.reviewOrigin?.revision === reviewOrigin.revision
          && existing.reviewOrigin?.relativePath === reviewOrigin.relativePath);
      if (sourceUnchanged && modeUnchanged && originUnchanged) return prev;
      return prev.map((t) => {
        if (t.id !== tabId || t.kind !== "file") return t;
        const next = { ...t };
        if (sourceSessionId) next.sourceSessionId = sourceSessionId;
        if (modeHint) next.initialDisplayMode = modeHint;
        if (reviewOrigin) next.reviewOrigin = reviewOrigin;
        return next;
      });
    });
    setActiveTabId(tabId);
    setRightPanelOpen(true);
    // On mobile the file panel is full-screen; close the drawer so it shows.
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleOpenLinkedFile = useCallback((filePath: string) => {
    handleOpenFile(filePath, getFileName(filePath), { sourceSessionId: selectedSession?.id ?? null });
  }, [handleOpenFile, selectedSession?.id]);

  /**
   * Open a Browser tab.
   *
   * Unlike a file, two Browser tabs on the same address are two Tabs: the human
   * may want the same page twice, and the id is what the agent addresses, so it
   * is minted per Tab rather than derived from the URL.
   */
  const handleOpenBrowserTab = useCallback((url: string, options?: { after?: string }) => {
    const tabId = `browser:${crypto.randomUUID()}`;
    setTabs((prev) => {
      const tab: BrowserTab = {
        id: tabId,
        kind: "browser",
        label: translate("browser.untitled"),
        url,
      };
      return insertTabAfter(prev, tab, options?.after);
    });
    setActiveTabId(tabId);
    setRightPanelOpen(true);
    // A web page is laid out for a window, not for a gutter. Widen the panel to
    // the width the reference application opens a page into, unless the human
    // has already made it wider.
    if (!isMobile) {
      growRightPanelToAtLeast(getBrowserTabPanelWidth({
        shellHeight: window.innerHeight,
        workspaceWidth: window.innerWidth - (sidebarOpen ? sidebarWidthRef.current : 0),
      }));
    }
    if (isMobile) setSidebarOpen(false);
  }, [growRightPanelToAtLeast, isMobile, sidebarOpen, translate]);

  /**
   * Open a Terminal in the active Project.
   *
   * The directory is fixed now, not followed: a shell whose cwd changed when
   * the human selected another Session would move underneath a running
   * command. The desktop process still checks the Project's trust before it
   * spawns anything, so this is a request, not a grant.
   */
  const handleOpenTerminalTab = useCallback((cwd: string) => {
    const tabId = `terminal:${crypto.randomUUID()}`;
    setTabs((prev) => [...prev, {
      id: tabId,
      kind: "terminal",
      label: translate("tabs.terminal"),
      cwd,
    }]);
    setActiveTabId(tabId);
    setRightPanelOpen(true);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, translate]);

  /** The shell named itself, the way a terminal tab is titled by its program. */
  const handleTerminalTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => prev.map((t) => (
      t.id === tabId && t.kind === "terminal" && t.label !== title ? { ...t, label: title } : t
    )));
  }, []);
  /** The guest navigated. The Tab's URL follows the page, its id never does. */
  const handleBrowserNavigate = useCallback((tabId: string, url: string) => {
    setTabs((prev) => prev.map((t) => (
      t.id === tabId && t.kind === "browser" && t.url !== url ? { ...t, url } : t
    )));
  }, []);

  /** The page named itself, so the Tab takes that name. */
  const handleBrowserTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) => applyPageTitle(prev, tabId, title));
  }, []);

  /** The page declared an icon, so the Tab shows it the way a browser does. */
  const handleBrowserFavicon = useCallback((tabId: string, faviconUrl: string) => {
    setTabs((prev) => prev.map((t) => (
      t.id === tabId && t.kind === "browser" && t.faviconUrl !== faviconUrl
        ? { ...t, faviconUrl }
        : t
    )));
  }, []);


  /**
   * The context menu on a Browser tab.
   *
   * The entries and their order come from the reference application. The menu
   * itself is drawn by the desktop process, so a browser-only Reeve has none
   * and the strip does not offer one.
   */
  const handleBrowserTabMenu = useCallback((tabId: string) => {
    const tab = tabs.find((t): t is BrowserTab => t.id === tabId && t.kind === "browser");
    if (!tab) return;

    void showBrowserTabMenu({ hasUrl: Boolean(tab.url) }).then((action) => {
      switch (action) {
        case "new-tab-right":
          handleOpenBrowserTab("", { after: tab.id });
          return;
        case "duplicate":
          // A second Tab on the same address, with its own id and its own
          // page. The original keeps its history; this one starts fresh.
          handleOpenBrowserTab(tab.url, { after: tab.id });
          return;
        case "reload":
          void browserTabCommand(tab.id, "reload");
          return;
        case "rename":
          setRenamingBrowserTab(tab.id);
          return;
        case "copy-url":
          void navigator.clipboard.writeText(tab.url);
          return;
        case "open-external":
          openExternal(tab.url);
          return;
        default:
          return;
      }
    });
  }, [handleOpenBrowserTab, tabs]);

  /** The human named a Tab, so its label stops following the page. */
  const handleRenameBrowserTab = useCallback(async (name: string) => {
    const tabId = renamingBrowserTab;
    if (!tabId) return false;
    setTabs((prev) => renameBrowserTab(prev, tabId, name));
    setRenamingBrowserTab(null);
    return true;
  }, [renamingBrowserTab]);


  /**
   * Browser tabs belong to a Project, and follow it.
   *
   * Reeve remembers the addresses and their order in its own registry, so
   * reopening a Project brings its pages back. Switching Project puts the
   * outgoing one's Tabs away and takes the incoming one's out, which is what
   * makes them the Project's rather than the window's.
   *
   * Terminals are never remembered. A restored Terminal would be a dead shell
   * wearing a live one's clothes, and the human would find out by typing.
   */
  const restoredProjectRef = useRef<string | null>(null);

  useEffect(() => {
    const project = activeCwd;
    if (!project || restoredProjectRef.current === project) return;

    const previous = restoredProjectRef.current;
    restoredProjectRef.current = project;
    const controller = new AbortController();

    setTabs((prev) => {
      // Put the outgoing Project's pages away before they are closed, or
      // switching away would be indistinguishable from closing them for good.
      if (previous) {
        const outgoing = toStoredBrowserTabs(prev);
        void fetch("/api/browser-tabs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd: previous, tabs: outgoing }),
        }).catch(() => {});
      }
      return prev.filter((tab) => tab.kind !== "browser");
    });

    void fetch(`/api/browser-tabs?cwd=${encodeURIComponent(project)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ tabs?: { url: string }[] }> : null)
      .then((data) => {
        const restored = data?.tabs ?? [];
        if (restored.length === 0) return;
        setTabs((prev) => [
          ...prev,
          ...restored.map((entry) => ({
            id: `browser:${crypto.randomUUID()}`,
            kind: "browser" as const,
            label: translate("browser.untitled"),
            url: entry.url,
          })),
        ]);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [activeCwd, translate]);

  /**
   * Remember the current Project's pages as they change.
   *
   * Only once this Project's own Tabs have been restored, or an empty panel
   * during the restore would be written down as "no Tabs" and lose them.
   */
  useEffect(() => {
    const project = activeCwd;
    if (!project || restoredProjectRef.current !== project) return;
    const stored = toStoredBrowserTabs(tabs);
    const timer = setTimeout(() => {
      void fetch("/api/browser-tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: project, tabs: stored }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [activeCwd, tabs]);

  /**
   * The Project the Review Tabs on screen belong to.
   *
   * A Session names its own Project; without one the directory stands for it,
   * and the server resolves the real Project root when a Tab registers.
   */
  const activeProjectRoot = useMemo(() => {
    if (selectedSession && reviewTabMatchesSession(selectedSession.cwd, activeCwd)) {
      return selectedSession.projectRoot ?? selectedSession.cwd;
    }
    return activeCwd;
  }, [activeCwd, selectedSession]);

  /**
   * A Project's Review Tabs come back with it, each still bound to the
   * Worktree and Session it was opened for. A record whose Worktree is gone is
   * not returned by the registry, so a restored Tab is one that still works.
   *
   * The Project is written down as restored only once its own answer has
   * arrived. Marking it before would turn an aborted first attempt — a
   * re-run effect, a Project switched and switched back — into a Project that
   * never loads its Tabs and never tries again.
   */
  const restoredReviewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const project = activeProjectRoot;
    if (!project) return;
    const key = `${project}#${reviewSyncRetry}`;
    if (restoredReviewKeyRef.current === key) return;
    const controller = new AbortController();
    reviewSync.changeProject();
    setTabs((prev) => prev.filter((tab) => tab.kind !== "review"));
    void reviewSync.restore(project, controller.signal).then((result) => {
      if (result.status === "superseded") return;
      if (result.status === "failed") {
        setReviewNotice(result.message);
        return;
      }
      restoredReviewKeyRef.current = key;
      setReviewNotice(null);
      if (result.value.length === 0) return;
      setTabs((prev) => [
        ...prev,
        ...result.value.filter((stored) => !prev.some((tab) => tab.id === stored.tabId)).map((stored) => ({
          kind: "review" as const,
          id: stored.tabId,
          owner: stored.owner,
          label: reviewTabLabel(stored.owner),
          ...(stored.selection ? { selection: stored.selection } : {}),
        })),
      ]);
      /*
       * A Tab that was in front of an open panel comes back that way. The
       * panel's width is remembered by the browser but its visibility is not,
       * so without this a restored Review Tab sits behind a closed panel and
       * has to be found before it can be seen.
       */
      const inFront = result.value.find((stored) => stored.active);
      if (!inFront) return;
      setActiveTabId(inFront.tabId);
      setRightPanelOpen(true);
    });
    return () => controller.abort();
  }, [activeProjectRoot, reviewSync, reviewSyncRetry]);

  /**
   * What each Review Tab is reviewing, remembered as it changes. Written down
   * as saved only when every Tab was saved, so a failed write is tried again
   * rather than recorded as a save that happened.
   */
  const reviewTabsKey = JSON.stringify(tabs
    .filter((tab): tab is ReviewTab => tab.kind === "review")
    .map((tab) => [tab.id, tab.owner, tab.selection ?? null, rightPanelOpen && tab.id === activeTabId]));
  const persistedReviewTabsRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${reviewTabsKey}#${reviewSyncRetry}`;
    if (persistedReviewTabsRef.current === key) return;
    const reviewTabs = tabs.filter((tab): tab is ReviewTab => tab.kind === "review");
    const timer = setTimeout(() => {
      void reviewSync.persist(reviewTabs.map((tab) => ({
        tabId: tab.id,
        owner: tab.owner,
        selection: tab.selection,
        active: rightPanelOpen && tab.id === activeTabId,
      })))
        .then((result) => {
          if (result.status === "superseded") return;
          if (result.status === "failed") {
            setReviewNotice(result.message);
            return;
          }
          persistedReviewTabsRef.current = key;
          setReviewNotice(null);
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [activeTabId, reviewSync, reviewSyncRetry, reviewTabsKey, rightPanelOpen, tabs]);

  const handleCloseTab = useCallback((tabId: string) => {
    // Remember it so Cmd+Shift+T can bring it back. The stack is a ref and is
    // never persisted: it is about the last few minutes, not about the
    // Project, and it dies with the window.
    const closing = tabs.find((t) => t.id === tabId);
    if (closing && isReopenableTabKind(closing.kind)) {
      closedTabsRef.current = [...closedTabsRef.current.slice(-9), closing];
    }
    // A closed Review Tab is forgotten, binding and selection together, so it
    // does not come back after a restart.
    if (closing?.kind === "review") {
      void reviewSync.close({ tabId: closing.id, owner: closing.owner }).then((result) => {
        if (result.status === "failed") setReviewNotice(result.message);
      });
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) setRightPanelOpen(false);
      return next;
    });
    setActiveTabId((cur) => {
      if (cur !== tabId) return cur;
      const remaining = tabs.filter((t) => t.id !== tabId);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [reviewSync, tabs]);

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

  /**
   * The Review this Session owns. A request carries that owner, so a Session
   * with no Review of its own asks for nothing.
   */
  const reviewRequestContext = useMemo<ReviewRequestContext | null>(() => {
    const sessionId = selectedSession?.id;
    if (!sessionId) return null;
    const tab = tabs.find((candidate): candidate is ReviewTab =>
      candidate.kind === "review" && candidate.owner.sessionId === sessionId);
    return tab ? { tabId: tab.id, owner: tab.owner } : null;
  }, [selectedSession?.id, tabs]);

  // Read after mount: the server has no storage, and a disagreeing first
  // render would hydrate into the wrong choice.
  const [reviewDelivery, setReviewDelivery] = useState<ReviewDelivery>("current-chat");
  useEffect(() => { setReviewDelivery(readReviewSettings().delivery); }, []);

  const handleReviewDeliveryChange = useCallback((delivery: ReviewDelivery) => {
    setReviewDelivery(delivery);
    writeReviewSettings({ ...readReviewSettings(), delivery });
  }, []);

  /**
   * Select a Session by id, waiting briefly for it to appear.
   *
   * A Session created a moment ago may not be in the list yet, and selecting
   * nothing would leave the human where they were with no sign that anything
   * happened. Reports whether it selected, so the caller can say so.
   */
  const selectSessionById = useCallback(async (sessionId: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch("/api/sessions", { cache: "no-store" });
      const data = response.ok ? await response.json() as { sessions: SessionInfo[] } : null;
      const full = data?.sessions.find((candidate) => candidate.id === sessionId);
      if (full) {
        handleSelectSession(full);
        setRefreshKey((key) => key + 1);
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    setRefreshKey((key) => key + 1);
    return false;
  }, [handleSelectSession]);

  /**
   * The owner a request reads, establishing one when this Session has none.
   *
   * The reference offers its review command from the composer whenever the
   * conversation has a workspace, so Reeve does not make opening a panel a
   * prerequisite. The Tab is registered through the same path the panel uses,
   * and the server mints its id from the owner it resolved, so the Session
   * owns what it reviews rather than borrowing another Tab's owner.
   */
  const ensureReviewRequestContext = useCallback(async (): Promise<ReviewRequestContext | { error: string }> => {
    if (reviewRequestContext) return reviewRequestContext;
    const cwd = selectedSession?.cwd;
    if (!selectedSession?.id || !cwd) return { error: "Open a Session in a Project to ask for a review." };
    const result = await reviewSync.open(cwd, selectedSession.id);
    if (result.status !== "ok") {
      return { error: result.status === "failed" ? result.message : "This Review could not be opened." };
    }
    const stored = result.value;
    setTabs((current) => current.some((tab) => tab.id === stored.tabId) ? current : [...current, {
      kind: "review",
      id: stored.tabId,
      owner: stored.owner,
      label: reviewTabLabel(stored.owner),
      ...(stored.selection ? { selection: stored.selection } : {}),
    }]);
    return { tabId: stored.tabId, owner: stored.owner };
  }, [reviewRequestContext, reviewSync, selectedSession]);

  /**
   * The bases a review could use, read from the Session's own directory.
   *
   * No Tab is opened to answer this: R18 gates the command on a Git root, and
   * a Tab is what running a review produces, not what offering one needs.
   */
  const handleListReviewBranches = useCallback(async (): Promise<{ branches: string[] } | { error: string }> => {
    const cwd = selectedSession?.cwd;
    if (!cwd) return { error: "Open a Session in a Project to ask for a review." };
    try {
      const response = await fetch(`/api/git/review/branches?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" });
      const data = await response.json() as { defaultBranch?: string; currentBranch?: string; branches?: string[]; error?: string };
      if (!response.ok || data.error) return { error: data.error ?? `HTTP ${response.status}` };
      return {
        branches: reviewBaseBranchChoices({
          defaultBranch: reviewBranchDisplayName(data.defaultBranch),
          currentBranch: reviewBranchDisplayName(data.currentBranch),
          recentBranches: data.branches ?? [],
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [selectedSession?.cwd]);

  /**
   * Whether the review command is enabled, and why not when it is disabled.
   * The entry is always offered; only this flag changes.
   */
  const [reviewGate, setReviewGate] = useState<{ enabled: boolean; reason?: string }>({ enabled: false });
  /**
   * When a review the human asked for was last dispatched, so the panel can
   * arm the experimental trigger for a review started from the composer as
   * well as from its own menu. An automatic review never bumps this: a
   * trigger that re-armed itself would outlive its bound.
   */
  const [reviewStartedAt, setReviewStartedAt] = useState(0);
  useEffect(() => {
    const cwd = selectedSession?.cwd;
    if (!cwd) {
      setReviewGate({ enabled: false, reason: "Open a Session in a Project to ask for a review." });
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/git/review/branches?cwd=${encodeURIComponent(cwd)}&probe=1`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as { gitRoot?: string | null; error?: string } | null;
        setReviewGate(response.ok && data?.gitRoot
          ? { enabled: true }
          : { enabled: false, reason: data?.error ?? "Reeve could not read this directory with Git." });
      })
      .catch(() => {
        if (!controller.signal.aborted) setReviewGate({ enabled: false, reason: "Reeve could not read this directory with Git." });
      });
    return () => controller.abort();
  }, [selectedSession?.cwd]);

  const handleRequestReview = useCallback(async (request: ReviewSlashRequest): Promise<ReviewSlashOutcome> => {
    const context = await ensureReviewRequestContext();
    if ("error" in context) return { kind: "error", error: context.error };
    /*
     * Read from storage rather than from this component's copy: the settings
     * surface writes there, and a copy taken at mount would send a review to
     * the place the human chose before they changed their mind.
     */
    const settings = readReviewSettings();
    try {
      const response = await fetch("/api/git/review/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewOwnerBody(context, {
          mode: request.mode,
          ...(request.base ? { base: request.base } : {}),
          message: request.message,
          // Defaulted here rather than at the route, so an armed trigger and
          // a typed command reach it through one contract.
          origin: request.origin ?? "requested",
          security: request.security === true,
          settings,
        })),
      });
      const data = await response.json() as { prompt?: string; delivery?: ReviewDelivery; error?: string };
      if (!response.ok || data.error || !data.prompt) {
        return { kind: "error", error: data.error ?? `HTTP ${response.status}` };
      }
      // A review the human asked for, wherever they asked from, is what arms
      // the experimental trigger. An automatic one must not re-arm it.
      if ((request.origin ?? "requested") === "requested") setReviewStartedAt(Date.now());
      if (data.delivery !== "review-chat") return { kind: "prompt", prompt: data.prompt };
      // A Session of its own, through the endpoint a new chat already uses,
      // started with the review as its first message.
      const created = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: context.owner.worktreePath, type: "prompt", message: data.prompt }),
      });
      const session = await created.json() as { sessionId?: string; error?: string };
      if (!created.ok || session.error || !session.sessionId) {
        return { kind: "error", error: session.error ?? `HTTP ${created.status}` };
      }
      const selected = await selectSessionById(session.sessionId);
      return selected
        ? { kind: "delivered", message: "Review started in its own chat" }
        : { kind: "error", error: "The review chat was created but could not be opened. It is in the sidebar." };
    } catch (error) {
      return { kind: "error", error: error instanceof Error ? error.message : String(error) };
    }
  }, [ensureReviewRequestContext, selectSessionById]);

  /**
   * The panel has no composer, so a review for this Session goes through the
   * composer's own send, which is the only account of whether a turn can
   * start now. A review the human asked for is left in the composer when a
   * run is in progress, so their request survives. A review nobody asked for
   * at that moment writes nothing: the composer holds human work, and the
   * panel asks again once the run ends.
   */
  const handlePanelRequestReview = useCallback(async (request: ReviewSlashRequest): Promise<ReviewSlashOutcome> => {
    const outcome = await handleRequestReview(request);
    if (outcome.kind !== "prompt") return outcome;
    const delivery = reviewComposerDelivery(request, chatInputRef.current?.submitText(outcome.prompt) ?? "unavailable");
    if (delivery.insertPrompt) chatInputRef.current?.insertText(outcome.prompt);
    return delivery.outcome;
  }, [handleRequestReview]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  /**
   * Keep the active Tab in sight.
   *
   * The strip scrolls sideways once the Tabs stop fitting, and a Tab chosen by
   * chord is often one that has scrolled off: Cmd+9 can select the ninth Tab
   * while it stays past the edge. `nearest` moves the strip by the least it
   * can, so a Tab already in sight does not jump.
   *
   * This lives here rather than in TabBar because TabBar is called as a plain
   * function by its tests, so it holds no hooks, and because this is where
   * selection changes.
   */
  useEffect(() => {
    if (!activeTabId) return;
    document
      .querySelector('[data-component="tab-bar"]')
      ?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);
  /** Every open Browser tab, kept for the persistent guests above. */
  const browserTabs = tabs.filter((t): t is BrowserTab => t.kind === "browser");
  /** Every open Terminal, kept for the persistent shells above. */
  const terminalTabs = tabs.filter((t): t is TerminalTab => t.kind === "terminal");

  /**
   * What a launcher entry does, in one place.
   *
   * A click on a launcher row calls this, and so does a chord from the
   * application menu, so a menu item and its row cannot drift into doing
   * different things. A surface that needs a Project and has none does
   * nothing: the menu item stays enabled because the menu is built once at
   * startup and cannot follow the Project, and opening a shell somewhere the
   * human did not choose is worse than a chord that does nothing.
   */
  /**
   * Open a Worktree's Review Tab, registering its binding first.
   *
   * The server resolves the Project and mints the Tab's id from the owner it
   * resolved, so what appears is the binding every later request is checked
   * against. A Session is bound only when it is the one working here; a
   * Project with none opens a Tab bound to the Project alone.
   */
  const openReviewTab = useCallback(async (cwd: string) => {
    const boundSession = selectedSession && reviewTabMatchesSession(cwd, selectedSession.cwd)
      ? selectedSession.id
      : null;
    /*
     * A Session the chat is showing but OMP is not recording cannot own a Tab,
     * and opening one against the Project instead would answer a question
     * nobody asked: the human selected that Session. The refusal is shown in
     * its own words. A Project-bound Tab is what opening with no Session
     * selected gives, and stays a deliberate choice.
     */
    const result = await reviewSync.open(cwd, boundSession);
    if (result.status === "superseded") return;
    if (result.status === "failed") {
      setReviewNotice(result.message);
      return;
    }
    // The human may have moved to another Project between the click and the
    // answer; a Tab for where they were is not one to open now.
    if (activeCwdRef.current !== cwd) return;
    const stored = result.value;
    setReviewNotice(null);
    setTabs((current) => current.some((tab) => tab.id === stored.tabId) ? current : [...current, {
      kind: "review",
      id: stored.tabId,
      owner: stored.owner,
      label: reviewTabLabel(stored.owner),
      ...(stored.selection ? { selection: stored.selection } : {}),
    }]);
    setActiveTabId(stored.tabId);
    setRightPanelOpen(true);
  }, [reviewSync, selectedSession]);

  const runPanelAction = useCallback((id: PanelActionId) => {
    switch (id) {
      case "terminal":
        if (supportsTerminalTabs && activeCwd) handleOpenTerminalTab(activeCwd);
        return;
      case "browser":
        if (supportsBrowserTabs) handleOpenBrowserTab("");
        return;
      case "files":
        if (activeCwd) {
          setPaletteFiles(true);
          setCommandPaletteOpen(true);
        }
        return;
      case "review": {
        if (!activeCwd) return;
        void openReviewTab(activeCwd);
        return;
      }
      case "side-chat":
        return;
      // A sixth surface is a typecheck failure here rather than a row that
      // silently does nothing.
      default: {
        const unreachable: never = id;
        return unreachable;
      }
    }
  }, [
    activeCwd,
    handleOpenBrowserTab,
    handleOpenTerminalTab,
    openReviewTab,
    supportsBrowserTabs,
    supportsTerminalTabs,
  ]);

  /**
   * Step to the Tab before or after the active one.
   *
   * The step wraps, so the strip is a ring rather than a line with two dead
   * ends. With nothing open there is nothing to step to.
   */
  const stepTab = useCallback((offset: number) => {
    const next = stepTabIndex(tabs.length, tabs.findIndex((tab) => tab.id === activeTabId), offset);
    if (next !== null) setActiveTabId(tabs[next].id);
  }, [activeTabId, tabs]);

  /** Jump to one Tab by its place in the strip, counting from one. */
  const focusTabAtPosition = useCallback((position: number) => {
    const tab = tabs[position - 1];
    if (tab) setActiveTabId(tab.id);
  }, [tabs]);

  /**
   * Bring back the Tab closed most recently.
   *
   * A Browser tab opens again at the address it held. It cannot be restored as
   * itself: the guest died with the Tab, and the id is what the agent
   * addresses, so a new Tab is honest where a resurrected id would not be.
   */
  const reopenClosedTab = useCallback(() => {
    const stack = closedTabsRef.current;
    const tab = stack.at(-1);
    if (!tab) return;
    closedTabsRef.current = stack.slice(0, -1);
    if (tab.kind === "browser") {
      handleOpenBrowserTab(tab.url);
      return;
    }
    if (tab.kind === "review") {
      // Closing forgot its binding, so reopening registers it again. Restoring
      // the Tab as it was would put a panel on screen whose every request is
      // refused, because nothing remembers what it is allowed to read.
      void openReviewTab(tab.owner.worktreePath);
      return;
    }
    setTabs((prev) => (prev.some((t) => t.id === tab.id) ? prev : [...prev, tab]));
    setActiveTabId(tab.id);
    setRightPanelOpen(true);
  }, [handleOpenBrowserTab, openReviewTab]);

  /** Close every Tab except the active one, keeping them all reopenable. */
  const closeOtherTabs = useCallback(() => {
    const keep = tabs.find((t) => t.id === activeTabId);
    if (!keep || tabs.length < 2) return;
    const closing = tabs.filter((t) => t.id !== keep.id && isReopenableTabKind(t.kind));
    closedTabsRef.current = [...closedTabsRef.current, ...closing].slice(-10);
    // Each closed Review Tab is forgotten as if it had been closed on its own,
    // or it would come back after a restart having been closed here.
    for (const tab of closing) {
      if (tab.kind !== "review") continue;
      void reviewSync.close({ tabId: tab.id, owner: tab.owner }).then((result) => {
        if (result.status === "failed") setReviewNotice(result.message);
      });
    }
    setTabs([keep]);
  }, [activeTabId, reviewSync, tabs]);

  /**
   * The three commands that belong to a Browser tab.
   *
   * Each is a no-op unless a Browser tab is the active one. The application
   * menu is built once at startup and cannot follow the strip, so the item
   * stays enabled and the decision is made here, where the strip is known.
   */
  const runBrowserCommand = useCallback((name: "address" | "back" | "forward") => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.kind !== "browser") return;
    if (name === "address") {
      const field = document.querySelector<HTMLInputElement>(
        `[data-omp-browser-address="${CSS.escape(tab.id)}"]`,
      );
      // Focusing it reveals the whole address and selects it, which the field
      // already does for a pointer. The chord gets the same behaviour.
      field?.focus();
      return;
    }
    void browserTabCommand(tab.id, name);
  }, [activeTabId, tabs]);

  /**
   * The launcher's entries: what the empty panel offers, and what the plus
   * control at the end of the strip opens.
   *
   * The order and the accelerators come from `lib/panel-actions.ts`, which the
   * application menu matches. The reference's order map puts review first for
   * a git-backed project, which every Reeve Project is.
   *
   * An entry whose feature is not built yet stays listed and says why: this is
   * how a human learns what the panel can hold.
   */
  const launcherActions: LauncherAction[] = [
    {
      id: "review",
      label: translate("tabs.review"),
      keys: acceleratorLabel(PANEL_ACCELERATORS.review),
      unavailableReason: activeCwd ? undefined : translate("tabs.needsProject"),
      run: () => runPanelAction("review"),
    },
    {
      id: "terminal",
      label: translate("tabs.terminal"),
      keys: acceleratorLabel(PANEL_ACCELERATORS.terminal),
      // The pty lives in the desktop process, so the browser version has no
      // shell to offer, and a shell needs a directory to start in. An
      // untrusted Project is refused later, by the desktop process itself.
      unavailableReason: !supportsTerminalTabs
        ? translate("tabs.desktopOnly")
        : (activeCwd ? undefined : translate("tabs.needsProject")),
      run: () => runPanelAction("terminal"),
    },
    {
      id: "browser",
      label: translate("tabs.browser"),
      keys: acceleratorLabel(PANEL_ACCELERATORS.browser),
      unavailableReason: supportsBrowserTabs ? undefined : translate("tabs.desktopOnly"),
      // The reference opens its own new tab page. Reeve has none, so a new
      // Browser tab opens empty with the address focused, which is the same
      // act: the human says where to go.
      run: () => runPanelAction("browser"),
    },
    {
      id: "files",
      label: translate("tabs.files"),
      keys: acceleratorLabel(PANEL_ACCELERATORS.files),
      // The command palette already searches files in the active Project, so
      // this opens it there rather than adding a second picker. Without a
      // Project there is nothing to search, and saying so is more use than
      // saying the feature does not exist.
      unavailableReason: activeCwd ? undefined : translate("tabs.needsProject"),
      run: () => runPanelAction("files"),
    },
    {
      id: "side-chat",
      label: translate("tabs.sideChat"),
      keys: acceleratorLabel(PANEL_ACCELERATORS["side-chat"]),
      // Reeve has Quick chat, which is a window rather than a Tab. Whether it
      // becomes one is a decision, not an oversight.
      unavailableReason: translate("tabs.notYetBuilt"),
      run: () => runPanelAction("side-chat"),
    },
  ];

  /**
   * The active Tab's own surface.
   *
   * A Browser tab renders nothing here: its guest is mounted separately and
   * always, and this would unmount it. The switch is exhaustive on purpose, so
   * a new Tab kind is a typecheck failure at this line rather than a silent
   * fall through to the empty state.
   */
  function renderActiveTab(): ReactNode {
    if (!activeTab) {
      // The empty panel is the launcher, not a sentence. Before this, it said
      // "No file open", which told a human nothing about what the panel holds.
      return <Launcher actions={launcherActions} label={translate("tabs.suggested")} />;
    }
    switch (activeTab.kind) {
      case "review":
        return <ReviewPanel active={rightPanelOpen} key={activeTab.id} tabId={activeTab.id} owner={activeTab.owner} selection={activeTab.selection}
          /*
           * The panel says which Review is opening which file at which line;
           * turning that into a Tab is this layer's business, so it arrives as
           * a plain third argument and is adapted here. The parameter is
           * optional, so the panel may pass it or not.
           */
          onOpenFile={(filePath: string, fileName: string, origin?: FileReviewOrigin) =>
            handleOpenFile(filePath, fileName, { reviewOrigin: origin })}
          /*
           * A Review Tab keeps the Project and Worktree it was opened in, and
           * its paths are relative to them. The composer belongs to the
           * selected Session, so a mention is offered only while that Session
           * is this Tab's own; otherwise Review hides the control rather than
           * writing a path the chat cannot resolve.
           */
          onAtMention={reviewComposerSessionId(activeTab.owner, activeCwd, selectedSession?.id ?? null)
            ? (relativePath) => handleAtMention(relativePath, false)
            : undefined}
          /*
           * Comments belong to the Session they were written beside, and are
           * handed over under the same agreement as a mention. The text is
           * inserted into the composer and never sent: the human decides when
           * the agent hears about a review.
           */
          onAddToComposer={reviewComposerSessionId(activeTab.owner, activeCwd, selectedSession?.id ?? null)
            ? (text) => chatInputRef.current?.insertText(text)
            : undefined}
          /* Offered, never taken; the delivery choice is picked per review. */
          onRequestReview={reviewRequestContext && reviewRequestContext.tabId === activeTab.id ? handlePanelRequestReview : undefined}
          reviewStartedAt={reviewStartedAt}
          delivery={reviewDelivery}
          onDeliveryChange={handleReviewDeliveryChange}
          onSelectionChange={(selection) => setTabs((current) => current.map((tab) =>
            tab.kind === "review" && tab.id === activeTab.id ? { ...tab, selection } : tab))} />;
      case "browser":
        return null;
      case "terminal":
        // Mounted separately and always, like a Browser tab, because the shell
        // behind it is a live process.
        return null;
      case "sources":
        return (
          <SourcesView
            sources={activeTab.sources}
            onOpenFile={(filePath) => handleOpenFile(
              filePath,
              getFileName(filePath),
              { sourceSessionId: activeTab.sourceSessionId },
            )}
          />
        );
      case "file":
        return (
          <FileViewer
            filePath={activeTab.filePath}
            cwd={activeCwd ?? undefined}
            sourceSessionId={activeTab.sourceSessionId}
            gitRefreshKey={fileViewerRefreshKey}
            initialDisplayMode={activeTab.initialDisplayMode}
            reviewOrigin={activeTab.reviewOrigin}
            /*
             * The Review this file was opened from, resolved now rather than
             * remembered: its owner and what it is comparing live on that Tab.
             * A Tab that has since closed resolves to null, which the view
             * reports — an owner is never guessed for a Review nobody holds.
             */
            review={reviewSourceContext(tabs, activeTab.reviewOrigin)}
            onMentionLines={rightPanelOpen ? handleFileLineMention : undefined}
            onAtMention={handleAtMention}
            onOpenFile={(filePath) => handleOpenFile(
              filePath,
              getFileName(filePath),
              { sourceSessionId: activeTab.sourceSessionId },
            )}
          />
        );
      default:
        // A new Tab kind must be handled above. This line stops compiling when
        // one is added, which is the point: ReactNode includes undefined, so
        // falling out of the switch would otherwise be silently legal and the
        // new kind would render as the empty state.
        return assertNeverTab(activeTab);
    }
  }
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
    // Nine numbered chords would be nine more cases below, and the switch is
    // easier to read without them.
    if (isTabFocusAction(action)) {
      focusTabAtPosition(TAB_FOCUS_POSITIONS[action]);
      return;
    }
    switch (action) {
      case "toggle-sidebar":
        handleSidebarToggle();
        return;
      case "new-chat":
        if (activeCwd) handleNewSession(`menu:${Date.now()}`, activeCwd);
        else void handleNewProjectlessSession();
        return;
      case "open-review-tab":
        runPanelAction("review");
        return;
      case "open-terminal-tab":
        runPanelAction("terminal");
        return;
      case "open-browser-tab":
        runPanelAction("browser");
        return;
      case "open-files":
        runPanelAction("files");
        return;
      case "next-tab":
        stepTab(1);
        return;
      case "previous-tab":
        stepTab(-1);
        return;
      case "reopen-closed-tab":
        reopenClosedTab();
        return;
      case "close-other-tabs":
        closeOtherTabs();
        return;
      case "focus-browser-address":
        runBrowserCommand("address");
        return;
      case "browser-back":
        runBrowserCommand("back");
        return;
      case "browser-forward":
        runBrowserCommand("forward");
        return;
      case "toggle-maximise-panel":
        // A closed panel has no width to fill, so open it first. The chord then
        // reads as "show me this", which is what a human means by it.
        setRightPanelOpen(true);
        toggleRightPanelMaximised();
        return;
      case "toggle-panel":
        toggleRightPanel();
        return;
      // A new menu action is a typecheck failure here rather than a chord
      // that reaches nothing.
      default: {
        const unreachable: never = action;
        return unreachable;
      }
    }
  }), [
    activeCwd,
    closeOtherTabs,
    focusTabAtPosition,
    handleNewSession,
    handleNewProjectlessSession,
    handleSidebarToggle,
    reopenClosedTab,
    runPanelAction,
    runBrowserCommand,
    stepTab,
    toggleRightPanel,
    toggleRightPanelMaximised,
  ]);

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
    setTabs((current) => current.map((tab) => {
      if (tab.kind !== "sources" || tab.sourceSessionId !== sourceSessionId) return tab;
      if (tab.sources === visibleSummarySources) return tab;
      return { ...tab, sources: visibleSummarySources };
    }));
  }, [selectedSession?.id, visibleSummarySources]);

  const handleViewAllSources = useCallback(() => {
    const sourceSessionId = selectedSession?.id ?? null;
    const tabId = `sources:${sourceSessionId ?? "new"}`;
    setTabs((current) => {
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
    setActiveTabId(tabId);
    setRightPanelOpen(true);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, selectedSession?.id, translate, visibleSummarySources]);

  return (
    <>
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
             <PanelVisibilityToggle open={rightPanelOpen} onToggle={toggleRightPanel} />
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
              onRequestReview={handleRequestReview}
              onListReviewBranches={handleListReviewBranches}
              reviewGate={reviewGate}
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
          content: (
            <>
              {/*
                * Every Browser tab is mounted whenever one exists, not only
                * when a Browser tab is active. A guest reloads if it is
                * unmounted, so switching to a file and back would otherwise
                * throw the page away.
                */}
              {browserTabs.length > 0 && (
                <BrowserTabs
                  tabs={browserTabs}
                  activeTabId={activeTab?.kind === "browser" ? activeTab.id : null}
                  onNavigate={handleBrowserNavigate}
                  onTitleChange={handleBrowserTitle}
                  onFaviconChange={handleBrowserFavicon}
                />
              )}
              {/*
                * Every Terminal is mounted whenever one exists, for the same
                * reason: a shell is a live process, and unmounting its view
                * would throw away the scrollback the human is reading.
                */}
              {terminalTabs.length > 0 && (
                <TerminalTabs
                  tabs={terminalTabs}
                  activeTabId={activeTab?.kind === "terminal" ? activeTab.id : null}
                  onTitleChange={handleTerminalTitle}
                />
              )}
              {/*
                * What Reeve could not remember about Review, said where the
                * Tabs are rather than in a log nobody reads.
                */}
              {reviewNotice && (
                <div role="alert" data-component="review-sync-notice" className={shellStyles.workspaceState}>
                  <div className={shellStyles.workspaceError}>{reviewNotice}</div>
                  <button type="button" className={shellStyles.workspaceRetry}
                    onClick={() => setReviewSyncRetry((value) => value + 1)}>
                    {translate("workspace.retry")}
                  </button>
                </div>
              )}
              {renderActiveTab()}
            </>
          ),
          header: (
            <>
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId ?? ""}
                onSelectTab={setActiveTabId}
                onCloseTab={handleCloseTab}
                newTabActions={launcherActions}
                onBrowserTabMenu={hasBrowserTabMenu() ? handleBrowserTabMenu : undefined}
              />
              <PanelControls
                maximised={rightPanelMaximised}
                onToggleMaximised={toggleRightPanelMaximised}
                panelOpen={rightPanelOpen}
                onTogglePanel={toggleRightPanel}
              />
            </>
          ),
          label: activeTab?.kind === "sources" ? translate("summary.sources") : translate("files.panel"),
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
        onClose={() => {
          setSettingsConfigOpen(false);
          // The settings surface writes the delivery choice; the panel shows
          // it, so it reads it again on the way out.
          setReviewDelivery(readReviewSettings().delivery);
        }}
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
    {renamingBrowserTab !== null && (
      <RenameDialog
        open
        initialName={tabs.find((t) => t.id === renamingBrowserTab)?.label ?? ""}
        title={translate("browser.renameTab")}
        description={translate("browser.renameTabDescription")}
        onCancel={() => setRenamingBrowserTab(null)}
        onSave={handleRenameBrowserTab}
      />
    )}
    </>
  );
}

function isManagedChatCwd(cwd: string | null | undefined): boolean {
  return typeof cwd === "string" && /[\\/]omp-cwd-\d{8}$/.test(cwd);
}
