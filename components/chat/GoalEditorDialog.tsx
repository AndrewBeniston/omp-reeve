"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./goal-editor-dialog.module.css";

interface GoalEditorDialogProps {
  goal: Goal;
  onSave: (objective: string, tokenBudget: number | null) => Promise<boolean>;
  onClose: () => void;
  error?: string | null;
}

export function GoalEditorDialog({ goal, onSave, onClose, error }: GoalEditorDialogProps) {
  const { t } = useI18n();
  const [objective, setObjective] = useState(goal.objective);
  const [budget, setBudget] = useState(goal.tokenBudget === undefined ? "" : String(goal.tokenBudget));
  const [off, setOff] = useState(goal.tokenBudget === undefined);
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);
  const offRef = useRef<HTMLInputElement>(null);

  const trimmedObjective = objective.trim();
  const changed = trimmedObjective !== goal.objective
    || (off ? goal.tokenBudget !== undefined : goal.tokenBudget !== (budget.trim() ? Number(budget.trim()) : undefined));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busyRef.current) return;
    if (!trimmedObjective) {
      setInputError(t("composer.goal.objectiveRequired"));
      objectiveRef.current?.focus();
      return;
    }
    if (!off && (!/^[1-9]\d*$/.test(budget.trim()) || !Number.isSafeInteger(Number(budget.trim())))) {
      setInputError(t("composer.goal.invalidBudget"));
      budgetRef.current?.focus();
      return;
    }
    setInputError(null);
    setSubmitError(null);
    setAttempted(true);
    busyRef.current = true;
    setBusy(true);
    try {
      if (await onSave(trimmedObjective, off ? null : Number(budget.trim()))) onClose();
      else setSubmitError(error ?? t("composer.threadGoal.editSaveError"));
    } catch {
      setSubmitError(t("composer.threadGoal.editSaveError"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t("composer.threadGoal.editDialog.title")}
      initialFocus={objectiveRef}
      dismissible={!busy}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      className={styles.dialog}
    >
      <form onSubmit={(event) => { void submit(event); }}>
        <label className={styles.label} htmlFor="goal-objective-edit">{t("composer.goal.objective")}</label>
        <textarea
          ref={objectiveRef}
          id="goal-objective-edit"
          className={styles.objective}
          value={objective}
          rows={12}
          required
          disabled={busy}
          aria-label={t("composer.threadGoal.editDialog.ariaLabel")}
          aria-invalid={Boolean(inputError && !trimmedObjective)}
          onChange={(event) => { setObjective(event.target.value); setInputError(null); }}
        />
        <label className={styles.label} htmlFor="goal-budget-edit">{t("composer.goal.tokenBudget")}</label>
        <input
          ref={budgetRef}
          id="goal-budget-edit"
          className={styles.budget}
          type="text"
          inputMode="numeric"
          value={budget}
          disabled={busy || off}
          aria-invalid={Boolean(inputError && trimmedObjective)}
          onChange={(event) => { setBudget(event.target.value); setInputError(null); }}
        />
        <label className={styles.off} htmlFor="goal-budget-edit-off">
          <input
            ref={offRef}
            id="goal-budget-edit-off"
            type="checkbox"
            checked={off}
            disabled={busy}
            onChange={(event) => { setOff(event.target.checked); setInputError(null); }}
          />
          {t("composer.threadGoal.budgetDialog.off")}
        </label>
        <p className={styles.help}>{t("composer.goal.budgetHelp")}</p>
        {inputError && <p className={styles.error} role="alert">{inputError}</p>}
        {(submitError || (attempted && error)) && <p className={styles.error} role="alert">{submitError || `${t("composer.threadGoal.editSaveError")}: ${error}`}</p>}
        <div className={styles.actions}>
          <Button type="button" disabled={busy} onClick={onClose}>{t("composer.threadGoal.editDialog.cancel")}</Button>
          <Button type="submit" tone="primary" loading={busy} disabled={!changed}>{t("composer.threadGoal.editDialog.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
