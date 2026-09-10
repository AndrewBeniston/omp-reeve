"use client";

import { useEffect, useState } from "react";
import type { SubagentSnapshot } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import {
  formatSubagentDuration,
  getSubagentStatus,
  isSubagentActive,
  subagentActivity,
  subagentTitle,
  type SubagentSemanticStatus,
} from "./subagents/subagent-helpers";
import { SubagentDetail } from "./subagents/SubagentDetail";
import { SubagentRow } from "./subagents/SubagentRow";
import styles from "./subagents/subagent-panel.module.css";

export {
  formatSubagentDuration,
  getSubagentStatus,
  isSubagentActive,
  subagentActivity,
  subagentTitle,
  type SubagentSemanticStatus,
};

export function SubagentPanel({
  sessionId,
  cwd,
  subagents,
}: {
  sessionId: string | null;
  cwd?: string;
  subagents: SubagentSnapshot[];
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const running = subagents.filter(isSubagentActive);
  const finished = subagents.filter((subagent) => !isSubagentActive(subagent));
  const selected = selectedId ? subagents.find((subagent) => subagent.id === selectedId) ?? null : null;

  useEffect(() => {
    setSelectedId(null);
    setCollapsed(false);
  }, [sessionId]);

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  if (!sessionId || subagents.length === 0) return null;

  return (
    <aside
      className={`subagent-panel ${styles.panel}`}
      aria-label={t("subagents.title")}
    >
      {selected ? (
        <SubagentDetail
          sessionId={sessionId}
          cwd={cwd}
          subagent={selected}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            aria-expanded={!collapsed}
            className={styles.collapseToggle}
          >
            <svg
              className={styles.collapseChevron}
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 2 7 5 3 8" />
            </svg>
            <span className={styles.collapseTitle}>{t("subagents.title")}</span>
            <span className={styles.collapseCounts}>
              <span className={styles.runningCount} data-active={running.length > 0}>
                {t("subagents.runningCount", { count: running.length })}
              </span>
              <span className={styles.finishedCount}>
                {t("subagents.finishedCount", { count: finished.length })}
              </span>
            </span>
          </button>

          {!collapsed && (
            <div className={styles.listContent}>
              {running.length > 0 && (
                <div role="list" aria-label={t("subagents.running")}>
                  <div className={styles.groupLabel} data-status="running">
                    {t("subagents.running")}
                  </div>
                  {running.map((subagent) => (
                    <SubagentRow
                      key={subagent.id}
                      subagent={subagent}
                      selected={false}
                      onSelect={() => setSelectedId(subagent.id)}
                    />
                  ))}
                </div>
              )}
              {finished.length > 0 && (
                <div role="list" aria-label={t("subagents.history")} className={styles.finishedGroup}>
                  <div className={styles.groupLabel} data-status="history">
                    {t("subagents.history")}
                  </div>
                  {finished.map((subagent) => (
                    <SubagentRow
                      key={subagent.id}
                      subagent={subagent}
                      selected={false}
                      onSelect={() => setSelectedId(subagent.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
