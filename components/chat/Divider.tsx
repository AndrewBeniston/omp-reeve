"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatDuration } from "@/lib/transcript/duration-format";
import { getTurnElapsedMs, shouldTickTurnClock, TURN_CLOCK_INTERVAL_MS, type TurnClock } from "@/lib/transcript/turn-folder";
import { startExpansionScrollAnchor } from "./expansion-scroll-anchor";
import styles from "./divider.module.css";

interface DividerProps extends TurnClock {
  turnId: string;
  previousMessageCount: number;
  deniedActionCount?: number;
  turnNumber?: number;
  totalTurnCount?: number;
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

export function Divider({ turnId, status, startedAt, completedAt, previousMessageCount, deniedActionCount = 0, turnNumber, totalTurnCount, forceExpanded = false, now: suppliedNow, children }: DividerProps) {
  const { locale, t } = useI18n();
  const [expandedPreference, setExpandedPreference] = useState<boolean | undefined>(() => readStoredChoice(turnId));
  const [now, setNow] = useState(() => suppliedNow ?? Date.now());
  const dividerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const deniedRef = useRef<HTMLSpanElement>(null);
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
  const toggle = (event?: { target: EventTarget | null }) => {
    if (forceExpanded) return;
    const next = !expanded;
    const deniedClick = event?.target === deniedRef.current;
    if (next && !deniedClick && dividerRef.current && triggerRef.current) {
      startExpansionScrollAnchor(triggerRef.current, dividerRef.current);
    }
    if (next && turnNumber !== undefined && totalTurnCount !== undefined && turnNumber < totalTurnCount) {
      globalThis.dispatchEvent?.(new CustomEvent("reeve:product-event", {
        detail: { name: "transcript_turn_expanded", turnNumber, totalTurnCount },
      }));
    }
    setExpandedPreference(next);
    writeStoredChoice(turnId, next);
  };

  return <div ref={dividerRef} className={styles.divider} data-transcript-divider>
    <button ref={triggerRef} type="button" className={styles.trigger} aria-expanded={expanded} onClick={toggle} title={deniedLabel ? t(deniedActionCount === 1 ? "transcript.divider.deniedActionTooltip.one" : "transcript.divider.deniedActionTooltip.other", { count: deniedActionCount }) : undefined}>
      <span className={styles.label}>{label}</span>
      <ChevronRight className={styles.chevron} data-expanded={expanded} aria-hidden="true" />
      {deniedLabel ? <span ref={deniedRef} className={styles.denied}>{deniedLabel}</span> : null}
    </button>
    {expanded ? <div className={styles.content}>{children}</div> : null}
  </div>;
}
