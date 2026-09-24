"use client";

import { useI18n } from "@/hooks/useI18n";
import type { SubagentSnapshot } from "@/lib/types";
import { composeSubagentSummaryParts, type SubagentGroupState, type SubagentSummaryPart, type SubagentSummaryRow } from "@/lib/transcript/subagent-group-summary";
import styles from "./subagent-activity-row.module.css";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";

type RowState = "active" | "updated" | "interrupted" | "completed";

function rowState(subagent: SubagentSnapshot): RowState {
  if ((subagent.status as string) === "aborted" || (subagent.status as string) === "cancelled") return "interrupted";
  if (subagent.status === "completed") return "completed";
  if (subagent.status === "failed") return "completed";
  if (subagent.progress) return "updated";
  return "active";
}

function groupState(subagent: SubagentSnapshot): SubagentGroupState {
  if ((subagent.status as string) === "aborted" || (subagent.status as string) === "cancelled") return "interrupted";
  if (subagent.status === "failed") return "failed";
  if (subagent.status === "completed" || (subagent.status as string) === "done") return "completed";
  if (subagent.progress) return "updated";
  return "active";
}

function displayName(subagent: SubagentSnapshot, fallback: string): string {
  const name = subagent.agent.trim();
  return name && name !== subagent.id ? name : fallback;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function initial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

function summaryRow(subagent: SubagentSnapshot, fallbackName: string): SubagentSummaryRow {
  return { id: subagent.id, name: displayName(subagent, fallbackName), state: groupState(subagent), parentToolCallId: subagent.parentToolCallId };
}

function SummaryName({ part, onOpen }: { part: SubagentSummaryPart; onOpen?: (id: string) => void }) {
  if (part.type !== "name" || !part.id || !onOpen) return <span>{part.text}</span>;
  return <button type="button" data-subagent-summary-name onClick={() => onOpen(part.id ?? "")}>{part.text}</button>;
}

/** Render the grouped sentence for sub-agents that share an activity anchor. */
export function SubagentGroupSummary({ subagents, fallbackName, onOpen, onOpenAll }: {
  subagents: readonly SubagentSnapshot[];
  fallbackName: string;
  onOpen?: (id: string) => void;
  onOpenAll?: () => void;
}) {
  const { locale, t } = useI18n();
  const rows = subagents.map((subagent) => summaryRow(subagent, fallbackName));
  const summary = composeSubagentSummaryParts(rows, locale, t, onOpen);
  return (
    <div className={styles.group} data-subagent-summary aria-live="polite">
      <span className={styles.avatars} aria-hidden="true">
        {subagents.slice(0, 4).map((subagent) => <span key={subagent.id} className={styles.avatar} data-avatar-seed={subagent.id}><DynamicStyleVars variables={{ "--subagent-avatar-hue": hashText(subagent.id) % 360 }}>{initial(displayName(subagent, fallbackName))}</DynamicStyleVars></span>)}
      </span>
      <span className={styles.summary} data-subagent-summary-sentence>
        {summary.parts.map((part, index) => {
          if (part.type === "name") return <SummaryName key={`${part.type}-${part.id ?? part.text}-${index}`} part={part} onOpen={onOpen} />;
          if (part.type === "more" && onOpenAll) return <button key={`${part.type}-${index}`} type="button" data-subagent-summary-more onClick={onOpenAll}>{part.text}</button>;
          return <span key={`${part.type}-${index}`}>{part.text}</span>;
        })}
        <span> {summary.statusText}</span>
      </span>
    </div>
  );
}

export function visibleSubagentRows(
  subagents: readonly SubagentSnapshot[],
  parentToolCallId: string,
  fallbackName: string,
): Array<{ snapshot: SubagentSnapshot; name: string }> {
  return subagents.flatMap((snapshot) => {
    if (snapshot.parentToolCallId !== parentToolCallId) return [];
    const rawName = snapshot.agent.trim();
    if (rawName === snapshot.id) return [];
    const name = displayName(snapshot, fallbackName);
    return [{ snapshot, name }];
  });
}

export function SubagentActivityRow({ subagent, displayName: name, onOpen }: {
  subagent: SubagentSnapshot;
  displayName: string;
  onOpen?: (id: string) => void;
}) {
  const { t } = useI18n();
  const state = rowState(subagent);
  const openable = Boolean(subagent.sessionFile) || state === "active";
  const label = t(`transcript.activity.subAgent.activity.${state}`, { displayName: name });
  const content = (
    <>
      <span className={styles.avatar} data-avatar-seed={subagent.id} aria-hidden="true"><DynamicStyleVars variables={{ "--subagent-avatar-hue": hashText(subagent.id) % 360 }}>{initial(name)}</DynamicStyleVars></span>
      <span className={styles.label}>{label}</span>
    </>
  );
  if (!openable) return <div className={styles.row} data-subagent-activity data-state={state}>{content}</div>;
  return (
    <button
      type="button"
      className={styles.row}
      data-subagent-activity
      data-state={state}
      aria-label={t("transcript.activity.subAgent.open", { displayName: name })}
      onClick={() => onOpen?.(subagent.id)}
    >
      {content}
    </button>
  );
}
