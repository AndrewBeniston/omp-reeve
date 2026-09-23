"use client";

import { Target } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./goal-entry-button.module.css";

export function GoalEntryButton({ onOpen, disabled = false }: { onOpen: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" className={styles.button} onClick={onOpen} disabled={disabled}
      aria-label={t("composer.goal.title")} title={t("composer.goalSlashCommand.setDescription")}>
      <Target size={14} aria-hidden="true" />
      <span>{t("composer.goal.objective")}</span>
    </button>
  );
}
