"use client";

import { useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./goal-budget-dialog.module.css";

interface GoalBudgetDialogProps {
  tokenBudget: number | undefined;
  tokensUsed: number;
  onSave: (tokenBudget: number | null) => Promise<boolean>;
  onClose: () => void;
  error?: string | null;
}

export function GoalBudgetDialog({ tokenBudget, tokensUsed, onSave, onClose, error }: GoalBudgetDialogProps) {
  const { locale, t } = useI18n();
  const [value, setValue] = useState(tokenBudget === undefined ? "" : String(tokenBudget));
  const [off, setOff] = useState(tokenBudget === undefined);
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const offRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busyRef.current) return;
    const trimmed = value.trim();
    if (!off && (!/^[1-9]\d*$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed)))) {
      setInputError(t("composer.goal.invalidBudget"));
      inputRef.current?.focus();
      return;
    }
    setInputError(null);
    setSubmitError(null);
    setAttempted(true);
    busyRef.current = true;
    setBusy(true);
    try {
      if (await onSave(off ? null : Number(trimmed))) onClose();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={t("composer.threadGoal.budgetDialog.title")}
      initialFocus={tokenBudget === undefined ? offRef : inputRef}
      dismissible={!busy}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      className={styles.dialog}
    >
      <form onSubmit={(event) => { void submit(event); }}>
        <p className={styles.used}>{t("composer.threadGoal.budgetDialog.used", { used: new Intl.NumberFormat(locale).format(tokensUsed) })}</p>
        <label className={styles.label} htmlFor="goal-budget-edit">{t("composer.goal.tokenBudget")}</label>
        <input
          ref={inputRef}
          id="goal-budget-edit"
          type="text"
          inputMode="numeric"
          className={styles.input}
          value={value}
          disabled={busy || off}
          aria-invalid={Boolean(inputError)}
          onChange={(event) => { setValue(event.target.value); setInputError(null); }}
        />
        <label className={styles.off} htmlFor="goal-budget-off">
          <input
            ref={offRef}
            id="goal-budget-off"
            type="checkbox"
            checked={off}
            disabled={busy}
            onChange={(event) => { setOff(event.target.checked); setInputError(null); }}
          />
          {t("composer.threadGoal.budgetDialog.off")}
        </label>
        {inputError && <p className={styles.error} role="alert">{inputError}</p>}
        {(submitError || (attempted && error)) && <p className={styles.error} role="alert">
          {t("composer.threadGoal.budgetDialog.saveError")}: {submitError || error}
        </p>}
        <div className={styles.actions}>
          <Button type="button" disabled={busy} onClick={onClose}>{t("composer.threadGoal.budgetDialog.cancel")}</Button>
          <Button type="submit" tone="primary" loading={busy}>{t("composer.threadGoal.budgetDialog.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
