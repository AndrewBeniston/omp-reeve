"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Pencil, Play, X } from "lucide-react";
import type { Goal, GoalStatus } from "@oh-my-pi/pi-tui/tools/goal";
import { useI18n } from "@/hooks/useI18n";
import type { GoalAction } from "@/hooks/useGoalState";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { GoalBudgetDialog } from "./GoalBudgetDialog";
import styles from "./goal-pill.module.css";

const COMPLETED_GOAL_DISPLAY_MS = 3_000;

const statusKeys: Record<Exclude<GoalStatus, "dropped">, string> = {
  active: "composer.threadGoal.summary.active",
  paused: "composer.threadGoal.summary.paused",
  "budget-limited": "composer.threadGoal.summary.budgetLimited",
  complete: "composer.threadGoal.summary.complete",
};

function formatElapsed(seconds: number, locale: string): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  const formatUnit = (value: number, unit: "hour" | "minute" | "second") =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(value);
  const parts = [];
  if (hours) parts.push(formatUnit(hours, "hour"));
  if (minutes || hours) parts.push(formatUnit(minutes, "minute"));
  parts.push(formatUnit(remainder, "second"));
  return parts.join(" ");
}

interface GoalPillProps {
  goal: Goal | null;
  isRunning?: boolean;
  pendingAction?: GoalAction | null;
  actionError?: { action: GoalAction; message: string } | null;
  onClear?: () => Promise<boolean> | void;
  onPause?: () => Promise<boolean> | void;
  onResume?: () => Promise<boolean> | void;
  onEditBudget?: (tokenBudget: number | null) => Promise<boolean>;
  onExpand?: () => void;
}

export function GoalPill({ goal, isRunning = false, pendingAction, actionError, onClear, onPause, onResume, onEditBudget, onExpand }: GoalPillProps) {
  const { locale, t } = useI18n();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [confirmingResume, setConfirmingResume] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const actionInFlight = useRef(false);
  const confirmClearRef = useRef<HTMLButtonElement>(null);
  const confirmResumeRef = useRef<HTMLButtonElement>(null);
  const [clock, setClock] = useState<{ key: string; now: number } | null>(null);
  const [completed, setCompleted] = useState<{ key: string; goal: Goal } | null>(null);
  const [expiredCompletionKey, setExpiredCompletionKey] = useState<string | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockKey = goal ? `${goal.id}:${goal.updatedAt}` : null;
  const busy = Boolean(pendingAction) || localBusy;

  async function act(action: (() => Promise<boolean> | void) | undefined, kind?: "clear" | "resume") {
    if (!action || actionInFlight.current || busy) return;
    actionInFlight.current = true;
    setLocalBusy(true);
    try {
      const succeeded = await action();
      if (succeeded !== false && kind === "clear") setConfirmingClear(false);
      if (succeeded !== false && kind === "resume") setConfirmingResume(false);
    } finally {
      actionInFlight.current = false;
      setLocalBusy(false);
    }
  }

  useEffect(() => {
    if (!goal) return;
    if (completionTimer.current !== null) clearTimeout(completionTimer.current);
    completionTimer.current = null;
    if (goal.status === "complete" && clockKey) {
      setCompleted({ key: clockKey, goal });
      setExpiredCompletionKey(null);
      completionTimer.current = setTimeout(() => {
        setExpiredCompletionKey(clockKey);
        setCompleted(null);
        completionTimer.current = null;
      }, COMPLETED_GOAL_DISPLAY_MS);
    } else {
      setCompleted(null);
    }
  }, [clockKey, goal?.status]);
  useEffect(() => () => {
    if (completionTimer.current !== null) clearTimeout(completionTimer.current);
  }, []);
  useEffect(() => {
    if (!goal || goal.status !== "active" || goal.tokenBudget !== undefined || !clockKey) return;
    setClock({ key: clockKey, now: Date.now() });
    const interval = setInterval(() => setClock({ key: clockKey, now: Date.now() }), 1_000);
    return () => clearInterval(interval);
  }, [clockKey, goal?.status, goal?.tokenBudget]);
  let visibleGoal = goal;
  if (goal?.status === "dropped" || (goal?.status === "complete" && expiredCompletionKey === clockKey)) {
    visibleGoal = null;
  } else if (!goal && completed?.key !== expiredCompletionKey) {
    visibleGoal = completed?.goal ?? null;
  }
  if (!visibleGoal || visibleGoal.status === "dropped") return null;
  const showTokens = (visibleGoal.status === "active" || visibleGoal.status === "budget-limited") && visibleGoal.tokenBudget !== undefined;
  const canEditBudget = visibleGoal.status === "active" || visibleGoal.status === "paused" || visibleGoal.status === "budget-limited";
  const elapsedSeconds = visibleGoal.status === "active" && clock?.key === clockKey
    ? visibleGoal.timeUsedSeconds + Math.max(0, (clock.now - visibleGoal.updatedAt) / 1_000)
    : visibleGoal.timeUsedSeconds;
  const tokenFormatter = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const errorLabel = actionError?.action === "drop" ? t("composer.threadGoal.clearError") : t("composer.threadGoal.statusUpdateError");
  return (
    <div className={styles.row}>
      <div className={styles.pill} data-status={visibleGoal.status}>
        <span className={styles.status}>{t(statusKeys[visibleGoal.status])}</span>
        <span className={styles.objective} title={visibleGoal.objective}>{visibleGoal.objective}</span>
        <span className={styles.separator} aria-hidden="true">·</span>
        <span className={styles.metric}>
          {showTokens
            ? t("composer.threadGoal.tokenProgress", {
              used: tokenFormatter.format(visibleGoal.tokensUsed),
              budget: tokenFormatter.format(visibleGoal.tokenBudget!),
            })
            : formatElapsed(elapsedSeconds, locale)}
        </span>
        <span className={styles.controls}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("composer.threadGoal.clear")}
            title={t("composer.threadGoal.clearTooltip")}
            disabled={!goal || !onClear || busy}
            onClick={() => { if (isRunning) setConfirmingClear(true); else void act(onClear, "clear"); }}
          >
            <X size={16} aria-hidden="true" />
          </button>
          {visibleGoal.status === "paused" ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("composer.threadGoal.resume")}
              title={t("composer.threadGoal.resumeTooltip")}
              disabled={!goal || !onResume || busy}
              onClick={() => setConfirmingResume(true)}
            >
              <Play size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("composer.threadGoal.pause")}
              title={t("composer.threadGoal.pauseTooltip")}
              disabled={!goal || !onPause || visibleGoal.status === "complete" || busy}
              onClick={() => void act(onPause)}
            >
              <Pause size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("composer.threadGoal.budgetDialog.open")}
            title={t("composer.threadGoal.budgetDialog.open")}
            disabled={!goal || !onEditBudget || !canEditBudget || busy}
            onClick={() => setEditingGoalId(goal?.id ?? null)}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("composer.threadGoal.editDialog.title")}
            title={t("composer.threadGoal.editDialog.title")}
            disabled={!goal || !onExpand || busy}
            onClick={onExpand}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
      {actionError && !confirmingClear && !confirmingResume && editingGoalId !== goal?.id && <p className={styles.error} role="alert">{errorLabel}: {actionError.message}</p>}
      {editingGoalId === goal?.id && goal && canEditBudget && onEditBudget && (
        <GoalBudgetDialog
          key={goal.id}
          tokenBudget={goal.tokenBudget}
          tokensUsed={goal.tokensUsed}
          onSave={onEditBudget}
          onClose={() => setEditingGoalId(null)}
          error={actionError?.action === "budget" ? actionError.message : null}
        />
      )}
      {confirmingClear && (
        <Dialog
          open
          title={t("composer.threadGoal.clearConfirmation.title")}
          description={t("composer.threadGoal.clearConfirmation.subtitle")}
          initialFocus={confirmClearRef}
          dismissible={!busy}
          onOpenChange={(open) => { if (!open && !busy) setConfirmingClear(false); }}
        >
          {actionError && <p className={styles.error} role="alert">{errorLabel}: {actionError.message}</p>}
          <div className={styles.confirmActions}>
            <Button type="button" disabled={busy} onClick={() => setConfirmingClear(false)}>
              {t("composer.threadGoal.clearConfirmation.cancel")}
            </Button>
            <Button ref={confirmClearRef} type="button" tone="danger" loading={busy}
              data-action="confirm-clear-goal" onClick={() => void act(onClear, "clear")}>
              {t("composer.threadGoal.clearConfirmation.confirm")}
            </Button>
          </div>
        </Dialog>
      )}
      {confirmingResume && (
        <Dialog
          open
          title={t("composer.threadGoal.resumeConfirmation.title")}
          description={t("composer.threadGoal.resumeConfirmation.subtitle")}
          initialFocus={confirmResumeRef}
          dismissible={!busy}
          onOpenChange={(open) => { if (!open && !busy) setConfirmingResume(false); }}
        >
          {actionError && <p className={styles.error} role="alert">{errorLabel}: {actionError.message}</p>}
          <div className={styles.confirmActions}>
            <Button type="button" disabled={busy} onClick={() => setConfirmingResume(false)}>
              {t("composer.threadGoal.resumeConfirmation.keepPaused")}
            </Button>
            <Button ref={confirmResumeRef} type="button" tone="primary" loading={busy}
              data-action="confirm-resume-goal" onClick={() => void act(onResume, "resume")}>
              {t("composer.threadGoal.resumeConfirmation.resume")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
