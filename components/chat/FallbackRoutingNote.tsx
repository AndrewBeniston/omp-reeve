"use client";

import { ArrowRightLeft } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./fallback-routing-note.module.css";

export function FallbackRoutingNote({ toModel }: { toModel: string }) {
  const { t } = useI18n();

  return (
    <div className={styles.note} data-transcript-note="fallback-route">
      <span className={styles.rule} aria-hidden="true" />
      <div className={styles.content}>
        <ArrowRightLeft className={styles.icon} aria-hidden="true" />
        <span className={styles.label}>{t("transcript.fallbackRouting", { toModel })}</span>
      </div>
      <span className={styles.rule} aria-hidden="true" />
    </div>
  );
}
