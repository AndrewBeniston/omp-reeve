"use client";

import { memo, useState, useRef, useEffect, useMemo } from "react";
import { MarkdownBody } from "./MarkdownBody";
import { useI18n } from "@/hooks/useI18n";
import { parseCompactionSummary } from "@/lib/compaction-summary";
import { getAssistantErrorMessage, isEmptyThinkingBlock } from "@/lib/message-display";
import { TurnWrittenFiles } from "./TurnWrittenFiles";
import type { WrittenFile } from "@/lib/turn-written-files";
import { MessageTurn } from "./chat/MessageTurn";
import { ThinkingDisclosure } from "./chat/ThinkingDisclosure";
import { BashExecutionActivity } from "./chat/BashExecutionActivity";
import { ToolActivity } from "./chat/ToolActivity";
import { CollaborationCard, isCollaborationSnapshot } from "./chat/CollaborationCard";
import styles from "./chat/message-view.module.css";
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  CustomMessage,
  ToolResultMessage,
  BashExecutionMessage,
  AssistantContentBlock,
  TextContent,
  ImageContent,
  ToolCallContent,
} from "@/lib/types";

// CJK chars ~1 token each (GLM/DeepSeek/GPT-o200k); other chars ~4 chars/token.
const CJK_PATTERN = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}\uac00-\ud7af]/u;
function estimateTokens(text: string): number {
  let cjk = 0;
  let rest = 0;
  for (const ch of text) {
    if (CJK_PATTERN.test(ch)) cjk++;
    else rest++;
  }
  return cjk + rest / 4;
}

interface TokenEstimateCacheEntry {
  text: string;
  tokens: number;
}

function getTokenEstimateText(block: AssistantContentBlock): string | null {
  if (block.type === "text") return block.text;
  if (block.type === "thinking") return block.thinking;
  if (block.type === "toolCall") return JSON.stringify(block.input ?? {}) ?? "";
  return null;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function estimateUpdatedTokens(previous: TokenEstimateCacheEntry | undefined, text: string): number {
  if (!previous || !text.startsWith(previous.text)) return estimateTokens(text);

  let baseTokens = previous.tokens;
  let suffixStart = previous.text.length;
  // A streamed delta can complete a surrogate pair that was counted as two
  // non-CJK code points in the previous update.
  if (
    suffixStart > 0
    && suffixStart < text.length
    && isHighSurrogate(previous.text.charCodeAt(suffixStart - 1))
    && isLowSurrogate(text.charCodeAt(suffixStart))
  ) {
    baseTokens -= 1 / 4;
    suffixStart--;
  }
  return baseTokens + estimateTokens(text.slice(suffixStart));
}

// Messages larger than this skip markdown rendering entirely. react-markdown +
// KaTeX + syntax highlighting on multi-hundred-KB payloads (e.g. pasted HAR or
// log dumps) freezes the browser main thread.
const MAX_MARKDOWN_CHARS = 100_000;
export const STREAMING_METRIC_FPS = 1;
const STREAMING_METRIC_RENDER_MS = 1000 / STREAMING_METRIC_FPS;
const STREAMING_RATE_BLEND = 0.18;

export function formatStreamingTokens(tokens: number): string {
  return `${Math.max(0, Math.round(tokens))} tokens`;
}

export function formatStreamingRate(tokensPerSecond: number): string {
  return `${Math.max(0, Math.round(tokensPerSecond))}tps`;
}

export function smoothStreamingRate(previous: number | null, sample: number): number {
  const safeSample = Math.max(0, sample);
  if (previous === null) return safeSample;
  return previous + (safeSample - previous) * STREAMING_RATE_BLEND;
}

export function buildMetricDigitSequence(
  previousDigit: string,
  currentDigit: string,
  increasing: boolean,
): string[] {
  if (previousDigit === currentDigit) return [currentDigit];
  if (!/^\d$/.test(previousDigit) || !/^\d$/.test(currentDigit)) {
    return [previousDigit, currentDigit];
  }

  const sequence = [previousDigit];
  let digit = Number(previousDigit);
  const target = Number(currentDigit);
  while (digit !== target) {
    digit = (digit + (increasing ? 1 : 9)) % 10;
    sequence.push(String(digit));
  }
  return sequence;
}

function AnimatedMetricNumber({ value, digits }: { value: number; digits: 3 | 6 }) {
  const [transition, setTransition] = useState(() => ({
    current: value,
    previous: null as number | null,
    revision: 0,
  }));

  useEffect(() => {
    setTransition((current) => current.current === value
      ? current
      : {
          current: value,
          previous: current.current,
          revision: current.revision + 1,
        });
    const timer = setTimeout(() => {
      setTransition((current) => current.previous === null
        ? current
        : { ...current, previous: null });
    }, 620);
    return () => clearTimeout(timer);
  }, [value]);

  const currentDigits = String(transition.current).padStart(digits, " ").split("");
  const previousDigits = transition.previous === null
    ? null
    : String(transition.previous).padStart(digits, " ").split("");
  const visibleDigits = Math.min(digits, String(transition.current).length);

  return (
    <span
      className={styles.streamingMetricViewport}
      data-metric-number={transition.current}
      data-digits={digits}
      data-visible-digits={visibleDigits}
      aria-hidden="true"
    >
      {currentDigits.map((digit, index) => {
        const previousDigit = previousDigits?.[index] ?? null;
        const changed = previousDigit !== null && previousDigit !== digit;
        const increasing = transition.previous !== null && transition.current > transition.previous;
        const direction = increasing ? "down" : "up";
        const sequence = previousDigit === null
          ? [digit]
          : buildMetricDigitSequence(previousDigit, digit, increasing);
        const renderedSequence = direction === "down" ? [...sequence].reverse() : sequence;
        return (
          <span
            className={styles.streamingMetricDigit}
            data-metric-digit={index}
            data-direction={changed ? direction : undefined}
            data-steps={changed ? renderedSequence.length : undefined}
            key={index}
          >
            {changed ? (
              <span className={styles.streamingMetricTrack} key={`track-${transition.revision}-${index}`}>
                {renderedSequence.map((sequenceDigit, sequenceIndex) => (
                  <span key={`${sequenceDigit}-${sequenceIndex}`}>
                    {sequenceDigit === " " ? "\u00a0" : sequenceDigit}
                  </span>
                ))}
              </span>
            ) : (
              <span>{digit === " " ? "\u00a0" : digit}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function StreamingMetrics({
  estimatedTokens,
  tokensPerSecond,
  title,
  showTokenCount = false,
}: {
  estimatedTokens: number;
  tokensPerSecond: number | null;
  title: string;
  showTokenCount?: boolean;
}) {
  const tokenLabel = formatStreamingTokens(estimatedTokens);
  const rateLabel = tokensPerSecond === null ? null : formatStreamingRate(tokensPerSecond);
  const tokenNumber = Math.max(0, Math.round(estimatedTokens));
  const rateNumber = tokensPerSecond === null ? null : Math.max(0, Math.round(tokensPerSecond));
  const tone = tokensPerSecond === null
    ? null
    : tokensPerSecond >= 50
      ? "fast"
      : tokensPerSecond >= 30
        ? "good"
        : tokensPerSecond >= 15
          ? "slow"
          : "limited";

  if (!showTokenCount && rateLabel === null) return null;

  return (
    <span className={styles.streamingStats} data-show-tokens={showTokenCount} title={title}>
      {showTokenCount && (
        <span className={styles.tokenCount} aria-label={`${tokenLabel} generated`}>
          <AnimatedMetricNumber value={tokenNumber} digits={6} />
          <span className={styles.streamingMetricUnit} data-metric-unit="tokens"> tokens</span>
        </span>
      )}
      {rateLabel && (
        <span className={styles.speedBadge} data-tone={tone} aria-label={`${rateLabel} generation speed`}>
          <AnimatedMetricNumber value={rateNumber ?? 0} digits={3} />
          <span className={styles.streamingMetricUnit} data-metric-unit="tps">tps</span>
        </span>
      )}
    </span>
  );
}

function formatMessageBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB`;
  return `${n} B`;
}

/**
 * MarkdownBody with an oversized-content guard: huge messages render as a
 * click-to-reveal plain-text <pre> instead of running the markdown pipeline.
 */
function SafeMarkdownBody({ children, className, ...props }: React.ComponentProps<typeof MarkdownBody>) {
  const { t } = useI18n();
  const [showRaw, setShowRaw] = useState(false);

  if (children.length <= MAX_MARKDOWN_CHARS) {
    return <MarkdownBody className={className} {...props}>{children}</MarkdownBody>;
  }
  if (!showRaw) {
    return (
      <button
        onClick={() => setShowRaw(true)}
        className={styles.largeMessageReveal}
      >
        ⚠ {t("i18n.largeMessageReveal", { size: formatMessageBytes(children.length) })}
      </button>
    );
  }
  return (
    <div className={[styles.largeMessage, className].filter(Boolean).join(" ")}>
      <pre className={styles.largeMessageContent}>
        {children}
      </pre>
    </div>
  );
}

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (message: UserMessage) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  sessionId?: string;
  /**
   * Files this turn wrote, derived by the caller from the whole turn's
   * successful write/edit tool calls. ChatWindow computes this because the
   * saved-message path splits tool calls into their own entries, leaving the
   * final answer text-only.
   */
  writtenFiles?: WrittenFile[];
}

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  return `${date} ${time}`;
}

function haveSameRelevantToolResults(
  message: AgentMessage,
  previous: Map<string, ToolResultMessage> | undefined,
  next: Map<string, ToolResultMessage> | undefined,
): boolean {
  if (previous === next || message.role !== "assistant") return true;
  for (const block of (message as AssistantMessage).content ?? []) {
    if (block.type === "toolCall" && previous?.get(block.toolCallId) !== next?.get(block.toolCallId)) {
      return false;
    }
  }
  return true;
}

export const MessageView = memo(function MessageView({ message, isStreaming, toolResults, modelNames, cwd, onOpenFile, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, showTimestamp, prevTimestamp, sessionId, writtenFiles }: Props) {
  if (message.role === "user") {
    return <UserMessageView message={message as UserMessage} cwd={cwd} onOpenFile={onOpenFile} entryId={entryId} onFork={onFork} forking={forking} onNavigate={onNavigate} prevAssistantEntryId={prevAssistantEntryId} onEditContent={onEditContent} />;
  }
  if (message.role === "assistant") {
    return <AssistantMessageView message={message as AssistantMessage} isStreaming={isStreaming} toolResults={toolResults} modelNames={modelNames} cwd={cwd} onOpenFile={onOpenFile} showTimestamp={showTimestamp} prevTimestamp={prevTimestamp} sessionId={sessionId} entryId={entryId} writtenFiles={writtenFiles} />;
  }
  if (message.role === "toolResult") {
    // Rendered inline under its toolCall — skip standalone rendering if paired
    return null;
  }
  if (message.role === "custom") {
    if ((message as CustomMessage).customType === "compaction") {
      return <CompactionMessageView message={message as CustomMessage} />;
    }
    return <CustomMessageView message={message as CustomMessage} cwd={cwd} onOpenFile={onOpenFile} />;
  }
  if (message.role === "bashExecution") {
    return <BashExecutionActivity message={message as BashExecutionMessage} sessionId={sessionId} />;
  }
  return null;
}, (prev, next) => {
  return prev.message === next.message
    && prev.isStreaming === next.isStreaming
    && haveSameRelevantToolResults(prev.message, prev.toolResults, next.toolResults)
    && prev.modelNames === next.modelNames
    && prev.cwd === next.cwd
    && prev.onOpenFile === next.onOpenFile
    && prev.entryId === next.entryId
    && prev.onFork === next.onFork
    && prev.forking === next.forking
    && prev.onNavigate === next.onNavigate
    && prev.prevAssistantEntryId === next.prevAssistantEntryId
    && prev.onEditContent === next.onEditContent
    && prev.showTimestamp === next.showTimestamp
    && prev.prevTimestamp === next.prevTimestamp
    && prev.sessionId === next.sessionId;
});

function UserMessageView({ message, cwd, onOpenFile, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent }: {
  message: UserMessage;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (message: UserMessage) => void;
}) {
  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");

  const imageBlocks: ImageContent[] =
    typeof message.content === "string"
      ? []
      : message.content.filter((b): b is ImageContent => b.type === "image");

  const time = formatTime(message.timestamp);
  const canFork = !!entryId && !!onFork;
  const canNavigate = !!prevAssistantEntryId && !!onNavigate;

  return (
    <MessageTurn
      role="user"
      navigationId={entryId}
      copyContent={content}
      timestamp={time}
      branchPending={forking}
      onRetry={canNavigate ? () => {
        onNavigate(prevAssistantEntryId!);
        onEditContent?.(message);
      } : undefined}
      onBranch={canFork ? () => onFork(entryId!) : undefined}
    >
      {imageBlocks.length > 0 && (
        <div className={styles.messageImages} data-has-text={Boolean(content)}>
          {imageBlocks.map((img, i) => {
            const flat = img as unknown as { data?: string; mimeType?: string };
            const src = img.source
              ? img.source.type === "base64"
                ? `data:${img.source.media_type};base64,${img.source.data}`
                : img.source.url ?? ""
              : flat.data
                ? `data:${flat.mimeType};base64,${flat.data}`
                : "";
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className={styles.messageImage} />
            );
          })}
        </div>
      )}
      {content && <SafeMarkdownBody className="markdown-user-message" cwd={cwd} onOpenFile={onOpenFile}>{content}</SafeMarkdownBody>}
    </MessageTurn>
  );
}

function AssistantMessageView({
  message,
  isStreaming,
  toolResults,
  cwd,
  onOpenFile,
  showTimestamp,
  prevTimestamp,
  sessionId,
  entryId,
  writtenFiles,
}: {
  message: AssistantMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  sessionId?: string;
  entryId?: string;
  writtenFiles?: WrittenFile[];
}) {
  const { t } = useI18n();
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const blockItems = useMemo(() => (message.content ?? [])
    .map((block, originalIndex) => ({ block, originalIndex }))
    .filter(({ block }) => !isEmptyThinkingBlock(block, { isStreaming })), [message.content, isStreaming]);
  const blocks = useMemo(() => blockItems.map(({ block }) => block), [blockItems]);
  const thinkingBlocksWithLaterContent = useMemo(() => {
    const indices = new Set<number>();
    let hasLaterContent = false;

    for (let index = blockItems.length - 1; index >= 0; index--) {
      const { block, originalIndex } = blockItems[index];
      if (hasLaterContent) indices.add(originalIndex);
      if (block.type === "toolCall" || (block.type === "text" && block.text.trim().length > 0)) {
        hasLaterContent = true;
      }
    }

    return indices;
  }, [blockItems]);
  const providerError = getAssistantErrorMessage(message, { isStreaming });
  const streamStartRef = useRef<number | null>(null);
  const [tps, setTps] = useState<number | null>(null);
  const [displayedTokens, setDisplayedTokens] = useState(0);
  const blockItemsRef = useRef(blockItems);
  blockItemsRef.current = blockItems;
  const tokenEstimateCacheRef = useRef<Map<number, TokenEstimateCacheEntry>>(new Map());
  const estimatedTokens = useMemo(() => {
    if (!isStreaming) {
      tokenEstimateCacheRef.current = new Map();
      return 0;
    }
    const nextCache = new Map<number, TokenEstimateCacheEntry>();
    let total = 0;
    for (const { block, originalIndex } of blockItems) {
      const text = getTokenEstimateText(block);
      if (text === null) continue;
      const tokens = estimateUpdatedTokens(tokenEstimateCacheRef.current.get(originalIndex), text);
      nextCache.set(originalIndex, { text, tokens });
      total += tokens;
    }
    tokenEstimateCacheRef.current = nextCache;
    return total;
  }, [blockItems, isStreaming]);
  const estimatedTokensRef = useRef(estimatedTokens);
  estimatedTokensRef.current = estimatedTokens;

  // Streaming-based timing for thinking blocks
  const blockStartTimesRef = useRef<Map<number, number>>(new Map());
  const [streamingDurations, setStreamingDurations] = useState<Map<number, number>>(new Map());

  // Thinking duration derived from file timestamps: time from prev message end to this message end
  // This is the total generation time (thinking + any text before first tool call)
  const thinkingDurationFromFile = useMemo<number | undefined>(() => {
    if (!message.timestamp || !prevTimestamp) return undefined;
    const secs = Math.round((message.timestamp - prevTimestamp) / 1000);
    return secs > 0 ? secs : undefined;
  }, [message.timestamp, prevTimestamp]);

  // Tool call durations derived from session file timestamps (accurate for completed messages)
  // assistant message timestamp = when generation ended = when tools started running
  // toolResult timestamp = when tool execution finished
  const toolCallDurations = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!toolResults || !message.timestamp) return map;
    for (const [callId, result] of toolResults) {
      if (result.timestamp && message.timestamp) {
        const secs = Math.round((result.timestamp - message.timestamp) / 1000);
        if (secs > 0) map.set(callId, secs);
      }
    }
    return map;
  }, [toolResults, message.timestamp]);

  const textContent = blocks
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  useEffect(() => {
    if (!isStreaming) {
      // Finalise any un-finished thinking block durations on stream end
      const now = new Date().getTime();
      setStreamingDurations((prev: Map<number, number>) => {
        const next = new Map(prev);
        for (const [idx, start] of blockStartTimesRef.current) {
          if (!next.has(idx)) next.set(idx, Math.round((now - start) / 1000));
        }
        return next;
      });
      streamStartRef.current = null;
      setTps(null);
      setDisplayedTokens(0);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextRenderTime = performance.now() + STREAMING_METRIC_RENDER_MS;
    const tick = () => {
      const frameTime = performance.now();
      while (frameTime >= nextRenderTime) nextRenderTime += STREAMING_METRIC_RENDER_MS;
      const items = blockItemsRef.current;
      const now = Date.now();

      // Record start time for each block the first time we see it
      items.forEach(({ originalIndex }) => {
        if (!blockStartTimesRef.current.has(originalIndex)) blockStartTimesRef.current.set(originalIndex, now);
      });

      // When a non-last block has a successor already started, finalise its duration
      setStreamingDurations((prev: Map<number, number>) => {
        let changed = false;
        const next = new Map(prev);
        for (let i = 0; i < items.length - 1; i++) {
          const originalIndex = items[i].originalIndex;
          const nextOriginalIndex = items[i + 1].originalIndex;
          if (!next.has(originalIndex) && blockStartTimesRef.current.has(originalIndex)) {
            const start = blockStartTimesRef.current.get(originalIndex)!;
            const nextStart = blockStartTimesRef.current.get(nextOriginalIndex) ?? now;
            next.set(originalIndex, Math.round((nextStart - start) / 1000));
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const tokens = estimatedTokensRef.current;
      setDisplayedTokens(Math.round(tokens));
      if (tokens > 0) {
        if (streamStartRef.current === null) streamStartRef.current = frameTime;
        const elapsed = (frameTime - streamStartRef.current) / 1000;
        if (elapsed > 0.5) {
          const sample = tokens / elapsed;
          setTps((previous) => smoothStreamingRate(previous, sample));
        }
      }
      timer = setTimeout(tick, Math.max(0, nextRenderTime - performance.now()));
    };
    timer = setTimeout(tick, STREAMING_METRIC_RENDER_MS);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [isStreaming]);

  if (blocks.length === 0 && !isStreaming && !providerError) return null;

  return (
    <MessageTurn
      role="assistant"
      streaming={isStreaming}
      copyContent={textContent || undefined}
      timestamp={time}
      // The model name no longer heads every message. The header carries streaming stats only.
      header={isStreaming ? (() => {
          const est = displayedTokens;
          if (est <= 0) return undefined;
          return <StreamingMetrics estimatedTokens={est} tokensPerSecond={tps} title={t("i18n.estimatedTokens")} />;
        })() : undefined}
      afterBody={(
        <>
          {providerError && (
            <div role="alert" className={styles.providerError} data-has-content={blocks.length > 0}>
              Error: {providerError}
            </div>
          )}
          {writtenFiles && writtenFiles.length > 0 && (
            <TurnWrittenFiles files={writtenFiles} onOpenFile={onOpenFile} />
          )}
        </>
      )}
      footer={message.usage && !isStreaming ? (
        <div className={styles.usage}>{formatUsage(message.usage)}</div>
      ) : undefined}
    >
        {blockItems.map(({ block, originalIndex }) => (
          <BlockView key={`${entryId ?? "stream"}-${originalIndex}`} block={block} toolResults={toolResults} isStreaming={isStreaming} hasLaterContent={thinkingBlocksWithLaterContent.has(originalIndex)} streamingDuration={streamingDurations.get(originalIndex) ?? (block.type === "thinking" ? thinkingDurationFromFile : undefined)} toolCallDurations={toolCallDurations} cwd={cwd} onOpenFile={onOpenFile} sessionId={sessionId} entryId={entryId} blockIndex={originalIndex} />
        ))}
    </MessageTurn>
  );
}

function BlockView({ block, toolResults, isStreaming, hasLaterContent, streamingDuration, toolCallDurations, cwd, onOpenFile, sessionId, entryId, blockIndex }: { block: AssistantContentBlock; toolResults?: Map<string, ToolResultMessage>; isStreaming?: boolean; hasLaterContent?: boolean; streamingDuration?: number; toolCallDurations?: Map<string, number>; cwd?: string; onOpenFile?: (filePath: string) => void; sessionId?: string; entryId?: string; blockIndex: number }) {
  if (block.type === "text") {
    return <TextBlock block={block as TextContent} isStreaming={isStreaming} cwd={cwd} onOpenFile={onOpenFile} />;
  }
  if (block.type === "thinking") {
    return <ThinkingDisclosure block={block} duration={streamingDuration} streaming={isStreaming} hasLaterContent={hasLaterContent} sessionId={sessionId} entryId={entryId} blockIndex={blockIndex} />;
  }
  if (block.type === "toolCall") {
    const tc = block as ToolCallContent;
    const result = toolResults?.get(tc.toolCallId);
    const duration = toolCallDurations?.get(tc.toolCallId);
    return <ToolActivity block={tc} result={result} duration={duration} />;
  }
  return null;
}

function TextBlock({ block, isStreaming, cwd, onOpenFile }: { block: TextContent; isStreaming?: boolean; cwd?: string; onOpenFile?: (filePath: string) => void }) {
  return <SafeMarkdownBody isStreaming={isStreaming} cwd={cwd} onOpenFile={onOpenFile}>{block.text}</SafeMarkdownBody>;
}

function CompactionMessageView({ message }: { message: CustomMessage }) {
  const { t } = useI18n();
  const summary = getMessageText(message.content);
  const parsedSummary = useMemo(() => parseCompactionSummary(summary), [summary]);
  const time = formatTime(message.timestamp);

  return (
    <MessageTurn
      role="compaction"
      timestamp={time}
      header={<span className={styles.messageCardType}>compaction</span>}
    >
      <div className={styles.compactionBody}>
        <div className={styles.compactionTitle}>{t("i18n.conversationCompacted")}</div>
        <div className={styles.compactionDescription}>{t("i18n.compactionDescription")}</div>
        {parsedSummary.body ? (
          <MarkdownBody className="markdown-compaction-message">{parsedSummary.body}</MarkdownBody>
        ) : (
          <span className={styles.emptyMessage}>{t("i18n.noSummary")}</span>
        )}
        <CompactionFileMetadata readFiles={parsedSummary.readFiles} modifiedFiles={parsedSummary.modifiedFiles} />
      </div>
    </MessageTurn>
  );
}

function CompactionFileMetadata({ readFiles, modifiedFiles }: { readFiles: string[]; modifiedFiles: string[] }) {
  const { t } = useI18n();
  const total = readFiles.length + modifiedFiles.length;
  if (total === 0) return null;

  const parts = [];
  if (readFiles.length > 0) parts.push(`${readFiles.length} read`);
  if (modifiedFiles.length > 0) parts.push(`${modifiedFiles.length} modified`);

  return (
    <details className="compaction-file-details">
       <summary>{t("i18n.fileContext", { details: parts.join(", ") })}</summary>
       {modifiedFiles.length > 0 && <CompactionFileList title={t("i18n.modifiedFiles")} files={modifiedFiles} />}
       {readFiles.length > 0 && <CompactionFileList title={t("i18n.readFiles")} files={readFiles} />}
    </details>
  );
}

function CompactionFileList({ title, files }: { title: string; files: string[] }) {
  return (
    <div className="compaction-file-section">
      <div className="compaction-file-title">{title}</div>
      <ul className="compaction-file-list">
        {files.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
    </div>
  );
}

function CustomMessageView({ message, cwd, onOpenFile }: { message: CustomMessage; cwd?: string; onOpenFile?: (filePath: string) => void }) {
  const { t } = useI18n();
  const isHiddenDisplay = message.display === false;
  const [contentExpanded, setContentExpanded] = useState(!isHiddenDisplay);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const text = getMessageText(message.content);
  const images = getMessageImages(message.content);
  const hasDetails = message.details !== undefined;
  const detailsText = hasDetails ? safeJson(message.details) : "";
  const title = formatCustomType(message.customType);
  const time = formatTime(message.timestamp);
  const collaboration = message.customType === "collaboration" && isCollaborationSnapshot(message.details)
    ? message.details
    : null;

  if (collaboration) {
    return (
      <MessageTurn
        role="custom"
        timestamp={time}
        header={<span className={styles.messageCardType}>Collaboration</span>}
      >
        <CollaborationCard collaboration={collaboration} />
      </MessageTurn>
    );
  }

  return (
    <MessageTurn
      role="custom"
      timestamp={time}
      copyContent={text || detailsText || undefined}
      cardHidden={isHiddenDisplay}
      cardExpanded={contentExpanded}
      header={(
        <>
          <span className={styles.messageCardType}>{title}</span>
          {isHiddenDisplay && <span className={styles.hiddenMessageLabel}>{t("i18n.hiddenExtensionMessage")}</span>}
        </>
      )}
      footer={(hasDetails || isHiddenDisplay) ? (
        <button
          type="button"
          onClick={() => {
            if (isHiddenDisplay) setContentExpanded((value) => !value);
            else setDetailsExpanded((value) => !value);
          }}
          className={`${styles.cardAction} ${styles.cardActionTrailing}`}
        >
          {isHiddenDisplay
            ? (contentExpanded ? t("i18n.collapse") : t("i18n.expand"))
            : (detailsExpanded ? t("i18n.hideDetails") : t("i18n.showDetails"))}
        </button>
      ) : undefined}
      afterBody={hasDetails && ((isHiddenDisplay && contentExpanded) || (!isHiddenDisplay && detailsExpanded)) ? (
        <pre className={styles.customMessageDetails}>{detailsText}</pre>
      ) : undefined}
    >
      {contentExpanded ? (
        <div className={styles.customMessageBody}>
          {images.length > 0 && (
            <div className={styles.messageImages} data-has-text={Boolean(text)}>
              {images.map((img, i) => {
                const src = imageSource(img);
                if (!src) return null;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" className={styles.messageImage} />
                );
              })}
            </div>
          )}
          {text ? (
            <MarkdownBody className="markdown-custom-message" cwd={cwd} onOpenFile={onOpenFile}>{text}</MarkdownBody>
          ) : (
            <span className={styles.emptyMessage}>{t("i18n.noMessage")}</span>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setContentExpanded(true)} className={styles.customMessagePreview}>
          {text ? previewText(text) : t("i18n.showExtensionMessage")}
        </button>
      )}
    </MessageTurn>
  );
}

function getMessageText(content: CustomMessage["content"] | UserMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function getMessageImages(content: CustomMessage["content"] | UserMessage["content"]): ImageContent[] {
  if (typeof content === "string") return [];
  return content.filter((b): b is ImageContent => b.type === "image");
}

function imageSource(img: ImageContent): string {
  const flat = img as unknown as { data?: string; mimeType?: string };
  if (img.source) {
    return img.source.type === "base64"
      ? `data:${img.source.media_type};base64,${img.source.data}`
      : img.source.url ?? "";
  }
  return flat.data ? `data:${flat.mimeType};base64,${flat.data}` : "";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatCustomType(type: string): string {
  return type || "extension";
}

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Show extension message";
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
}


function formatUsage(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { total: number };
}): string {
  const parts = [];
  if (usage.input) parts.push(`${usage.input.toLocaleString()} in`);
  if (usage.output) parts.push(`${usage.output.toLocaleString()} out`);
  if (usage.cacheRead) parts.push(`${usage.cacheRead.toLocaleString()} cache R`);
  if (usage.cacheWrite) parts.push(`${usage.cacheWrite.toLocaleString()} cache W`);
  if (usage.cost?.total) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" · ");
}
