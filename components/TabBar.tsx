"use client";

import { IconButton } from "@/components/ui/IconButton";
import { Surface } from "@/components/ui/Surface";
import { getFileIcon } from "./FileIcons";
import { useI18n } from "@/hooks/useI18n";
import type { SummarySource } from "@/lib/session-summary";
import styles from "./navigation/navigation.module.css";

interface TabBase {
  id: string;
  label: string;
}

export interface FileTab extends TabBase {
  kind: "file";
  filePath: string;
  sourceSessionId?: string | null;
  initialDisplayMode?: "source" | "preview" | "diff";
}

export interface SourcesTab extends TabBase {
  kind: "sources";
  sourceSessionId: string | null;
  sources: SummarySource[];
}

export type Tab = FileTab | SourcesTab;

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: Props) {
  const { t } = useI18n();
  const closeLabel = t("i18n.close");

  return (
    <Surface
      className={styles.tabBar}
      tone="sidebar"
      border="none"
      radius="none"
      data-component="tab-bar"
      role="tablist"
      aria-label="Open files"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={styles.fileTab}
            data-tab-id={tab.id}
            data-active={isActive}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowLeft") nextIndex = index > 0 ? index - 1 : tabs.length - 1;
              else if (event.key === "ArrowRight") nextIndex = index < tabs.length - 1 ? index + 1 : 0;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = tabs.length - 1;
              if (nextIndex === null || !tabs[nextIndex]) return;
              event.preventDefault();
              onSelectTab(tabs[nextIndex].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role='tab']")[nextIndex]?.focus();
            }}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            <span className={styles.fileTabIcon}>
              {tab.kind === "sources" ? <SourcesIcon /> : getFileIcon(tab.label, 13)}
            </span>
            <span
              className={styles.fileTabLabel}
              title={tab.kind === "file" ? tab.filePath : tab.label}
            >
              {tab.label}
            </span>
            <IconButton
              className={styles.fileTabClose}
              label={`${closeLabel} ${tab.label}`}
              title={closeLabel}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </IconButton>
          </div>
        );
      })}
    </Surface>
  );
}

function SourcesIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 5.5 4.8 7.2a2.4 2.4 0 1 0 3.4 3.4l1.7-1.7" />
      <path d="m9.5 10.5 1.7-1.7a2.4 2.4 0 1 0-3.4-3.4L6.1 7.1" />
    </svg>
  );
}
