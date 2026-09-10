"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SubagentSnapshot, ToolResultMessage } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { normalizeToolCalls } from "@/lib/normalize";
import { sendAgentCommand } from "@/lib/agent-client";
import { MessageView } from "../MessageView";
import {
  formatSubagentDuration,
  getSubagentStatus,
  isSubagentActive,
  subagentActivity,
  type SubagentTranscriptEntry,
  type SubagentTranscriptResult,
} from "./subagent-helpers";
import styles from "./subagent-panel.module.css";

export function SubagentDetail({
  sessionId,
  cwd,
  subagent,
  onBack,
}: {
  sessionId: string;
  cwd?: string;
  subagent: SubagentSnapshot;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const active = isSubagentActive(subagent);
  const status = getSubagentStatus(subagent);
  const [entries, setEntries] = useState<SubagentTranscriptEntry[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(true);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followTailRef = useRef(true);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let nextByte = 0;
    setEntries([]);
    setLoadingTranscript(true);
    setTranscriptError(null);
    followTailRef.current = true;

    const loadTranscript = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        const result = await sendAgentCommand<SubagentTranscriptResult>(sessionId, {
          type: "get_subagent_messages",
          subagentId: subagent.id,
          fromByte: nextByte,
        });
        if (disposed) return;
        const chunk = result.entries.flatMap((entry, index) =>
          entry.type === "message" && entry.message
            ? [{
                id: entry.id ?? `${result.fromByte}:${index}`,
                message: normalizeToolCalls(entry.message),
              }]
            : []);
        setEntries((current) => result.reset || result.fromByte === 0 ? chunk : [...current, ...chunk]);
        nextByte = result.nextByte;
        setTranscriptError(null);
      } catch (error) {
        if (!disposed) setTranscriptError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!disposed) setLoadingTranscript(false);
        inFlight = false;
      }
    };

    void loadTranscript();
    const interval = active ? setInterval(() => void loadTranscript(), 1000) : undefined;
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [active, sessionId, subagent.id]);

  useEffect(() => {
    if (!followTailRef.current) return;
    const frame = requestAnimationFrame(() => {
      const transcript = transcriptRef.current;
      if (transcript) transcript.scrollTop = transcript.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [entries.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  const toolResults = useMemo(() => {
    const resultMap = new Map<string, ToolResultMessage>();
    for (const entry of entries) {
      if (entry.message.role === "toolResult") resultMap.set(entry.message.toolCallId, entry.message);
    }
    return resultMap;
  }, [entries]);

  const progress = subagent.progress;

  return (
    <section aria-label={t("subagents.details")} className={styles.detail}>
      <div className={styles.detailHeader}>
        <button
          type="button"
          onClick={onBack}
          title={t("subagents.back")}
          aria-label={t("subagents.back")}
          className={styles.backButton}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.5 3 5.5 8l5 5" />
          </svg>
        </button>
        <span className={`${styles.statusDot} ${styles.detailStatusDot}`} data-status={status} aria-hidden="true" />
        <div className={styles.headerIdentity}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerTitle}>{subagent.id}</span>
            <span className={`${styles.agentBadge} ${styles.detailAgentBadge}`}>{subagent.agent}</span>
          </div>
        </div>
      </div>

      <div className={styles.metaStrip}>
        <span className={styles.metaStatus} data-status={status}>{active ? t("subagents.running") : subagentActivity(subagent, t)}</span>
        <span>{formatSubagentDuration(progress?.durationMs)}</span>
        <span>{t("subagents.tools", { count: progress?.toolCount ?? 0 })}</span>
        <span>{t("subagents.tokens", { count: progress?.tokens ?? 0 })}</span>
        {progress?.resolvedModel && <span>{progress.resolvedModel}</span>}
        {progress?.currentTool && <span className={styles.metaTool}>{t("subagents.usingTool", { tool: progress.currentTool })}</span>}
      </div>

      <div
        ref={transcriptRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          followTailRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className={styles.transcript}
      >
        {entries.length > 0 ? entries.map((entry, index) => (
          <MessageView
            key={entry.id}
            message={entry.message}
            toolResults={toolResults}
            cwd={cwd}
            showTimestamp
            prevTimestamp={entries[index - 1]?.message.timestamp}
          />
        )) : (
          <div className={styles.transcriptEmpty}>
            {loadingTranscript
              ? t("subagents.loadingTranscript")
              : progress?.recentOutput?.length
                ? <pre className={styles.recentOutput}>{progress.recentOutput.join("\n")}</pre>
                : t("subagents.noTranscript")}
          </div>
        )}
        {transcriptError && (
          <div role="status" className={styles.transcriptError}>
            {t("subagents.transcriptUnavailable")}
          </div>
        )}
      </div>
    </section>
  );
}
