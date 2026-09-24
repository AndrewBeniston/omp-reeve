"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "../ui/Button";
import styles from "./goal-tab.module.css";

interface GoalTabProps {
  goal: Goal;
  onSave: (objective: string, tokenBudget: number | null) => Promise<boolean>;
  onClose: () => void;
}

function updatedLabel(timestamp: number, now: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  return minutes === 0
    ? t("composer.threadGoal.editor.updatedJustNow")
    : t("composer.threadGoal.editor.updatedMinutesAgo", { minutes });
}

export function GoalTab({ goal, onSave, onClose }: GoalTabProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(goal.objective);
  const [savedGoal, setSavedGoal] = useState(goal);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const versionRef = useRef({ id: goal.id, updatedAt: goal.updatedAt, objective: goal.objective });
  const pendingSaveRef = useRef<{ objective: string } | null>(null);

  useEffect(() => {
    if (goal.status === "complete") {
      onClose();
      return;
    }
    if (goal.id !== versionRef.current.id) {
      onClose();
      return;
    }
    const objectiveChanged = goal.objective !== versionRef.current.objective;
    if (objectiveChanged && goal.objective !== pendingSaveRef.current?.objective) {
      onClose();
      return;
    }
    if (goal.updatedAt !== versionRef.current.updatedAt || objectiveChanged) {
      versionRef.current = { id: goal.id, updatedAt: goal.updatedAt, objective: goal.objective };
      pendingSaveRef.current = null;
      setSavedGoal(goal);
      setDraft(goal.objective);
    }
  }, [goal, onClose]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const changed = draft.trim() !== savedGoal.objective;

  async function save() {
    if (busy || !changed || !draft.trim()) return;
    const objective = draft.trim();
    const pendingSave = { objective };
    pendingSaveRef.current = pendingSave;
    setBusy(true);
    setError(null);
    try {
      if (!await onSave(objective, savedGoal.tokenBudget ?? null)) {
        if (pendingSaveRef.current === pendingSave) pendingSaveRef.current = null;
        setError(t("composer.threadGoal.editSaveError"));
        return;
      }
      setSavedGoal((current) => current.objective === objective
        ? current
        : { ...current, objective, updatedAt: Date.now() });
      setDraft(objective);
      setNow(Date.now());
    } catch {
      if (pendingSaveRef.current === pendingSave) pendingSaveRef.current = null;
      setError(t("composer.threadGoal.editSaveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-label={t("composer.threadGoal.editDialog.title")}>
      <textarea
        className={styles.editor}
        value={draft}
        rows={12}
        aria-label={t("composer.threadGoal.editDialog.ariaLabel")}
        disabled={busy}
        onChange={(event) => { setDraft(event.target.value); setError(null); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
      />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <footer className={styles.footer}>
        <span className={styles.saved}>{updatedLabel(savedGoal.updatedAt, now, t)}</span>
        <div className={styles.actions}>
          <Button type="button" tone="ghost" size="sm" disabled={!changed || busy} onClick={() => setDraft(savedGoal.objective)}>
            <RotateCcw size={14} aria-hidden="true" />
            {t("composer.threadGoal.editor.revert")}
          </Button>
          <Button type="button" tone="primary" size="sm" loading={busy} disabled={!changed || !draft.trim()} onClick={() => { void save(); }}>
            {t("composer.threadGoal.editDialog.save")}
          </Button>
        </div>
      </footer>
    </section>
  );
}
