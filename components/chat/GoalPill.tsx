"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, X } from "lucide-react";
import type { Goal, GoalStatus } from "@oh-my-pi/pi-tui/tools/goal";
import { useI18n } from "@/hooks/useI18n";
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
  onClear?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onExpand?: () => void;
}

export function GoalPill({ goal, onClear, onPause, onResume, onExpand }: GoalPillProps) {
  const { locale, t } = useI18n();
  const [clock, setClock] = useState<{ key: string; now: number } | null>(null);
  const [completed, setCompleted] = useState<{ key: string; goal: Goal } | null>(null);
  const [expiredCompletionKey, setExpiredCompletionKey] = useState<string | null>(null);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockKey = goal ? `${goal.id}:${goal.updatedAt}` : null;
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
  const elapsedSeconds = visibleGoal.status === "active" && clock?.key === clockKey
    ? visibleGoal.timeUsedSeconds + Math.max(0, (clock.now - visibleGoal.updatedAt) / 1_000)
    : visibleGoal.timeUsedSeconds;
  const tokenFormatter = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
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
            title={t("composer.threadGoal.clear")}
            disabled={!onClear}
            onClick={onClear}
          >
            <X size={16} aria-hidden="true" />
          </button>
          {visibleGoal.status === "paused" ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("composer.threadGoal.resume")}
              title={t("composer.threadGoal.resume")}
              disabled={!onResume}
              onClick={onResume}
            >
              <Play size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("composer.threadGoal.pause")}
              title={t("composer.threadGoal.pause")}
              disabled={!onPause || visibleGoal.status === "complete"}
              onClick={onPause}
            >
              <Pause size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("composer.threadGoal.editDialog.title")}
            title={t("composer.threadGoal.editDialog.title")}
            disabled={!onExpand}
            onClick={onExpand}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}
