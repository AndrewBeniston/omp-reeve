"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatDuration } from "@/lib/transcript/duration-format";
import { getTurnElapsedMs, shouldTickTurnClock, TURN_CLOCK_INTERVAL_MS, type TurnClock } from "@/lib/transcript/turn-folder";
import styles from "./divider.module.css";

interface DividerProps extends TurnClock {
  turnId: string;
  previousMessageCount: number;
  deniedActionCount?: number;
  forceExpanded?: boolean;
  now?: number;
  children: ReactNode;
}

const storageKey = (turnId: string) => `omp-transcript-turn-open:${turnId}`;

function readStoredChoice(turnId: string): boolean | undefined {
  try {
    const value = globalThis.localStorage?.getItem(storageKey(turnId));
    if (value === "true") return true;
    if (value === "false") return false;
  } catch { /* Storage can be unavailable. */ }
  return undefined;
}

function writeStoredChoice(turnId: string, expanded: boolean): void {
  try { globalThis.localStorage?.setItem(storageKey(turnId), String(expanded)); } catch { /* The disclosure still works. */ }
}

export function Divider({ turnId, status, startedAt, completedAt, previousMessageCount, deniedActionCount = 0, forceExpanded = false, now: suppliedNow, children }: DividerProps) {
  const { locale, t } = useI18n();
  const [expandedPreference, setExpandedPreference] = useState<boolean | undefined>(() => readStoredChoice(turnId));
  const [now, setNow] = useState(() => suppliedNow ?? Date.now());
  const expanded = forceExpanded || (expandedPreference ?? false);
  const clock = { status, startedAt, completedAt };

  useEffect(() => {
    if (suppliedNow !== undefined || !shouldTickTurnClock(clock)) return;
    const interval = globalThis.setInterval(() => setNow(Date.now()), TURN_CLOCK_INTERVAL_MS);
    return () => globalThis.clearInterval(interval);
  }, [suppliedNow, status, completedAt]);

  useEffect(() => { setExpandedPreference(readStoredChoice(turnId)); }, [turnId]);

  const elapsed = getTurnElapsedMs(clock, suppliedNow ?? now);
  const duration = formatDuration(elapsed, locale);
  const label = status === "working"
    ? elapsed < TURN_CLOCK_INTERVAL_MS ? t("transcript.divider.working") : t("transcript.divider.workingFor", { time: duration })
    : status === "stopped"
      ? t("transcript.divider.userStoppedAfter", { time: duration })
      : startedAt !== undefined && completedAt !== undefined
        ? t("transcript.divider.workedFor", { time: duration })
        : t(previousMessageCount === 1 ? "transcript.divider.previousMessage.one" : "transcript.divider.previousMessage.other", { count: previousMessageCount });
  const deniedLabel = deniedActionCount > 0
    ? t(deniedActionCount === 1 ? "transcript.divider.deniedAction.one" : "transcript.divider.deniedAction.other", { count: deniedActionCount })
    : undefined;
  const toggle = () => {
    if (forceExpanded) return;
    const next = !expanded;
    setExpandedPreference(next);
    writeStoredChoice(turnId, next);
  };

  return <div className={styles.divider} data-transcript-divider>
    <button type="button" className={styles.trigger} aria-expanded={expanded} onClick={toggle} title={deniedLabel ? t("transcript.divider.deniedActionTooltip", { count: deniedActionCount }) : undefined}>
      <span className={styles.label}>{label}</span>
      <ChevronRight className={styles.chevron} data-expanded={expanded} aria-hidden="true" />
      {deniedLabel ? <span className={styles.denied}>{deniedLabel}</span> : null}
    </button>
    {expanded ? <div className={styles.content}>{children}</div> : null}
  </div>;
}
