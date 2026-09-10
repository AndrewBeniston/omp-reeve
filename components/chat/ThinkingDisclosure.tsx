"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { ThinkingContent } from "@/lib/types";
import { MarkdownBody } from "../MarkdownBody";
import { Disclosure } from "../ui/Disclosure";
import styles from "./message-view.module.css";

const MAX_THINKING_CACHE_ENTRIES = 100;
const thinkingContentCache = new Map<string, Promise<string>>();

function loadThinkingContent(sessionId: string, entryId: string, blockIndex: number): Promise<string> {
  const key = `${sessionId}:${entryId}:${blockIndex}`;
  const cached = thinkingContentCache.get(key);
  if (cached) {
    thinkingContentCache.delete(key);
    thinkingContentCache.set(key, cached);
    return cached;
  }

  const request = fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/entries/${encodeURIComponent(entryId)}/thinking?blockIndex=${blockIndex}`,
  ).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { thinking?: unknown };
    if (typeof data.thinking !== "string") throw new Error("Invalid thinking response");
    return data.thinking;
  }).catch((error) => {
    thinkingContentCache.delete(key);
    throw error;
  });

  thinkingContentCache.set(key, request);
  if (thinkingContentCache.size > MAX_THINKING_CACHE_ENTRIES) {
    const oldestKey = thinkingContentCache.keys().next().value;
    if (oldestKey) thinkingContentCache.delete(oldestKey);
  }
  return request;
}

interface ThinkingDisclosureProps {
  block: ThinkingContent;
  duration?: number;
  streaming?: boolean;
  hasLaterContent?: boolean;
  sessionId?: string;
  entryId?: string;
  blockIndex: number;
}

export function resolveThinkingExpanded(userChoice: boolean | null, streaming: boolean, hasLaterContent: boolean): boolean {
  return userChoice ?? (streaming && !hasLaterContent);
}

export function summarizeThinking(text: string): string {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const plainText = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return plainText.slice(0, 120);
}

export function ThinkingDisclosure({
  block,
  duration,
  streaming = false,
  hasLaterContent = false,
  sessionId,
  entryId,
  blockIndex,
}: ThinkingDisclosureProps) {
  const { t } = useI18n();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(block.deferred === true);
  const [error, setError] = useState<string | null>(null);
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!block.deferred) {
      setContent(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    if (!sessionId || !entryId) {
      setLoading(false);
      setError(t("i18n.thinkingUnavailable"));
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    void loadThinkingContent(sessionId, entryId, blockIndex)
      .then((value) => {
        if (!cancelled) setContent(value);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [block.deferred, block.thinking, blockIndex, entryId, sessionId, t]);

  const text = block.deferred ? content : block.thinking;
  const hasText = typeof text === "string" && text.trim().length > 0;
  const active = streaming && !hasLaterContent;
  const expanded = resolveThinkingExpanded(userExpanded, streaming, hasLaterContent);
  const summary = hasText ? summarizeThinking(text) : "";
  const label = active ? t("chat.thinking") : summary || t("i18n.thinking");

  const triggerLabel = (
    <span className={styles.thinkingLabel}>
      <span className={styles.thinkingSummary}>
        {active ? (
          <span className={styles.thinkingStatus} aria-live="polite">{label}</span>
        ) : label}
      </span>
      {duration !== undefined && hasText && (
        <span className={styles.thinkingDuration}>{duration}s</span>
      )}
    </span>
  );

  return (
    <div data-thinking-state={active ? "active" : "complete"}>
      <Disclosure
        className={styles.thinkingDisclosure}
        density="compact"
        label={triggerLabel}
        expanded={expanded}
        onExpandedChange={setUserExpanded}
      >
        <div className={styles.thinkingContent}>
          {loading ? (
            <span className={styles.thinkingStatus}>{t("i18n.loadingThinking")}</span>
          ) : error ? (
            <span className={styles.thinkingError}>{error}</span>
          ) : hasText ? (
            <MarkdownBody className="markdown-thinking-body" isStreaming={active}>{text}</MarkdownBody>
          ) : (
            <span className={styles.thinkingStatus}>{t("chat.thinking")}</span>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
