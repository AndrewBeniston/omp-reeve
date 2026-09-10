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
import { countToolCallBlocks, getAssistantErrorMessage, getDisplayableAssistantBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { extractTurnWrittenFiles, type WrittenFile } from "@/lib/turn-written-files";
import { collectSessionSummarySources, type SummarySource } from "@/lib/session-summary";
import { MessageView } from "./MessageView";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ExtensionStatusBar } from "./ExtensionStatusBar";
import { useI18n } from "@/hooks/useI18n";
import { useAgentSession, type AgentPhase, type NoticeItem } from "@/hooks/useAgentSession";
import { useDragDrop } from "@/hooks/useDragDrop";
import type { ProjectTrustStatus } from "@/lib/api-types";
import type { SessionStatsInfo } from "@/lib/omp-types";
import {
  captureScrollDistance,
  getNextVisibleCount,
  getVisibleRenderWindow,
  restoreScrollTop,
  VISIBLE_PAGE_SIZE,
} from "@/lib/chat-lazy-load";
import { ExtensionCustomPanel, ExtensionDialog } from "./chat/ExtensionDialogs";
import { QuestionRequestPanel, type QuestionRequest } from "./chat/QuestionRequestPanel";
import { EmptyChatHome } from "./chat/EmptyChatHome";
import { NewMessagesControl } from "./chat/NewMessagesControl";
import { ComposerTurnStatus } from "./chat/ComposerTurnStatus";
import { ActiveTurnResponseSpacer } from "./chat/ActiveTurnResponseSpacer";
import {
  TranscriptNavigationRail,
  buildTranscriptNavigationItems,
  type TranscriptNavigationItem,
} from "./chat/TranscriptNavigationRail";
import { prefersReducedMotion, resolveScrollBehavior } from "./chat/transcript-follow";
import styles from "./chat/chat-window.module.css";

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
  registerGlobalAbort?: boolean;
  newDraftKey?: string;
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onAttentionNeeded?: (request: BlockingExtensionUiRequest) => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  onSessionNameChanged?: (sessionId: string, name: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (stats: SessionStatsInfo | null) => void;
  onSummarySourcesChange?: (sources: SummarySource[]) => void;
  onOpenFile?: (filePath: string) => void;
  onSubagentsChange?: (subagents: SubagentSnapshot[]) => void;
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

function hasFinalAssistantAnswer(message: AgentMessage): boolean {
  if (message.role !== "assistant") return false;
  return splitFinalAssistantBlocks(message as AssistantMessage).answerBlocks.some((block) => (
    block.type === "image" || (block.type === "text" && block.text.trim().length > 0)
  ));
}

function findFinalAssistantIndex(messages: AgentMessage[], userIdx: number, endIdx: number): number {
  for (let candidateIdx = endIdx - 1; candidateIdx > userIdx; candidateIdx--) {
    if (hasFinalAssistantAnswer(messages[candidateIdx])) return candidateIdx;
  }
  for (let candidateIdx = endIdx - 1; candidateIdx > userIdx; candidateIdx--) {
    if (messages[candidateIdx]?.role === "assistant") return candidateIdx;
  }
  return -1;
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

function countToolCalls(messages: AgentMessage[], indices: number[]): number {
  let count = 0;
  for (const idx of indices) {
    const msg = messages[idx];
    if (msg?.role !== "assistant") continue;
    count += countToolCallBlocks(getDisplayableAssistantBlocks(msg as AssistantMessage));
  }
  return count;
}

function hasDisplayableProcessMessage(message: AgentMessage): boolean {
  if (message.role === "assistant") {
    return getDisplayableAssistantBlocks(message as AssistantMessage).length > 0;
  }
  return message.role === "custom";
}

// A user message normally anchors a turn (user prompt → process → final
// answer), and the process messages in between get folded into a collapsed
// ProcessDetailsGroup. When compaction fires mid-turn, omp drops the original
// user prompt and inserts a compaction summary (role "custom", customType
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

function ProcessDetailsGroup({ messageCount, toolCallCount, defaultExpanded = false, children, t }: { messageCount: number; toolCallCount: number; defaultExpanded?: boolean; children: ReactNode; t: (key: string, params?: Record<string, string | number>) => string }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const parts = [t("chat.processDetails"), `${messageCount} ${t(messageCount === 1 ? "chat.message" : "chat.messages")}`];
  if (toolCallCount > 0) parts.push(`${toolCallCount} ${t(toolCallCount === 1 ? "chat.toolCall" : "chat.toolCalls")}`);

  return (
    <div className={styles.processDetails}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={styles.processDetailsTrigger}
        title={expanded ? t("chat.collapseProcess") : t("chat.expandProcess")}
      >
        <svg className={styles.processDetailsMarker} data-expanded={expanded} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 2.5 7.5 6 4 9.5" />
        </svg>
        <span className={styles.processDetailsLabel}>
          {parts.join(" · ")}
        </span>
      </button>
      {expanded && (
        <div className={styles.processDetailsPanel}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ChatWindow({ compactHome, registerGlobalAbort = true, newDraftKey, session, newSessionCwd, onAgentEnd, onAttentionNeeded, onSessionCreated, onSessionForked, onSessionNameChanged, modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, onSessionStatsChange, onSummarySourcesChange, onSubagentsChange, onOpenFile, soundEnabled = true, playDoneSound = () => {}, unlockAudio, projectTrust, onProjectTrustClick, homeContextLabel = "Chats", homeProjectless = false, homeProjectPath = null, onHomeProjectSelected = () => {}, onHomeProjectlessSelected = () => {} }: Props) {
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

  // 稳定化 onEditContent 引用，配合 React.memo 防止历史消息重渲染
  const handleEditContent = useCallback((message: UserMessage) => {
    chatInputRef?.current?.replaceMessage(message);
  }, [chatInputRef]);
  const {
    loading, error, messages, entryIds, streamState,
    agentRunning, bashRunning, pendingBash, modelNames, modelList, modelError, modelScopeWarnings, modelThinkingLevels, modelThinkingLevelMaps, modelRoles, toolPreset, approvalMode, approvalModeChanging, approvalModeError, thinkingLevel, fastModeEnabled, fastModeAvailable,
    retryInfo, contextUsage, forkingEntryId,
    isCompacting, compactError, compactResult, displayModel: displayModelValue, modelSwitching, sessionStats,
    slashCommands, slashCommandsLoading, queuedMessages, subagents,
    notices, extensionDialog, extensionCustomUi, extensionStatuses, extensionWidgets, respondToExtensionUi, sendExtensionCustomInput,
    isAutoModelSelection,
    agentPhase,
    isNew,
    transcriptPinned,
    sessionIdRef, messagesEndRef, scrollContainerRef,
    handleSend, handleAbort, handleFork, handleNavigate, handleModelChange, handleRoleModelChange,
    handleCompact, handleSteer, handleFollowUp, handlePromptWithStreamingBehavior, handleAbortCompaction,
    handleDeleteQueuedMessage, handleUndoDeletedQueuedMessage,
    handleEditQueuedMessage, handleCancelQueuedMessageEdit, handleCompleteQueuedMessageEdit,
    handleReorderQueuedMessages, handleSendQueuedMessageNow, handleResumeQueuedMessages, handleResolvePausedQueueSubmission,
    scrollTranscriptToBottom, releaseActiveTurnHold,
    handleBuiltinSlashCommand,
    handleToolPresetChange, handleApprovalModeChange, handleThinkingLevelChange, handleCycleThinkingLevel, handleFastModeChange, loadSlashCommands,
  } = useAgentSession({
    session, newSessionCwd, onAgentEnd: wrappedOnAgentEnd, onAttentionNeeded, onSessionCreated, onSessionForked, onSessionNameChanged,
    modelsRefreshKey, chatInputRef, onBranchDataChange, onSystemPromptChange, translate: t,
  });
  const sessionBusy = agentRunning || bashRunning;
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

  // --- Lazy-load historical messages ---
  // Only render the last N messages initially. When the user scrolls to the
  // top, load another page while keeping the scroll position stable.
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE_SIZE);
  const [turnStatusDebug, setTurnStatusDebug] = useState(false);
  const [questionDebug, setQuestionDebug] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollDistanceRef = useRef<number | null>(null);
  const transcriptNavigationItems = useMemo(
    () => buildTranscriptNavigationItems(messages, entryIds),
    [entryIds, messages],
  );
  const revealTranscriptNavigationItem = useCallback(async (
    item: TranscriptNavigationItem,
    behavior: ScrollBehavior,
  ) => {
    setVisibleCount(messages.length);
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
  }, [messages.length, scrollContainerRef]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(window.location.search);
    setTurnStatusDebug(params.has("turnStatusDebug"));
    setQuestionDebug(params.has("questionDebug"));
  }, []);

  // IntersectionObserver on the sentinel div at the top of the message list.
  // When it becomes visible, load the next page of older messages.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Save distance from top before prepending to restore scroll later
          prevScrollDistanceRef.current = captureScrollDistance(container.scrollHeight, container.scrollTop);
          setVisibleCount((prev) => getNextVisibleCount(prev));
        }
      },
      { root: container, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, messages.length, scrollContainerRef]);

  // After visibleCount increases (more messages prepended), restore the
  // scroll position so the viewport doesn't jump.
  useEffect(() => {
    if (prevScrollDistanceRef.current == null) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = restoreScrollTop(container.scrollHeight, prevScrollDistanceRef.current);
    prevScrollDistanceRef.current = null;
  }, [visibleCount, scrollContainerRef]);
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


  const onDrop = useCallback((files: File[]) => {
    if (sessionBusy) return;
    chatInputRef?.current?.addImages(files);
  }, [sessionBusy, chatInputRef]);

  const { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(onDrop);

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

  const isEmptyNew = isNew && messages.length === 0 && !streamState.isStreaming && !sessionBusy;
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
      onSend={handleSend}
      onAbort={handleAbort}
      onSteer={agentRunning ? handleSteer : undefined}
      onFollowUp={agentRunning ? handleFollowUp : undefined}
      onPromptWithStreamingBehavior={agentRunning ? handlePromptWithStreamingBehavior : undefined}
      isStreaming={sessionBusy}
      model={displayModelValue}
      isAutoModelSelection={isAutoModelSelection}
      modelNames={modelNames}
      modelList={modelList}
      modelError={modelError}
      modelScopeWarnings={modelScopeWarnings}
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
      thinkingLevelMap={currentThinkingLevelMap}
      retryInfo={retryInfo}
      queuedMessages={queuedMessages}
      onDeleteQueuedMessage={handleDeleteQueuedMessage}
      onUndoDeletedQueuedMessage={handleUndoDeletedQueuedMessage}
      onEditQueuedMessage={handleEditQueuedMessage}
      onCancelQueuedMessageEdit={handleCancelQueuedMessageEdit}
      onCompleteQueuedMessageEdit={handleCompleteQueuedMessageEdit}
      onReorderQueuedMessages={handleReorderQueuedMessages}
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
      inputHistory={inputHistory}
      subagents={subagents}
      slashCommands={slashCommands}
      slashCommandsLoading={slashCommandsLoading}
      onLoadSlashCommands={loadSlashCommands}
      onBuiltinCommand={handleBuiltinSlashCommand}
      onAudioUnlock={unlockAudio}
      draftKey={session?.id ?? newDraftKey ?? (newSessionCwd ? `new:${newSessionCwd}` : undefined)}
      cwd={session?.cwd ?? newSessionCwd}
    />
  );

  const aboveEditorWidgets = extensionWidgets.filter((widget) => widget.placement !== "belowEditor");
  const belowEditorWidgets = extensionWidgets.filter((widget) => widget.placement === "belowEditor");

  if (loading) {
    return (
      <div className={styles.centeredState}>
        {t("chat.loadingSession")}
      </div>
    );
  }

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
      {isDragOver && !sessionBusy && (
        <div className={styles.dropZone}>
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
        <div ref={scrollContainerRef} className={`chat-session-scroll ${styles.transcriptScroll}`}>
          <div className={styles.transcriptGutter}>
            <div className={styles.transcriptMeasure} data-transcript-navigation-content>
              <ExtensionWidgets widgets={aboveEditorWidgets} />

            {(() => {
              // Anchor for live-tail detection: the last user message, or a
              // compaction summary when compaction has replaced it mid-turn.
              let lastAnchorIdx = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (isGroupAnchor(messages[i])) { lastAnchorIdx = i; break; }
              }

              const renderMessage = (idx: number, options: { keyPrefix?: string; messageOverride?: AgentMessage; showTimestamp?: boolean; writtenFiles?: WrittenFile[] } = {}): ReactNode => {
                const msg = options.messageOverride ?? messages[idx];
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
                    cwd={messageCwd}
                    onOpenFile={onOpenFile}
                    entryId={entryIds[idx]}
                    onFork={sessionBusy || isNew || (idx === 0 && msg.role === "user") ? undefined : handleFork}
                    forking={forkingEntryId === entryIds[idx]}
                    onNavigate={sessionBusy ? undefined : handleNavigate}
                    prevAssistantEntryId={sessionBusy ? undefined : prevAssistantEntryId}
                    onEditContent={handleEditContent}
                    showTimestamp={showTimestamp}
                    prevTimestamp={idx > 0 ? (messages[idx - 1] as AgentMessage & { timestamp?: number }).timestamp : undefined}
                    sessionId={session?.id ?? sessionIdRef.current ?? undefined}
                    writtenFiles={options.writtenFiles}
                  />
                );
              };

              const rendered: ReactNode[] = [];
              for (let idx = 0; idx < messages.length;) {
                const msg = messages[idx];
                if (!isGroupAnchor(msg)) {
                  rendered.push(renderMessage(idx));
                  idx += 1;
                  continue;
                }

                const userIdx = idx;
                let endIdx = userIdx + 1;
                while (endIdx < messages.length && !isGroupAnchor(messages[endIdx])) endIdx += 1;

                const finalAssistantIdx = findFinalAssistantIndex(messages, userIdx, endIdx);

                if (finalAssistantIdx === -1) {
                  for (let renderIdx = userIdx; renderIdx < endIdx; renderIdx++) {
                    rendered.push(renderMessage(renderIdx));
                  }
                  idx = endIdx;
                  continue;
                }

                const isLiveTail = (sessionBusy || streamState.isStreaming) && endIdx === messages.length && userIdx === lastAnchorIdx;
                if (isLiveTail) {
                  for (let renderIdx = userIdx; renderIdx < endIdx; renderIdx++) {
                    rendered.push(renderMessage(renderIdx));
                  }
                  idx = endIdx;
                  continue;
                }

                rendered.push(renderMessage(userIdx));

                const processIndices: number[] = [];
                for (let processIdx = userIdx + 1; processIdx < finalAssistantIdx; processIdx++) {
                  processIndices.push(processIdx);
                }
                const visibleProcessIndices = processIndices.filter((processIdx) => hasDisplayableProcessMessage(messages[processIdx]));
                const finalAssistant = messages[finalAssistantIdx] as AssistantMessage;
                const finalSplit = splitFinalAssistantBlocks(finalAssistant);
                const finalProcessMessage = finalSplit.processBlocks.length > 0
                  ? withAssistantBlocks(finalAssistant, finalSplit.processBlocks, { omitUsage: true })
                  : null;
                const finalAnswerMessage = finalSplit.answerBlocks.length > 0 || getAssistantErrorMessage(finalAssistant)
                  ? withAssistantBlocks(finalAssistant, finalSplit.answerBlocks)
                  : null;

                const processCount = visibleProcessIndices.length + (finalProcessMessage ? 1 : 0);
                if (processCount > 0) {
                  const processGroup = (
                    <ProcessDetailsGroup
                      messageCount={processCount}
                      defaultExpanded={!finalAnswerMessage}
                      t={t}
                      toolCallCount={countToolCalls(messages, visibleProcessIndices) + countToolCallBlocks(finalSplit.processBlocks)}
                    >
                      {visibleProcessIndices.map((processIdx) => renderMessage(processIdx, { keyPrefix: "process" }))}
                      {finalProcessMessage && renderMessage(finalAssistantIdx, { keyPrefix: "process-final", messageOverride: finalProcessMessage, showTimestamp: false })}
                    </ProcessDetailsGroup>
                  );
                  rendered.push(
                    <div key={`process-group-${userIdx}-${finalAssistantIdx}`}>
                      {processGroup}
                    </div>,
                  );
                }

                if (finalAnswerMessage) {
                  // Each tool call is stored as its own assistant entry, so the
                  // final answer alone carries no record of what the turn wrote.
                  // Gather the turn's assistant blocks and derive the file list
                  // from the write/edit calls among them.
                  const turnContent: AssistantContentBlock[] = [];
                  for (let i = userIdx + 1; i <= finalAssistantIdx; i++) {
                    const m = messages[i];
                    if (m?.role === "assistant") {
                      for (const b of (m as AssistantMessage).content ?? []) turnContent.push(b);
                    }
                  }
                  const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd);
                  rendered.push(renderMessage(finalAssistantIdx, { messageOverride: finalAnswerMessage, writtenFiles }));
                }
                for (let renderIdx = finalAssistantIdx + 1; renderIdx < endIdx; renderIdx++) {
                  rendered.push(renderMessage(renderIdx));
                }
                idx = endIdx;
              }
              const { startIndex, hasMore } = getVisibleRenderWindow(rendered.length, visibleCount);
              return (
                <>
                  {hasMore && (
                    <div ref={sentinelRef} className={styles.loadEarlier}>
                      {t("chat.loadEarlier", { count: startIndex })}
                    </div>
                  )}
                  {rendered.slice(startIndex)}
                </>
              );
            })()}
            {streamState.isStreaming && streamState.streamingMessage && (
              <MessageView message={streamState.streamingMessage as AgentMessage} isStreaming modelNames={modelNames} cwd={messageCwd} onOpenFile={onOpenFile} />
            )}

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
              scrollContainerRef={scrollContainerRef}
              onConsumed={releaseActiveTurnHold}
            />
            <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
        <TranscriptNavigationRail
          items={transcriptNavigationItems}
          scrollContainerRef={scrollContainerRef}
          onReveal={revealTranscriptNavigationItem}
        />
      </div>

      <div className={styles.composerDock}>
        <NewMessagesControl
          scrollContainerRef={scrollContainerRef}
          pinned={transcriptPinned}
          streaming={sessionBusy || streamState.isStreaming}
          onGoToNewest={scrollTranscriptToBottom}
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
        {chatInputElement}
        <ExtensionStatusBar statuses={extensionStatuses} />
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
            {widget.lines.join("\n")}
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
