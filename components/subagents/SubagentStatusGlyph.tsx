"use client";

import type { SubagentSnapshot } from "@/lib/types";
import { getSubagentStatus, isSubagentActive } from "./subagent-helpers";
import styles from "./subagent-panel.module.css";

export function SubagentStatusGlyph({ subagent }: { subagent: SubagentSnapshot }) {
  const status = getSubagentStatus(subagent);
  if (isSubagentActive(subagent)) {
    return (
      <svg className={styles.statusGlyph} data-status={status} width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.8" strokeDasharray="22 13" />
      </svg>
    );
  }
  return <span className={styles.statusDot} data-status={status} aria-hidden="true" />;
}
