"use client";

import { useEffect, useRef, useState } from "react";
import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./goal-set-dialog.module.css";

export interface GoalAttachment {
  data: string;
  mimeType: string;
  previewUrl: string;
}

export interface GoalSetInput {
  objective: string;
  tokenBudget?: number;
  attachments?: GoalAttachment[];
}

interface GoalSetDialogProps {
  existingGoal?: Goal | null;
  initialObjective?: string;
  initialAttachments?: GoalAttachment[];
  onSubmit: (input: GoalSetInput, operation: "create" | "replace") => Promise<void>;
  onClose: () => void;
}

export function GoalSetDialog({ existingGoal, initialObjective = "", initialAttachments = [], onSubmit, onClose }: GoalSetDialogProps) {
  const { t } = useI18n();
  const [objective, setObjective] = useState(initialObjective);
  const [budget, setBudget] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState(initialAttachments);
  const busyRef = useRef(false);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function validatedInput(): GoalSetInput | null {
    const trimmed = objective.trim();
    if (!trimmed) {
      setInputError(t("composer.goal.objectiveRequired"));
      objectiveRef.current?.focus();
      return null;
    }
    if (budget.trim() && (!/^[1-9]\d*$/.test(budget.trim()) || !Number.isSafeInteger(Number(budget.trim())))) {
      setInputError(t("composer.goal.invalidBudget"));
      return null;
    }
    setInputError(null);
    return {
      objective: trimmed,
      ...(budget.trim() ? { tokenBudget: Number(budget.trim()) } : {}),
      ...(attachments.length ? { attachments } : {}),
    };
  }

  async function submit(input: GoalSetInput, operation: "create" | "replace") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      await onSubmit(input, operation);
      onClose();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "Failed to prepare goal attachments") {
        setSubmitError(t("composer.goal.attachmentPreparationFailed"));
        return;
      }
      setSubmitError(`${t("composer.threadGoal.setError")}: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const input = { objective: objective.trim(), ...(budget.trim() ? { tokenBudget: Number(budget.trim()) } : {}), ...(attachments.length ? { attachments } : {}) };
  return (
    <Dialog
      open
      title={confirming ? t("composer.threadGoal.replaceConfirmation.title") : t("composer.goal.title")}
      description={confirming ? t("composer.threadGoal.replaceConfirmation.subtitle") : undefined}
      initialFocus={objectiveRef}
      dismissible={!busy}
      onOpenChange={(open) => {
        if (open || busy) return;
        if (confirming) setConfirming(false);
        else onClose();
      }}
      className={styles.dialog}
    >
      {confirming ? (
        <div className={styles.confirmation}>
          <blockquote className={styles.preview}>{input.objective}</blockquote>
          {submitError && <p role="alert" className={styles.error}>{submitError}</p>}
          <div className={styles.actions}>
            <Button type="button" data-action="cancel-replace" disabled={busy} onClick={() => setConfirming(false)}>
              {t("composer.threadGoal.replaceConfirmation.cancel")}
            </Button>
            <Button ref={confirmRef} type="button" data-action="confirm-replace" tone="primary" loading={busy} onClick={() => void submit(input, "replace")}>
              {t("composer.threadGoal.replaceConfirmation.confirm")}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (busyRef.current) return;
          const next = validatedInput();
          if (!next) return;
          if (existingGoal && existingGoal.status !== "complete" && existingGoal.status !== "dropped") {
            setConfirming(true);
          } else {
            void submit(next, "create");
          }
        }}>
          <label className={styles.label} htmlFor="goal-objective">{t("composer.goal.objective")}</label>
          <textarea
            ref={objectiveRef}
            id="goal-objective"
            className={styles.objective}
            value={objective}
            rows={5}
            required
            disabled={busy}
            placeholder={t("composer.placeholder.goal")}
            aria-invalid={Boolean(inputError && !objective.trim())}
            onChange={(event) => { setObjective(event.target.value); setInputError(null); }}
          />
          <label className={styles.label} htmlFor="goal-budget">{t("composer.goal.tokenBudget")}</label>
          <input
            id="goal-budget"
            type="text"
            inputMode="numeric"
            className={styles.budget}
            value={budget}
            disabled={busy}
            placeholder={t("composer.goal.noLimit")}
            aria-invalid={Boolean(inputError && objective.trim())}
            onChange={(event) => { setBudget(event.target.value); setInputError(null); }}
          />
          <p className={styles.help}>{t("composer.goal.budgetHelp")}</p>
          {attachments.map((attachment, index) => (
            <div key={index} role="listitem" data-goal-attachment className={styles.attachment}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.previewUrl} alt="" />
              <button type="button" aria-label={`${t("composer.goal.removeAttachment")} ${index + 1}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ))}
          {inputError && <p role="alert" className={styles.error}>{inputError}</p>}
          {submitError && <p role="alert" className={styles.error}>{submitError}</p>}
          <div className={styles.actions}>
            <Button type="button" disabled={busy} onClick={onClose}>{t("chat.cancel")}</Button>
            <Button type="submit" tone="primary" loading={busy}>{t("composer.goal.submit")}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
