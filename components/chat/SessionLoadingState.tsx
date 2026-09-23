"use client";

import { useI18n } from "@/hooks/useI18n";
import styles from "./SessionLoadingState.module.css";

export function SessionLoadingState({ active }: { active: boolean }) {
  const { t } = useI18n();
  if (!active) return null;

  return (
    <div className={styles.row} role="status" aria-live="polite" data-session-loading="">
      <span className={styles.spinner} data-session-loading-spinner="" aria-hidden="true" />
      <span>{t("transcript.loadingTask")}</span>
    </div>
  );
}
