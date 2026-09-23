"use client";

import { useI18n } from "@/hooks/useI18n";

import styles from "./history-load-failure-row.module.css";

export interface HistoryLoadFailureRowProps {
  onRetry: () => void;
  retrying?: boolean;
}

export function HistoryLoadFailureRow({ onRetry, retrying = false }: HistoryLoadFailureRowProps) {
  const { t } = useI18n();

  return (
    <div className={styles.row} data-transcript-note="history-load-failure" role="alert">
      <span>{t("transcript.historyLoadFailed")}</span>
      <button
        type="button"
        data-history-retry
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying || undefined}
      >
        {t("transcript.retryHistoryLoad")}
      </button>
    </div>
  );
}
