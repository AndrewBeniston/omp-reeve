"use client";

import { RefreshCw } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./provider-retry-note.module.css";

export interface ProviderRetryState {
  attempt?: number;
  maxAttempts?: number;
  errorMessage?: string;
}

export function ProviderRetryNote({ attempt, maxAttempts, errorMessage }: ProviderRetryState) {
  const { t } = useI18n();
  const hasProgress = typeof attempt === "number" && typeof maxAttempts === "number";

  return (
    <div
      className={styles.note}
      data-transcript-note="provider-retry"
      role="status"
      aria-live="polite"
    >
      <RefreshCw className={styles.icon} aria-hidden="true" />
      <span>{hasProgress ? t("transcript.providerRetryProgressStart") : t("transcript.providerRetrying")}</span>
      {hasProgress ? (
        <span className={styles.counter} data-retry-counter>
          <span key={attempt} className={styles.attempt} data-retry-attempt data-roll="true">{attempt}</span>
          <span>{t("transcript.providerRetryProgressDenominator", { maxAttempts })}</span>
          <span>{t("transcript.providerRetryProgressEnd")}</span>
        </span>
      ) : null}
      {errorMessage ? <span className={styles.detail}>{errorMessage}</span> : null}
    </div>
  );
}
