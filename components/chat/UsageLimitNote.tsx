"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import type { AssistantMessage } from "@/lib/types";
import styles from "./usage-limit-note.module.css";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";

export interface UsageLimitNoteProps {
  message: AssistantMessage;
  onRetry: (automatic: boolean) => void;
}

export function UsageLimitNote({ message, onRetry }: UsageLimitNoteProps) {
  const { t, locale } = useI18n();
  const [startedAt, setStartedAt] = useState(0);
  const [deadline, setDeadline] = useState<number | undefined>();
  const [remainingMs, setRemainingMs] = useState(0);
  const cancelledRetry = useRef(false);
  const automaticRetryFired = useRef(false);
  const classifiedUsageLimit = message.stopReason === "error" && message.usageLimit !== undefined;

  useEffect(() => {
    const now = Date.now();
    const retryAfterMs = message.usageLimit?.retryAfterMs;
    const nextDeadline = retryAfterMs === undefined ? undefined : now + retryAfterMs;
    setStartedAt(now);
    setDeadline(nextDeadline);
    setRemainingMs(Math.max(0, (nextDeadline ?? 0) - now));
  }, [message.usageLimit?.retryAfterMs]);

  useEffect(() => {
    if (deadline === undefined) return;
    const update = () => setRemainingMs(Math.max(0, deadline - Date.now()));
    update();
    const timer = globalThis.setInterval(update, 1_000);
    return () => globalThis.clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (deadline === undefined || remainingMs > 0 || cancelledRetry.current || automaticRetryFired.current) return;
    automaticRetryFired.current = true;
    onRetry(true);
  }, [deadline, onRetry, remainingMs]);

  if (!classifiedUsageLimit) return null;

  const remainingSeconds = Math.ceil(remainingMs / 1_000);
  const deadlineLabel = deadline === undefined
    ? undefined
    : new Date(deadline).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const messageLabel = deadlineLabel === undefined
    ? t("transcript.usageLimit.retry")
    : t("transcript.usageLimit.retryWithDeadline", { resetDate: deadlineLabel });
  const progress = deadline === undefined ? 0 : Math.max(0, Math.min(1, remainingMs / Math.max(1, deadline - startedAt)));

  const retry = (automatic: boolean) => {
    cancelledRetry.current = true;
    onRetry(automatic);
  };

  return (
    <div className={styles.note} data-transcript-note="usage-limit" role="alert">
      <AlertTriangle className={styles.icon} aria-hidden="true" />
      <div className={styles.content}>
        <span className={styles.message}>
          {deadlineLabel === undefined
            ? messageLabel
            : <time dateTime={new Date(deadline!).toISOString()}>{messageLabel}</time>}
        </span>
        <div className={styles.retryRow}>
          <span className={styles.progressTrack} aria-hidden="true">
            <DynamicStyleVars className={styles.progress} variables={{ "--ui-progress": `${progress * 100}%` }} />
          </span>
          <button className={styles.retry} type="button" onClick={() => retry(false)}>
            {deadline === undefined ? t("transcript.usageLimit.retryAction") : t("transcript.usageLimit.retryCountdown", { seconds: remainingSeconds })}
          </button>
        </div>
      </div>
    </div>
  );
}
