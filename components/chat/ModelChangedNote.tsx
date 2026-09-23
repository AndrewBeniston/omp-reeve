"use client";

import { useId } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./model-changed-note.module.css";

export function ModelChangedNote({ fromModel, toModel }: { fromModel: string; toModel: string }) {
  const { t } = useI18n();
  const tooltipId = useId();
  const label = t("transcript.modelChanged", { fromModel, toModel });

  return (
    <div className={styles.note} data-transcript-note="model-changed">
      <span className={styles.rule} aria-hidden="true" />
      <div className={styles.content}>
        <span
          className={styles.tooltipTrigger}
          tabIndex={0}
          role="img"
          aria-label={label}
          aria-describedby={tooltipId}
        >
          <ArrowRightLeft className={styles.icon} aria-hidden="true" />
          <span className={styles.warningTooltip} id={tooltipId} role="tooltip">
            <span data-warning-line="1">{t("transcript.modelChangedWarningLine1")}</span>
            <span data-warning-line="2">{t("transcript.modelChangedWarningLine2")}</span>
          </span>
        </span>
        <span className={styles.label}>{label}</span>
      </div>
      <span className={styles.rule} aria-hidden="true" />
    </div>
  );
}
