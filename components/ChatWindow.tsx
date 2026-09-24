"use client";
import { registerAbortHandler } from "@/hooks/useKeyboardShortcuts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  BashExecutionMessage,
  BlockingExtensionUiRequest,
  CustomMessage,
  SessionInfo,
  SessionTreeNode,
  SubagentSnapshot,
  ToolResultMessage,
  UserMessage,
} from "@/lib/types";
import { getAssistantErrorMessage, getDisplayableAssistantBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { extractTurnWrittenFiles, type WrittenFile } from "@/lib/turn-written-files";
import type { TurnClock, TurnPhase } from "@/lib/transcript/turn-folder";
import { collectSessionSummarySources, type SummarySource } from "@/lib/session-summary";
import { MessageView } from "./MessageView";
import { ModelChangedNote } from "./chat/ModelChangedNote";
import { FallbackRoutingNote } from "./chat/FallbackRoutingNote";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ExtensionStatusBar } from "./ExtensionStatusBar";
import { useI18n } from "@/hooks/useI18n";
import { useAgentSession, type AgentPhase, type NoticeItem } from "@/hooks/useAgentSession";
import { useDragDrop } from "@/hooks/useDragDrop";
import { getSecureAttachmentPicker } from "@/lib/desktop-attachments";
import type { ProjectTrustStatus } from "@/lib/api-types";
import type { SessionRelocationResult } from "@/lib/session-relocation";
import type { AgentControlReply, AgentControlRequestEvent } from "@/lib/agent-control/types";
import type { ReviewSlashOutcome, ReviewSlashRequest } from "@/lib/review-slash-entries";
import type { SessionStatsInfo } from "@/lib/omp-types";
import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import { getVisibleRenderWindow } from "@/lib/chat-lazy-load";
import { ExtensionCustomPanel, ExtensionDialog } from "./chat/ExtensionDialogs";
import { ApprovalNudge } from "./chat/ApprovalNudge";
import { QuestionRequestPanel, type QuestionRequest } from "./chat/QuestionRequestPanel";
import { EmptyChatHome } from "./chat/EmptyChatHome";
import { NewMessagesControl } from "./chat/NewMessagesControl";
import { LatestTurnPreview } from "./chat/LatestTurnPreview";
import { ComposerTurnStatus } from "./chat/ComposerTurnStatus";
import { GoalPill } from "./chat/GoalPill";
import { GoalSetDialog, type GoalAttachment } from "./chat/GoalSetDialog";
import { ActiveTurnResponseSpacer } from "./chat/ActiveTurnResponseSpacer";
import { SessionLoadingState } from "./chat/SessionLoadingState";
import { TurnErrorBoundary } from "./chat/TurnErrorBoundary";
import { HistoryLoadFailureRow } from "./chat/HistoryLoadFailureRow";
import { buildTranscriptRows, dividerPresentation, finalAnswerPosition, presentationAssistantPosition, CompactionNote, ProviderRetryNote, SessionOriginNote, UsageLimitNote, type TranscriptMessageRow } from "./chat/transcript-rows";
import { Divider } from "./chat/Divider";
import { ActivityHeader } from "./chat/ActivityRow";
import type { ActivityCall } from "@/lib/transcript/repeat-collapsing";
import { selectLiveActivityHeader } from "@/lib/transcript/live-activity-header";
import { ArchivedSessionCard } from "./chat/ArchivedSessionCard";
import {
  TranscriptNavigationRail,
  buildTranscriptNavigationItems,
  type TranscriptNavigationItem,
} from "./chat/TranscriptNavigationRail";
import { followPhaseFromRows, prefersReducedMotion, resolveScrollBehavior } from "./chat/transcript-follow";
import { useTranscriptHeightRestoration } from "./chat/useTranscriptHeightRestoration";
import { useTranscriptFollow } from "./chat/useTranscriptFollow";
import { DynamicStyleVars } from "./ui/DynamicStyleVars";
import { stripAnsi } from "@/lib/ansi";
import { useTranscriptHistory } from "./chat/useTranscriptHistory";
import styles from "./chat/chat-window.module.css";

const SHOW_EXTENSION_WIDGETS = false;

const QUESTION_DEBUG_REQUEST: QuestionRequest = {
  type: "extension_ui_request",
  id: "question-debug",
  method: "ask",
  questions: [
    {
      id: "scope",
      header: "Scope",
      question: "Which part should Reeve change?",
      options: [
        { label: "Chat interface", description: "Change the main conversation view", preview: "components/ChatWindow.tsx" },
        { label: "Composer", description: "Change the message input and controls" },
      ],
      recommended: 0,
    },
    {
      id: "checks",
      header: "Verification",
      question: "Which checks should Reeve run?",
      options: [{ label: "Tests" }, { label: "Visual inspection" }],
      multi: true,
    },
  ],
};

interface Props {
  compactHome?: ReactNode;
  scrollOrigin?: "bottom" | "top";
  preserveFooterPosition?: boolean;
  registerGlobalAbort?: boolean;
  newDraftKey?: string;
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onAttentionNeeded?: (request: BlockingExtensionUiRequest) => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionRestored?: () => void;
  onSessionForked?: (newSessionId: string) => void;
  onOpenSession?: (sessionId: string) => void;
  onSessionNameChanged?: (sessionId: string, name: string) => void;
  /** Answer an agent control request for this Session. See AppShell. */
  onAgentControlRequest?: (request: AgentControlRequestEvent) => AgentControlReply | null;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (stats: SessionStatsInfo | null) => void;
  onSummarySourcesChange?: (sources: SummarySource[]) => void;
  onGoalTabState?: (sessionId: string, goal: Goal | null, onSave: (objective: string, tokenBudget: number | null) => Promise<boolean>, open: boolean) => void;
  onOpenFile?: (filePath: string) => void;
  onSubagentsChange?: (subagents: SubagentSnapshot[]) => void;
  onOpenSubagent?: (id: string) => void;
  /** Completion sound state + controls, owned by AppShell so tasks finishing in
   *  a non-active workspace can still ring. */
  soundEnabled?: boolean;
  playDoneSound?: () => void;
  unlockAudio?: () => void;
  projectTrust?: ProjectTrustStatus | null;
  onProjectTrustClick?: () => void;
  homeContextLabel?: string;
  homeProjectless?: boolean;
  homeProjectPath?: string | null;
  onHomeProjectSelected?: (path: string) => void;
  onHomeProjectlessSelected?: () => void;
  onSelectWorktree?: (path: string) => void;
  onRegisterProjectCommand?: (open: () => void) => void;
  onWorkspaceRelocated?: (result: SessionRelocationResult) => void;
  /**
   * Compose and deliver a review the human asked for, bound to the Review
   * this Session owns. Absent when it owns none.
   */
  onRequestReview?: (request: ReviewSlashRequest) => Promise<ReviewSlashOutcome>;
  /** The base branches the review submenu offers, or why it cannot list them. */
  onListReviewBranches?: () => Promise<{ branches: string[] } | { error: string }>;
  /** Whether the review command is enabled, and why not when it is disabled. */
  reviewGate?: { enabled: boolean; reason?: string };
  historyLoadFailure?: { retry: () => void; retrying?: boolean };
}

function phaseLabel(phase: AgentPhase, t: (key: string, params?: Record<string, string | number>) => string): string | null {
  if (phase?.kind === "running_tools") {
    const names = phase.tools.map((t) => t.name);
    if (names.length === 0) return t("chat.runningTool");
    if (names.length === 1) return t("chat.runningNamedTool", { name: names[0] });
    if (names.length <= 3) return t("chat.runningTools", { names: names.join(", ") });
    return t("chat.runningToolsMore", { names: names.slice(0, 2).join(", "), count: names.length - 2 });
  }
  if (phase?.kind === "waiting_model") return t("chat.thinking");
  if (phase?.kind === "running_command") return t("chat.runningCommand");
  return null;
}

function getUserInputText(message: AgentMessage): string | null {
  if (message.role !== "user") return null;
  if (typeof message.content === "string") {
    const text = message.content.trim();
    return text.length > 0 ? text : null;
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function hasDisplayableProcessMessage(message: AgentMessage): boolean {
  if (message.role === "assistant") {
    return getDisplayableAssistantBlocks(message as AssistantMessage).length > 0;
  }
  return message.role === "custom";
}

// A user message normally anchors a turn (user prompt → process → final
// answer), and the process messages in between get folded into a collapsed
// Divider. When compaction fires mid-turn, omp drops the original user prompt
// and inserts a compaction summary (role "custom", customType
// "compaction") in its place; the agent then keeps producing tool calls and a
// final answer with no user message left to anchor them. Treat a compaction
// summary as an anchor too, otherwise every post-compaction message renders
// standalone and never collapses.
function isGroupAnchor(message: AgentMessage): boolean {
  if (message.role === "user") return true;
  return message.role === "custom" && (message as CustomMessage).customType === "compaction";
}

function withAssistantBlocks(
  message: AssistantMessage,
  content: AssistantContentBlock[],
  options: { omitUsage?: boolean } = {},
): AssistantMessage {
  const next = { ...message, content };
  if (options.omitUsage) next.usage = undefined;
  return next;
}

export function ChatWindow({ compactHome, scrollOrigin = "bottom", preserveFooterPosition = true, registerGlobalAbort = true, newDraftKey, session, newSessionCwd, onAgentEnd, onAttentionNeeded, onSessionCreated, onSessionRestored, onSessionForked, onOpenSession = () => {}, onSessionNameChanged, onAgentControlRequest, modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, onSessionStatsChange, onSummarySourcesChange, onGoalTabState, onSubagentsChange, onOpenSubagent, onOpenFile, soundEnabled = true, playDoneSound = () => {}, unlockAudio, projectTrust, onProjectTrustClick, homeContextLabel = "Chats", homeProjectless = false, homeProjectPath = null, onHomeProjectSelected = () => {}, onHomeProjectlessSelected = () => {}, onSelectWorktree, onRegisterProjectCommand, onWorkspaceRelocated, onRequestReview, onListReviewBranches, reviewGate, historyLoadFailure }: Props) {
  const { t } = useI18n();

  // Wrap onAgentEnd to play the completion sound. This is more reliable than
  // wrapping handleAgentEventRef because useAgentSession overwrites that ref
  // on every render (it syncs the latest callback), which would blow away an
  // externally-installed wrapper after the first re-render.
  const playDoneSoundRef = useRef(playDoneSound);
  playDoneSoundRef.current = playDoneSound;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const soundedExtensionDialogIdRef = useRef<string | null>(null);
  const wrappedOnAgentEnd = useCallback(() => {
    if (soundEnabledRef.current) {
      playDoneSoundRef.current();
    }
    onAgentEnd?.();
  }, [onAgentEnd]);

  const {
    data: sessionData, loading, error, activeLeafId, messages, entryIds, streamState,
    agentRunning, bashRunning, pendingBash, modelNames, modelList, modelError, modelScopeWarnings, modelScopeConfigured, modelThinkingLevels, modelThinkingLevelMaps, modelRoles, toolPreset, approvalMode, approvalModeChanging, approvalModeError, thinkingLevel, fastModeEnabled, fastModeAvailable,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, compactError, compactResult, compactSource, displayModel: displayModelValue, modelSwitching, sessionStats,
    slashCommands, slashCommandsLoading, queuedMessages, subagents,
    goalState, handleGoalSubmit,
    notices, extensionDialog, extensionCustomUi, extensionStatuses, extensionWidgets, respondToExtensionUi, sendExtensionCustomInput,
    approvalNudgeOpen, approvalDialogId, handleApprovalNudgeAccept, handleApprovalNudgeDismiss,
    isAutoModelSelection,
    agentPhase,
    isNew,
    activeTurnHeld,
    sessionIdRef,
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange, handleRoleModelChange, addNotice,
    handleCompact, handleSteer, handleFollowUp, handlePromptWithStreamingBehavior, handleAbortCompaction,
    handleDeleteQueuedMessage, handleUndoDeletedQueuedMessage,
    handleEditQueuedMessage, handleCancelQueuedMessageEdit, handleCompleteQueuedMessageEdit,
    handleReorderQueuedMessages, handleRetryQueuedMessage, handleSendQueuedMessageNow, handleResumeQueuedMessages, handleResolvePausedQueueSubmission,
    releaseActiveTurnHold,
    handleBuiltinSlashCommand,
    handleToolPresetChange, handleApprovalModeChange, handleThinkingLevelChange, handleCycleThinkingLevel, handleFastModeChange, loadTools, loadSlashCommands, ensureNewSession,
  } = useAgentSession({
    session, newSessionCwd, onAgentEnd: wrappedOnAgentEnd, onAttentionNeeded, onSessionCreated, onSessionForked, onSessionNameChanged,
    onAgentControlRequest, modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, onRequestReview, translate: t,
  });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const sessionBusy = agentRunning || bashRunning;
  useEffect(() => {
    if (!onGoalTabState || !session?.id) return;
    onGoalTabState(session.id, goalState.goal, goalState.update, false);
  }, [goalState.goal, goalState.update, onGoalTabState, session?.id]);
  const handleWorkspaceRelocated = useCallback((result: SessionRelocationResult) => {
    void loadTools(result.sessionId);
    onWorkspaceRelocated?.(result);
  }, [loadTools, onWorkspaceRelocated]);
  const handleEditContent = useCallback((message: UserMessage) => {
    chatInputRef?.current?.replaceMessage(message);
  }, [chatInputRef]);
  const handleEditSubmit = useCallback(async (message: UserMessage, text: string, previousEntryId: string) => {
    await handleNavigate(previousEntryId);
    const images = typeof message.content === "string" ? undefined : message.content.flatMap((block) => {
      if (block.type !== "image" || block.source.type !== "base64" || !block.source.data) return [];
      return [{
        data: block.source.data,
        mimeType: block.source.media_type ?? "image/png",
        previewUrl: `data:${block.source.media_type ?? "image/png"};base64,${block.source.data}`,
      }];
    });
    const sent = await handleSend(text, images);
    if (!sent) throw new Error("Failed to edit message");
  }, [handleNavigate, handleSend]);
  const showActiveTurnResponseSpacer = agentRunning || streamState.isStreaming;

  useEffect(() => {
    if (!extensionDialog || soundedExtensionDialogIdRef.current === extensionDialog.id) return;
    soundedExtensionDialogIdRef.current = extensionDialog.id;
    playDoneSoundRef.current();
  }, [extensionDialog]);

  // Register the abort handler for the global Esc shortcut
  useEffect(() => {
    if (registerGlobalAbort) registerAbortHandler(sessionBusy ? handleAbort : null);
  }, [sessionBusy, handleAbort, registerGlobalAbort]);

  const [goalEntryDraft, setGoalEntryDraft] = useState<{ objective: string; attachments: GoalAttachment[] } | null>(null);
  const openGoalDialog = (objective: string, images: import("@/hooks/useAgentSession").AttachedImage[] = []) => {
    setGoalEntryDraft({ objective, attachments: images });
  };
  const [turnStatusDebug, setTurnStatusDebug] = useState(false);
  const [questionDebug, setQuestionDebug] = useState(false);
  const transcriptContentRef = useRef<HTMLDivElement>(null);
  const transcriptHistory = useTranscriptHistory({
    containerRef: scrollContainerRef,
    sessionKey: session?.id ?? newDraftKey ?? newSessionCwd,
    sessionId: session?.id ?? null,
    leafId: activeLeafId,
    pagedHiddenHistory: Boolean(session?.id),
    autoLoadOnMount: scrollOrigin === "top",
  });
  const { visibleCount, sentinelRef } = transcriptHistory;
  const transcriptNavigationItems = useMemo(
    () => buildTranscriptNavigationItems(messages, entryIds),
    [entryIds, messages],
  );
  const revealTranscriptNavigationItem = useCallback(async (
    item: TranscriptNavigationItem,
    behavior: ScrollBehavior,
  ) => {
    transcriptHistory.revealAll(messages.length);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const container = scrollContainerRef.current;
    if (!container) return;
    const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(item.id)
      : item.id.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const target = container.querySelector<HTMLElement>(`[data-transcript-navigation-id="${escapedId}"]`);
    if (!target) return;
    target.scrollIntoView({
      behavior: resolveScrollBehavior(behavior, prefersReducedMotion()),
      block: "start",
    });
    target.animate?.([
      { backgroundColor: "color-mix(in srgb, var(--ui-text) 14%, transparent)" },
      { backgroundColor: "color-mix(in srgb, var(--ui-text) 14%, transparent)", offset: .35 },
      { backgroundColor: "transparent" },
    ], {
      duration: prefersReducedMotion() ? 0 : 350,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  }, [messages.length, scrollContainerRef, transcriptHistory.revealAll]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(window.location.search);
    setTurnStatusDebug(params.has("turnStatusDebug"));
    setQuestionDebug(params.has("questionDebug"));
  }, []);

  // Push session stats up to AppShell for the top bar.
  // Compare scalar fields to avoid loops from new object identity each render.
  const statsKey = sessionStats
    ? [
      sessionStats.sessionId,
      sessionStats.sessionFile ?? "",
      sessionStats.sessionName ?? "",
      sessionStats.userMessages,
      sessionStats.assistantMessages,
      sessionStats.toolCalls,
      sessionStats.toolResults,
      sessionStats.totalMessages,
      sessionStats.tokens.input,
      sessionStats.tokens.output,
      sessionStats.tokens.cacheRead,
      sessionStats.tokens.cacheWrite,
      sessionStats.tokens.total,
      sessionStats.cost ?? 0,
      sessionStats.totalActiveMs ?? 0,
    ].join("|")
    : null;
  const sessionStatsRef = useRef(sessionStats);
  sessionStatsRef.current = sessionStats;
  useEffect(() => {
    onSessionStatsChange?.(sessionStatsRef.current);
  }, [statsKey, onSessionStatsChange]);
  useEffect(() => () => { onSessionStatsChange?.(null); }, [onSessionStatsChange]);

  useEffect(() => {
    onSubagentsChange?.(subagents);
  }, [onSubagentsChange, subagents]);
  useEffect(() => () => { onSubagentsChange?.([]); }, [onSubagentsChange]);


  const onDrop = useCallback((files: File[], text?: string) => {
    if (sessionBusy) return;
    if (text) chatInputRef?.current?.addDroppedText(text);
    else chatInputRef?.current?.addDroppedFiles(files);
  }, [sessionBusy, chatInputRef]);

  const { isDragOver, dropKind, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop, true);

  // Stable Map identity: `messages` doesn't change during streaming updates
  // (the streaming message lives in streamState), so memoized MessageViews
  // skip re-rendering on every message_update event. An inline `new Map()`
  // here used to defeat MessageView's memo() on each streamed chunk.
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, ToolResultMessage>();
    for (const msg of messages) {
      if (msg.role === "toolResult") {
        map.set((msg as ToolResultMessage).toolCallId, msg as ToolResultMessage);
      }
    }
    return map;
  }, [messages]);
  const activeStreamingMessage = streamState.streamingMessage as AgentMessage | null;
  const archivedSessionId = session && "archived" in session && session.archived === true ? session.id : undefined;
  const sessionOrigin = session?.parentSessionId
    ? { kind: "continued" as const, relatedSessionId: session.parentSessionId }
    : undefined;
  const transcriptRows = useMemo(
    () => archivedSessionId
      ? [{ kind: "archived" as const, sessionId: archivedSessionId }]
      : buildTranscriptRows(
          messages,
          entryIds,
          activeStreamingMessage,
          agentRunning,
          sessionData?.context.modelChanges ?? [],
          isCompacting || compactError ? { isCompacting, source: compactSource, error: compactError } : null,
          sessionOrigin,
          sessionData?.context.fallbackRoutes ?? [],
        ),
    [
      messages,
      entryIds,
      activeStreamingMessage,
      agentRunning,
      sessionData?.context.modelChanges,
      archivedSessionId,
      isCompacting,
      compactSource,
      compactError,
      sessionOrigin?.relatedSessionId,
      sessionData?.context.fallbackRoutes,
    ],
  );
  const activeTurnBlocks = useMemo(() => {
    let turnStart = -1;
    if (!turnStatusDebug) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (isGroupAnchor(messages[index])) {
          turnStart = index;
          break;
        }
      }
    }

    const blocks: AssistantContentBlock[] = [];
    for (let index = turnStart + 1; index < messages.length; index += 1) {
      const message = messages[index];
      if (message?.role === "assistant") blocks.push(...(message as AssistantMessage).content);
    }
    if (activeStreamingMessage?.role === "assistant") {
      blocks.push(...(activeStreamingMessage as AssistantMessage).content);
    }
    return blocks;
  }, [messages, activeStreamingMessage, turnStatusDebug]);
  const followPhase = followPhaseFromRows(transcriptRows);
  const latestTurn = useMemo(() => {
    for (let index = transcriptRows.length - 1; index >= 0; index -= 1) {
      const row = transcriptRows[index];
      if (row.kind === "turn") return row;
    }
    return null;
  }, [transcriptRows]);
  const isEmptyNew = isNew && messages.length === 0 && !streamState.isStreaming && !sessionBusy;
  const transcriptFollow = useTranscriptFollow({
    scrollContainerRef,
    contentRef: transcriptContentRef,
    footerRef,
    phase: followPhase,
    working: sessionBusy || streamState.isStreaming,
    activeTurnHeld,
    contentChange: streamState.streamingMessage ?? pendingBash,
    messageCount: messages.length,
    sessionKey: session?.id ?? newDraftKey ?? newSessionCwd,
    sessionId: session?.id ?? null,
    layoutReady: !loading && !error && !isEmptyNew,
    origin: scrollOrigin,
    compactPresentation: compactHome !== undefined,
    preserveFooterPosition,
    historyVersion: visibleCount,
    onNeedHistory: transcriptHistory.requestMoreHistory,
    onGoToNewest: releaseActiveTurnHold,
  });
  const inputHistory = useMemo(() => {
    const seen = new Set<string>();
    const history: string[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = getUserInputText(messages[i]);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      history.push(text);
      if (history.length >= 50) break;
    }
    return history.reverse();
  }, [messages]);

  useTranscriptHeightRestoration(
    scrollContainerRef,
    transcriptContentRef,
    session?.id ?? newDraftKey ?? newSessionCwd,
    !loading && !error && !isEmptyNew,
  );
  const displayedExtensionDialog = questionDebug ? QUESTION_DEBUG_REQUEST : extensionDialog;
  const messageCwd = session?.cwd ?? newSessionCwd ?? undefined;
  const summarySources = useMemo(
    () => collectSessionSummarySources(messages, messageCwd),
    [messageCwd, messages],
  );

  useEffect(() => {
    onSummarySourcesChange?.(summarySources);
  }, [onSummarySourcesChange, summarySources]);
  useEffect(() => () => { onSummarySourcesChange?.([]); }, [onSummarySourcesChange]);

  const availableThinkingLevels = displayModelValue
    ? (modelThinkingLevels[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const currentThinkingLevelMap = displayModelValue
    ? (modelThinkingLevelMaps[`${displayModelValue.provider}:${displayModelValue.modelId}`] ?? null)
    : null;

  const chatInputElement = (
    <ChatInput
      ref={chatInputRef}
      requestPending={displayedExtensionDialog?.method === "ask"}
      continuationPending={goalState.continuationPending}
      onSend={handleSend}
      onOpenGoal={openGoalDialog}
      onAbort={handleAbort}
      onSteer={agentRunning ? handleSteer : undefined}
      onFollowUp={agentRunning ? handleFollowUp : undefined}
      onPromptWithStreamingBehavior={agentRunning ? handlePromptWithStreamingBehavior : undefined}
      isStreaming={sessionBusy}
      model={displayModelValue}
      isAutoModelSelection={isAutoModelSelection}
      explicitModelOverride={isNew ? !isAutoModelSelection : Boolean(displayModelValue && modelRoles.some((role) => (
        role.role === "default" && role.resolved && (
          role.resolved.provider !== displayModelValue.provider || role.resolved.modelId !== displayModelValue.modelId
        )
      )))}
      modelNames={modelNames}
      modelList={modelList}
      modelError={modelError}
      modelScopeWarnings={modelScopeWarnings}
      modelScopeConfigured={modelScopeConfigured}
      onModelChange={handleModelChange}
      modelRoles={modelRoles}
      onRoleModelChange={handleRoleModelChange}
      modelSwitching={modelSwitching}
      onCompact={session || isNew ? handleCompact : undefined}
      onAbortCompaction={handleAbortCompaction}
      isCompacting={isCompacting}
      compactError={compactError}
      compactResult={compactResult}
      toolPreset={toolPreset}
      onToolPresetChange={session || isNew ? handleToolPresetChange : undefined}
      thinkingLevel={thinkingLevel}
      onThinkingLevelChange={session || isNew ? handleThinkingLevelChange : undefined}
      onCycleThinkingLevel={session || isNew ? handleCycleThinkingLevel : undefined}
      fastModeEnabled={fastModeEnabled}
      fastModeAvailable={fastModeAvailable}
      onFastModeChange={session || isNew ? handleFastModeChange : undefined}
      availableThinkingLevels={availableThinkingLevels}
      modelThinkingLevels={modelThinkingLevels}
      thinkingLevelMap={currentThinkingLevelMap}
      retryInfo={retryInfo}
      queuedMessages={queuedMessages}
      onDeleteQueuedMessage={handleDeleteQueuedMessage}
      onUndoDeletedQueuedMessage={handleUndoDeletedQueuedMessage}
      onEditQueuedMessage={handleEditQueuedMessage}
      onCancelQueuedMessageEdit={handleCancelQueuedMessageEdit}
      onCompleteQueuedMessageEdit={handleCompleteQueuedMessageEdit}
      onReorderQueuedMessages={handleReorderQueuedMessages}
      onRetryQueuedMessage={handleRetryQueuedMessage}
      onSendQueuedMessageNow={handleSendQueuedMessageNow}
      onResumeQueuedMessages={handleResumeQueuedMessages}
      onResolvePausedQueueSubmission={handleResolvePausedQueueSubmission}
      contextUsage={contextUsage}
      imageInputId={newDraftKey ? `${newDraftKey}:images` : undefined}
      sessionStats={sessionStats}
      projectTrust={projectTrust}
      onProjectTrustClick={onProjectTrustClick}
      approvalMode={approvalMode}
      approvalModeChanging={approvalModeChanging}
      approvalModeError={approvalModeError}
      onApprovalModeChange={handleApprovalModeChange}
      onListReviewBranches={onListReviewBranches}
      reviewGate={reviewGate}
      inputHistory={inputHistory}
      subagents={subagents}
      slashCommands={slashCommands}
      slashCommandsLoading={slashCommandsLoading}
      onLoadSlashCommands={loadSlashCommands}
      onBuiltinCommand={handleBuiltinSlashCommand}
      onAudioUnlock={unlockAudio}
      draftKey={session?.id ?? newDraftKey ?? (newSessionCwd ? `new:${newSessionCwd}` : undefined)}
      onEnsureSession={ensureNewSession}
      existingSessionId={session?.id}
      cwd={session?.cwd ?? newSessionCwd}
      onSelectWorktree={onSelectWorktree}
      onSelectProject={onHomeProjectSelected}
      onRegisterProjectCommand={onRegisterProjectCommand}
      onWorkspaceRelocated={session ? handleWorkspaceRelocated : undefined}
      footerMode={isEmptyNew ? "home" : "session"}
    />
  );

  // Extension widgets (for example the usage line) are hidden for now.
  // Set SHOW_EXTENSION_WIDGETS to true to show them again.
  const visibleWidgets = SHOW_EXTENSION_WIDGETS ? extensionWidgets : [];
  const aboveEditorWidgets = visibleWidgets.filter((widget) => widget.placement !== "belowEditor");
  const belowEditorWidgets = visibleWidgets.filter((widget) => widget.placement === "belowEditor");

  if (error) {
    return (
      <div className={styles.centeredState} data-tone="error">
        {error}
      </div>
    );
  }

  return (
    <div
      className={styles.chatRoot}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {goalEntryDraft !== null && <GoalSetDialog
        key={session?.id ?? newDraftKey ?? newSessionCwd ?? "new"}
        initialObjective={goalEntryDraft.objective}
        initialAttachments={goalEntryDraft.attachments}
        existingGoal={goalState.goal}
        onSubmit={handleGoalSubmit}
        onClose={() => setGoalEntryDraft(null)}
      />}
      {isDragOver && !sessionBusy && (
        <div className={styles.dropZone} role="status">
          <span className={styles.dropLabel}>{t(dropKind === "chat" ? "composer.dropOverlayReferenceChat" : "composer.dropOverlayAttach")}</span>
          <div className={styles.dropRipples}>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={styles.dropRipple}
              />
            ))}
          </div>
          <svg
            width="280" height="280" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg"
            className={styles.dropIcon}
          >
            <rect x="28" y="44" width="84" height="60" rx="8" fill="var(--ui-accent-wash)" stroke="var(--ui-accent)" strokeWidth="1.8"/>
            <path d="M36 100 L54 72 L68 88 L80 74 L104 100Z" fill="var(--ui-accent-wash)" stroke="var(--ui-accent)" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="96" cy="58" r="8" fill="var(--ui-accent-wash)" stroke="var(--ui-accent)" strokeWidth="1.6"/>
            <g stroke="var(--ui-accent)" strokeWidth="1.4" strokeLinecap="round">
              <line x1="96" y1="46" x2="96" y2="43"/>
              <line x1="96" y1="70" x2="96" y2="73"/>
              <line x1="84" y1="58" x2="81" y2="58"/>
              <line x1="108" y1="58" x2="111" y2="58"/>
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4"/>
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6"/>
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4"/>
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6"/>
            </g>
          </svg>
        </div>
      )}

      {displayedExtensionDialog && displayedExtensionDialog.method !== "ask" && (
        <ExtensionDialog
          request={displayedExtensionDialog}
          footer={approvalNudgeOpen && displayedExtensionDialog.id === approvalDialogId ? (
            <ApprovalNudge
              busy={approvalModeChanging}
              error={approvalModeError}
              onAccept={() => { void handleApprovalNudgeAccept(); }}
              onDismiss={handleApprovalNudgeDismiss}
            />
          ) : undefined}
          onRespond={respondToExtensionUi}
        />
      )}

      {extensionCustomUi && (
        <ExtensionCustomPanel
          request={extensionCustomUi}
          onInput={sendExtensionCustomInput}
        />
      )}

      {isEmptyNew ? (
        <div className={styles.emptyState}>
          {compactHome !== undefined ? <div className={styles.compactHome}>
            {compactHome}
            <NoticeShelf notices={notices} align="right" />
            {chatInputElement}
          </div> : <EmptyChatHome
            composer={(
              <>
                <NoticeShelf notices={notices} align="right" />
                {chatInputElement}
              </>
            )}
            contextLabel={homeContextLabel}
            projectless={homeProjectless}
            selectedPath={homeProjectPath}
            onProjectSelected={onHomeProjectSelected}
            onProjectlessSelected={onHomeProjectlessSelected}
            onSuggestionSelected={(prompt) => chatInputRef?.current?.insertIfEmpty(prompt)}
          />}
        </div>
      ) : (
      <>
      <div className={styles.transcriptPane}>
        <div className={styles.floatingNotices}>
          <div className={styles.transcriptMeasure}>
            <NoticeShelf notices={notices} floating align="right" />
          </div>
        </div>
        <DynamicStyleVars elementRef={scrollContainerRef} className={`chat-session-scroll ${styles.transcriptScroll}`} variables={{ "--ui-transcript-scroll-padding-bottom": `${transcriptFollow.scrollPaddingBottom}px` }}>
          <div className={styles.transcriptGutter}>
            <div ref={transcriptContentRef} className={styles.transcriptMeasure} data-transcript-navigation-content>
              <ExtensionWidgets widgets={aboveEditorWidgets} />

            {(() => {
              const renderMessage = (item: TranscriptMessageRow, options: { keyPrefix?: string; messageOverride?: AgentMessage; showTimestamp?: boolean; writtenFiles?: WrittenFile[] } = {}): ReactNode => {
                const idx = item.index;
                const msg = options.messageOverride ?? item.message;
                if (item.streaming) {
                  return <MessageView key={`streaming-view-${idx}`} message={msg} isStreaming modelNames={modelNames} modelList={modelList} cwd={messageCwd} onOpenFile={onOpenFile} subagents={subagents} onOpenSubagent={onOpenSubagent} />;
                }
                const prevAssistantEntryId =
                  msg.role === "user" && idx > 0 && messages[idx - 1].role === "assistant"
                    ? entryIds[idx - 1]
                    : undefined;
                const keyPrefix = options.keyPrefix ?? "message";
                let showTimestamp = false;
                if (msg.role === "assistant") {
                  showTimestamp = true;
                  for (let j = idx + 1; j < messages.length; j++) {
                    const r = messages[j].role;
                    if (r === "user") break;
                    if (r === "assistant") { showTimestamp = false; break; }
                  }
                  // Hide on the currently-streaming tail (the streaming bubble owns the live timestamp)
                  if (showTimestamp && streamState.isStreaming && idx === messages.length - 1) {
                    showTimestamp = false;
                  }
                }
                if (options.showTimestamp !== undefined) showTimestamp = options.showTimestamp;
                return (
                  <MessageView
                    key={`${keyPrefix}-view-${idx}`}
                    message={msg}
                    toolResults={toolResultsMap}
                    modelNames={modelNames}
                    modelList={modelList}
                    cwd={messageCwd}
                    onOpenFile={onOpenFile}
                    entryId={item.entryId}
                    onFork={sessionBusy || isNew || (idx === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === item.entryId}
                    onNavigate={sessionBusy ? undefined : handleNavigate}
                    prevAssistantEntryId={sessionBusy ? undefined : prevAssistantEntryId}
                    onEditSubmit={sessionBusy ? undefined : handleEditSubmit}
                    onEditFailure={() => addNotice({ type: "error", message: t("localConversation.editLastMessageFailed") })}
                    showTimestamp={showTimestamp}
                    prevTimestamp={idx > 0 ? (messages[idx - 1] as AgentMessage & { timestamp?: number }).timestamp : undefined}
                    sessionId={session?.id ?? sessionIdRef.current ?? undefined}
                    writtenFiles={options.writtenFiles}
                    subagents={subagents}
                    onOpenSubagent={onOpenSubagent}
                    interrupted={item.interrupted}
                  />
                );
              };

              const rendered: ReactNode[] = [];
              const renderSection = (items: TranscriptMessageRow[], key: string, live: boolean, phase: TurnPhase, clock: TurnClock, turnNumber?: number, totalTurnCount?: number, deniedActionCount = 0) => {
                const assistantPosition = presentationAssistantPosition(items);
                if (assistantPosition === -1) {
                  for (const item of items) rendered.push(renderMessage(item));
                  return;
                }

                rendered.push(renderMessage(items[0]));
                const visibleProcessItems = items.slice(1, assistantPosition)
                  .filter((item) => hasDisplayableProcessMessage(item.message));
                const finalItem = items[assistantPosition];
                const finalAssistant = finalItem.message as AssistantMessage;
                const stoppedError = finalAssistant.stopReason === "aborted"
                  ? finalAssistant.errorMessage?.trim() || t("transcript.stoppedTurn.errorFallback")
                  : null;
                const finalSplit = splitFinalAssistantBlocks(finalAssistant);
                const hasFinalAnswer = finalAnswerPosition(items) === assistantPosition && (
                  phase === "final-answer"
                  || getDisplayableAssistantBlocks(finalAssistant).some((block) => block.type === "image")
                  || Boolean(getAssistantErrorMessage(finalAssistant))
                );
                const processBlocks = hasFinalAnswer ? finalSplit.processBlocks : getDisplayableAssistantBlocks(finalAssistant);
                const finalProcessMessage = processBlocks.length > 0
                  ? withAssistantBlocks(finalAssistant, processBlocks, { omitUsage: true })
                  : null;
                const finalAnswerMessage = hasFinalAnswer
                  && (finalSplit.answerBlocks.length > 0 || getAssistantErrorMessage(finalAssistant))
                  ? withAssistantBlocks(finalAssistant, finalSplit.answerBlocks)
                  : null;

                const processCount = visibleProcessItems.length + (finalProcessMessage ? 1 : 0);
                const divider = dividerPresentation(items, clock, deniedActionCount)
                  ?? ((clock.status === "working" || clock.status === "stopped") && processCount > 0
                    ? { ...clock, previousMessageCount: processCount, deniedActionCount }
                    : null);
                if (processCount > 0 && divider) {
                  const activityCalls: ActivityCall[] = [];
                  for (const item of items.slice(1, assistantPosition + 1)) {
                    if (item.message.role !== "assistant") continue;
                    for (const block of (item.message as AssistantMessage).content ?? []) {
                      if (block.type === "toolCall") {
                        activityCalls.push({ block, result: toolResultsMap.get(block.toolCallId) });
                      }
                    }
                  }
                  const headerInput = { calls: activityCalls, closed: !live, inProgress: live, latestVisible: live, exploring: live };
                  // The open Divider already shows the running call as its own Activity row.
                  const headerRepeatsRow = selectLiveActivityHeader(headerInput).kind === "activity";
                  rendered.push(
                    <Divider key={`process-group-${key}`} turnId={key} turnNumber={turnNumber} totalTurnCount={totalTurnCount} forceExpanded={!finalAnswerMessage} {...divider} stopSource={stoppedError ? "process" : "user"}>
                      {headerRepeatsRow ? null : <ActivityHeader input={headerInput} />}
                      {visibleProcessItems.map((item) => renderMessage(item, { keyPrefix: "process" }))}
                      {finalProcessMessage && renderMessage(finalItem, { keyPrefix: "process-final", messageOverride: finalProcessMessage, showTimestamp: false })}
                    </Divider>,
                  );
                }

                if (stoppedError) rendered.push(<div key={`${key}-stopped-error`} role="alert" data-transcript-error>{t("transcript.stoppedTurn.error", { message: stoppedError })}</div>);

                if (finalAnswerMessage) {
                  // Each tool call is stored as its own assistant entry, so the
                  // final answer alone carries no record of what the turn wrote.
                  // Gather the turn's assistant blocks and derive the file list
                  // from the write/edit calls among them.
                  const turnContent: AssistantContentBlock[] = [];
                  for (const item of items.slice(1, assistantPosition + 1)) {
                    const m = item.message;
                    if (m?.role === "assistant") {
                      for (const b of (m as AssistantMessage).content ?? []) turnContent.push(b);
                    }
                  }
                  const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd);
                  rendered.push(renderMessage(finalItem, { messageOverride: finalAnswerMessage, writtenFiles }));
                }
                for (const item of items.slice(assistantPosition + 1)) {
                  rendered.push(renderMessage(item));
                }
              };

              const lastContentRowIndex = transcriptRows.reduce(
                (lastIndex, row, index) =>
                  row.kind === "model-change" || (row.kind === "compaction" && row.items.length === 0)
                    ? lastIndex
                    : index,
                -1,
              );
              const totalTurnCount = transcriptRows.filter((row) => row.kind === "turn").length;
              let turnNumber = 0;
              transcriptRows.forEach((row, rowIndex) => {
                if (row.kind === "archived") {
                  rendered.push(
                    <ArchivedSessionCard
                      key={`archived-${row.sessionId}`}
                      sessionId={row.sessionId}
                      onRestored={onSessionRestored}
                    />,
                  );
                  return;
                }
                if (row.kind === "message") {
                  rendered.push(renderMessage(row.item));
                  return;
                }
                if (row.kind === "session-origin") {
                  rendered.push(
                    <SessionOriginNote
                      key={`session-origin-${row.relatedSessionId}`}
                      kind={row.kindOfOrigin}
                      relatedSessionId={row.relatedSessionId}
                      onOpenSession={onOpenSession}
                    />,
                  );
                  return;
                }
                if (row.kind === "model-change") {
                  rendered.push(
                    <ModelChangedNote
                      key={`model-change-${row.id}`}
                      fromModel={row.note.fromModel}
                      toModel={row.note.toModel}
                    />,
                  );
                  return;
                }
                if (row.kind === "fallback-route") {
                  rendered.push(
                    <FallbackRoutingNote key={`fallback-route-${row.id}`} toModel={row.note.toModel} />,
                  );
                  return;
                }
                if (row.kind === "compaction" && row.items.length === 0) {
                  rendered.push(
                    <CompactionNote
                      key={`compaction-${row.id}`}
                      completed={row.completed ?? false}
                      source={row.source ?? "automatic"}
                      error={row.error}
                    />,
                  );
                  return;
                }
                const turnRenderStart = row.kind === "turn" ? rendered.length : -1;
                const live = (sessionBusy || streamState.isStreaming) && rowIndex === lastContentRowIndex;
                const clock = row.kind === "turn" ? row.clock : { status: "worked" as const };
                if (row.kind === "turn") turnNumber += 1;
                // A steered user message or compaction remains visible inside
                // its Turn, even when the surrounding process is collapsed.
                let start = 0;
                for (let index = 1; index <= row.items.length; index += 1) {
                  if (index < row.items.length && !isGroupAnchor(row.items[index].message)) continue;
                  renderSection(row.items.slice(start, index), `${row.id}-${start}`, live && index === row.items.length, row.phase, clock, row.kind === "turn" ? turnNumber : undefined, totalTurnCount, row.kind === "turn" ? row.deniedActionCount : 0);
                  start = index;
                }
                if (turnRenderStart !== -1) {
                  if (row.kind !== "turn") return;
                  const turnContent = rendered.splice(turnRenderStart);
                  const retryUserMessage = row.retryUserMessage;
                  if (row.usageLimitMessage && retryUserMessage) {
                    turnContent.push(
                      <UsageLimitNote
                        key={`usage-limit-${row.id}`}
                        message={row.usageLimitMessage}
                        onRetry={() => handleEditContent(retryUserMessage)}
                      />,
                    );
                  }
                  rendered.push(
                    <TurnErrorBoundary
                      key={`turn-boundary-${row.id}`}
                      title={t("transcript.turnRenderError.title")}
                      retryLabel={t("transcript.turnRenderError.retry")}
                    >
                      {turnContent}
                    </TurnErrorBoundary>,
                  );
                }
              });
              const { startIndex, hasMore } = getVisibleRenderWindow(rendered.length, visibleCount);
              return (
                <>
                  {historyLoadFailure ? (
                    <HistoryLoadFailureRow
                      onRetry={historyLoadFailure.retry}
                      retrying={historyLoadFailure.retrying}
                    />
                  ) : null}
                  {hasMore && (
                    <div ref={sentinelRef} className={styles.loadEarlier}>
                      {transcriptHistory.failure
                        ? <span role="alert">{t("chat.historyLoadFailed")}</span>
                        : transcriptHistory.status === "loading"
                          ? t("chat.loadingEarlier")
                          : t("chat.loadEarlier", { count: startIndex })}
                      {transcriptHistory.failure?.retryable && (
                        <button type="button" className={styles.historyRetry} onClick={transcriptHistory.retry}>
                          {t("chat.retryHistory")}
                        </button>
                      )}
                    </div>
                  )}
                  {rendered.slice(startIndex)}
                  {retryInfo ? <ProviderRetryNote {...retryInfo} /> : null}
                </>
              );
            })()}

            {agentRunning && !streamState.streamingMessage && agentPhase && (
              <div className={styles.phaseStatus}>
                <span className={styles.phasePulse}>{phaseLabel(agentPhase, t)}</span>
              </div>
            )}

            {bashRunning && !pendingBash && (
              <div className={styles.phaseStatus}>
                <span className={styles.phasePulse}>{t("chat.runningCommand")}</span>
              </div>
            )}

            {pendingBash && (
              <MessageView
                message={{
                  role: "bashExecution",
                  command: pendingBash.command,
                  output: "",
                  excludeFromContext: pendingBash.excludeFromContext,
                } as BashExecutionMessage}
                sessionId={session?.id ?? sessionIdRef.current ?? undefined}
              />
            )}


            <ActiveTurnResponseSpacer
              active={showActiveTurnResponseSpacer}
              phase={followPhase}
              followMode={transcriptFollow.mode}
              scrollContainerRef={scrollContainerRef}
              onConsumed={releaseActiveTurnHold}
            />
            <div ref={messagesEndRef} />
            </div>
          </div>
        </DynamicStyleVars>
        <TranscriptNavigationRail
          items={transcriptNavigationItems}
          scrollContainerRef={scrollContainerRef}
          onReveal={revealTranscriptNavigationItem}
        />
      </div>

      <div className={styles.composerDock} data-composer-dock><div ref={footerRef}>
        <LatestTurnPreview
          turn={latestTurn}
          visible={transcriptFollow.button.visible}
          onSelect={transcriptFollow.goToNewest}
        />
        <NewMessagesControl
          mode={transcriptFollow.mode}
          button={transcriptFollow.button}
          onGoToNewest={transcriptFollow.goToNewest}
        />
        <div className={styles.transcriptGutter}>
          <div className={styles.transcriptMeasure}>
            <ExtensionWidgets widgets={belowEditorWidgets} />
          </div>
        </div>
        {displayedExtensionDialog?.method === "ask" && (
          <QuestionRequestPanel
            request={displayedExtensionDialog}
            onRespond={(request, response) => {
              if (questionDebug) setQuestionDebug(false);
              else respondToExtensionUi(request, response);
            }}
          />
        )}
        {(agentRunning || streamState.isStreaming || turnStatusDebug) && !displayedExtensionDialog && !extensionCustomUi && (
          <ComposerTurnStatus
            blocks={activeTurnBlocks}
            cwd={messageCwd}
            onOpenFile={onOpenFile}
            toolResults={toolResultsMap}
          />
        )}
        <SessionLoadingState active={loading} />
        <GoalPill
          goal={goalState.goal}
          isRunning={sessionBusy}
          continuationPending={goalState.continuationPending}
          pendingAction={goalState.pendingAction}
          actionError={goalState.actionError}
          onClear={() => goalState.clear(sessionBusy)}
          onPause={() => goalState.pause(sessionBusy)}
          onResume={goalState.resume}
          onEditBudget={goalState.setBudget}
          onUpdateGoal={goalState.update}
          onExpand={onGoalTabState && session?.id ? () => onGoalTabState(session.id, goalState.goal, goalState.update, true) : undefined}
        />
        {chatInputElement}
        <ExtensionStatusBar statuses={extensionStatuses} />
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function ExtensionWidgets({ widgets }: { widgets: Array<{ key: string; lines: string[] }> }) {
  if (widgets.length === 0) return null;
  return (
    <div className={styles.extensionWidgets}>
      {widgets.map((widget) => (
        <div key={widget.key} className={styles.extensionWidget}>
          <div className={styles.extensionWidgetTitle}>
            {widget.key}
          </div>
          <pre className={styles.extensionWidgetBody}>
            {stripAnsi(widget.lines.join("\n"))}
          </pre>
        </div>
      ))}
    </div>
  );
}

function NoticeShelf({ notices, floating = false, align = "left" }: { notices: NoticeItem[]; floating?: boolean; align?: "left" | "right" }) {
  if (notices.length === 0) return null;
  return (
    <div className={styles.noticeShelf} data-align={align} data-floating={floating}>
      {notices.map((notice) => {
        return (
          <div
            key={notice.id}
            className={styles.noticeItem}
            data-type={notice.type}
            data-exiting={notice.exiting}
          >
            <span className={styles.noticeIndicator} />
            <span className={styles.noticeMessage}>
              {notice.message}
            </span>
            {notice.actionLabel && notice.onAction && (
              <button type="button" className={styles.noticeAction} onClick={notice.onAction}>
                {notice.actionLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
