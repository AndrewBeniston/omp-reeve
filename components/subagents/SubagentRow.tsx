"use client";

import type { SubagentSnapshot } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import {
  formatSubagentDuration,
  getSubagentStatus,
  subagentActivity,
  subagentTitle,
} from "./subagent-helpers";
import { SubagentStatusGlyph } from "./SubagentStatusGlyph";
import styles from "./subagent-panel.module.css";

export function SubagentRow({
  subagent,
  selected,
  onSelect,
}: {
  subagent: SubagentSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const progress = subagent.progress;
  const status = getSubagentStatus(subagent);
  const activity = subagentActivity(subagent, t);
  return (
    <button
      type="button"
      role="listitem"
      onClick={onSelect}
      title={subagentTitle(subagent, subagent.id)}
      className={styles.subagentRow}
      data-selected={selected}
      data-status={status}
    >
      <span className={styles.rowGlyphSlot}><SubagentStatusGlyph subagent={subagent} /></span>
      <span className={styles.rowIdentity}>
        <span className={styles.rowId}>{subagent.id}</span>
        <span className={`${styles.agentBadge} ${styles.rowAgentBadge}`}>{subagent.agent}</span>
      </span>
      <span className={styles.rowDuration}>{formatSubagentDuration(progress?.durationMs)}</span>
      <span className={styles.rowActivity} data-status={status}>{activity}</span>
      <svg className={styles.rowChevron} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 2 7 5 3 8" />
      </svg>
    </button>
  );
}
