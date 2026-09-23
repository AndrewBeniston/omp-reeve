"use client";

import type { CSSProperties } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { SubagentSnapshot } from "@/lib/types";
import styles from "./subagent-activity-row.module.css";

type RowState = "active" | "updated" | "interrupted" | "completed";

function rowState(subagent: SubagentSnapshot): RowState {
  if ((subagent.status as string) === "aborted" || (subagent.status as string) === "cancelled") return "interrupted";
  if (subagent.status === "completed") return "completed";
  if (subagent.status === "failed") return "completed";
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

function avatarStyle(id: string): CSSProperties {
  return { "--subagent-avatar-hue": String(hashText(id) % 360) } as CSSProperties;
}

function initial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
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
      <span className={styles.avatar} data-avatar-seed={subagent.id} style={avatarStyle(subagent.id)} aria-hidden="true">{initial(name)}</span>
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
