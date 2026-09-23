"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AssistantContentBlock, TextContent } from "@/lib/types";

export interface AssistantResponseAnnouncerProps {
  /** Unique ID for the response, such as entryId or message index. */
  responseId?: string;
  /** Current session ID. */
  sessionId?: string;
  /** Whether the assistant response is actively streaming. */
  isStreaming?: boolean;
  /** Raw content blocks or text of the assistant message. */
  content?: string | AssistantContentBlock[];
  /** Pre-extracted plain text if already available. */
  plainText?: string;
  /** Current working directory. */
  cwd?: string;
  /** Output directory for projectless sessions. */
  projectlessOutputDir?: string;
  /** Whether a response that mounts already complete should announce. */
  announceOnMount?: boolean;
  /** Locale override for segmentation and strings. */
  locale?: string;
  /** Progress polling interval in milliseconds. Defaults to 5,000 ms. */
  intervalMs?: number;
  /** Whether this response has been superseded by a newer response. */
  superseded?: boolean;
  /** Optional callback invoked on each announcement. */
  onAnnounce?: (announcement: string) => void;
}

export interface ResponseAnnouncementRecord {
  responseId: string;
  sessionId?: string;
  cursor: number;
  started: boolean;
  completed: boolean;
  lastAnnouncedText: string;
  timerId: ReturnType<typeof setInterval> | null;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 5000;

// Module-level registry tracking announcement state per response.
// This survives remounts and reconnects within the session.
const responseStateRegistry = new Map<string, ResponseAnnouncementRecord>();

/**
 * Returns the recorded announcement state for a response.
 */
export function getResponseAnnouncerState(responseKey: string): ResponseAnnouncementRecord | undefined {
  return responseStateRegistry.get(responseKey);
}

/**
 * Clears recorded announcement state. If key is omitted, clears all records.
 */
export function resetAnnouncerState(responseKey?: string): void {
  if (responseKey) {
    const existing = responseStateRegistry.get(responseKey);
    if (existing?.timerId) {
      clearInterval(existing.timerId);
    }
    responseStateRegistry.delete(responseKey);
  } else {
    for (const record of responseStateRegistry.values()) {
      if (record.timerId) {
        clearInterval(record.timerId);
      }
    }
    responseStateRegistry.clear();
  }
}

/**
 * Extracts plain text from message content blocks or a string value.
 */
export function derivePlainText(
  content?: string | AssistantContentBlock[],
  _options?: { cwd?: string; projectlessOutputDir?: string },
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is TextContent => Boolean(b && b.type === "text" && typeof (b as TextContent).text === "string"))
    .map((b) => (b as TextContent).text)
    .join("\n");
}

/**
 * Trims text to the last complete word using Intl.Segmenter for the given locale.
 * Uses a deterministic fallback when Intl.Segmenter is unavailable or lacks the locale.
 */
export function trimToLastCompleteWord(text: string, locale: string = "en"): string {
  if (!text || text.trim().length === 0) return "";

  // 1. Try Intl.Segmenter if supported for this locale
  let hasSegmenter = false;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      const supported = Intl.Segmenter.supportedLocalesOf(locale);
      if (supported.length > 0) {
        hasSegmenter = true;
      }
    }
  } catch {
    hasSegmenter = false;
  }

  if (hasSegmenter) {
    try {
      const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
      const segments = Array.from(segmenter.segment(text));

      // A word segment is complete if it is followed by another segment (boundary or next word)
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        if (seg.isWordLike && i < segments.length - 1) {
          return text.slice(0, seg.index + seg.segment.length);
        }
      }
      return "";
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // 2. Deterministic fallback when Intl.Segmenter is unavailable or lacks the locale.
  // Match word tokens using Unicode character classes.
  // Han and Kana characters are matched individually; Latin and other scripts are matched as words.
  const tokenRegex = new RegExp("[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]|[\\p{L}\\p{N}]+", "gu");
  const matches = Array.from(text.matchAll(tokenRegex));
  if (matches.length === 0) return "";

  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const matchIndex = match.index ?? 0;
    const matchEnd = matchIndex + match[0].length;
    if (matchEnd < text.length) {
      return text.slice(0, matchEnd);
    }
  }

  return "";
}

/**
 * Hook managing the accessibility announcement state and timers for an assistant response.
 */
export function useAssistantResponseAnnouncer(props: AssistantResponseAnnouncerProps) {
  const { t, locale: contextLocale } = useI18n();
  const effectiveLocale = props.locale || contextLocale || "en";
  const fallbackId = useId();
  const responseKey = props.responseId || fallbackId;
  const intervalMs = props.intervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;

  const [announcement, setAnnouncementState] = useState<string>("");

  const resolvedPlainText = useMemo(() => {
    if (props.plainText !== undefined) return props.plainText;
    return derivePlainText(props.content, {
      cwd: props.cwd,
      projectlessOutputDir: props.projectlessOutputDir,
    });
  }, [props.plainText, props.content, props.cwd, props.projectlessOutputDir]);

  const propsRef = useRef({
    ...props,
    effectiveLocale,
    resolvedPlainText,
    responseKey,
    intervalMs,
    t,
  });
  propsRef.current = {
    ...props,
    effectiveLocale,
    resolvedPlainText,
    responseKey,
    intervalMs,
    t,
  };

  const publishAnnouncement = (text: string) => {
    setAnnouncementState(text);
    propsRef.current.onAnnounce?.(text);
  };

  // Get or initialize state record for this response
  const getOrCreateRecord = (): ResponseAnnouncementRecord => {
    let record = responseStateRegistry.get(responseKey);
    if (!record) {
      record = {
        responseId: responseKey,
        sessionId: props.sessionId,
        cursor: 0,
        started: false,
        completed: false,
        lastAnnouncedText: "",
        timerId: null,
      };
      responseStateRegistry.set(responseKey, record);
    }
    return record;
  };

  const clearResponseTimer = (record: ResponseAnnouncementRecord) => {
    if (record.timerId) {
      clearInterval(record.timerId);
      record.timerId = null;
    }
  };

  // Main lifecycle effect for streaming, started, progress, completion, and timer management
  useEffect(() => {
    const record = getOrCreateRecord();

    // Check for session change
    if (props.sessionId && record.sessionId && record.sessionId !== props.sessionId) {
      clearResponseTimer(record);
      record.sessionId = props.sessionId;
    } else if (props.sessionId && !record.sessionId) {
      record.sessionId = props.sessionId;
    }

    // Check for superseding response
    if (props.superseded) {
      clearResponseTimer(record);
      return;
    }

    // 1. Started state: writes once per item and records an empty announced-content value (cursor: 0)
    if (props.isStreaming && !record.started && !record.completed) {
      record.started = true;
      record.cursor = 0;
      const startedText = t("localConversation.assistantResponse.announcement.started");
      record.lastAnnouncedText = startedText;
      publishAnnouncement(startedText);
    }

    // 2. Progress state: runs on intervalMs while incomplete
    if (props.isStreaming && !record.completed) {
      if (!record.timerId) {
        record.timerId = setInterval(() => {
          const currentProps = propsRef.current;
          if (!currentProps.isStreaming || currentProps.superseded) {
            clearResponseTimer(record);
            return;
          }

          const currentText = currentProps.resolvedPlainText;
          const trimmed = trimToLastCompleteWord(currentText, currentProps.effectiveLocale);

          if (trimmed.length > record.cursor) {
            const unannouncedRaw = trimmed.slice(record.cursor);
            const unannounced = unannouncedRaw.trim();
            if (unannounced.length > 0) {
              const progressText = currentProps.t("localConversation.assistantResponse.announcement.progress", {
                content: unannounced,
              });
              record.cursor = trimmed.length;
              record.lastAnnouncedText = progressText;
              publishAnnouncement(progressText);
            }
          }
        }, intervalMs);
      }
    } else {
      clearResponseTimer(record);
    }

    // 3. Completion state or missed completion reconciliation after reconnect
    const isCompletedNow = !props.isStreaming;
    const shouldAnnounceCompletion = isCompletedNow && (!record.completed && (record.started || props.announceOnMount));

    if (shouldAnnounceCompletion) {
      clearResponseTimer(record);
      const fullText = resolvedPlainText.trimEnd();
      const remaining = fullText.slice(record.cursor).trim();

      let completionText = "";
      if (remaining.length > 0) {
        completionText = t("localConversation.assistantResponse.announcement.completedWithContent", {
          content: remaining,
        });
      } else {
        completionText = t("localConversation.assistantResponse.announcement.completed");
      }

      record.cursor = fullText.length;
      record.completed = true;
      record.lastAnnouncedText = completionText;
      publishAnnouncement(completionText);
    } else if (isCompletedNow && !record.completed && !props.announceOnMount && !record.started) {
      // Historical item mounted already complete without announceOnMount: mark completed quietly
      record.completed = true;
      record.cursor = resolvedPlainText.length;
    }

    return () => {
      clearResponseTimer(record);
    };
  }, [
    responseKey,
    props.sessionId,
    props.isStreaming,
    props.superseded,
    props.announceOnMount,
    intervalMs,
    resolvedPlainText,
    t,
  ]);

  return {
    announcement,
    record: responseStateRegistry.get(responseKey),
  };
}
