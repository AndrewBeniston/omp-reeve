"use client";

import { IconButton } from "@/components/ui/IconButton";
import { Surface } from "@/components/ui/Surface";
import { getFileIcon } from "./FileIcons";
import { useI18n } from "@/hooks/useI18n";
import type { SummarySource } from "@/lib/session-summary";
import { NewTabLauncher } from "./tabs/NewTabLauncher";
import type { LauncherAction } from "./tabs/Launcher";
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

/**
 * A web page rendered in an Electron guest beside a Session.
 *
 * The id is stable and assigned when the Tab opens. It is deliberately not the
 * URL: the human navigates, and the agent addresses this Tab over the debugging
 * protocol, so an identity that moved with the page would break the moment a
 * link was clicked.
 */
export interface BrowserTab extends TabBase {
  kind: "browser";
  url: string;
  /** The page's own icon, as the guest reported it. */
  faviconUrl?: string;
}

/**
 * A surface in the Tab strip, of exactly one kind. A Session is never a Tab:
 * the navigation tree selects Sessions, and the Session view is not in the
 * strip. Adding a kind here is deliberately a typecheck failure everywhere the
 * new kind is unhandled — that exhaustiveness is what makes the union safe to
 * extend, so do not replace it with a runtime registry.
 */
export type Tab = FileTab | SourcesTab | BrowserTab;

/**
 * Refuse to compile when a Tab kind is unhandled.
 *
 * Call it from the default branch of any switch over a Tab. The parameter is
 * `never`, so a newly added kind that reaches it is a type error at that call
 * site rather than a surprise at runtime.
 */
export function assertNeverTab(tab: never): never {
  throw new Error(`Unhandled Tab kind: ${JSON.stringify(tab)}`);
}

/** The icon for a Tab, chosen by kind rather than by guessing from its label. */
function TabIcon({ tab }: { tab: Tab }) {
  switch (tab.kind) {
    case "sources":
      return <SourcesIcon />;
    case "browser":
      // The page's own icon when it has one, the way a browser shows it.
      if (tab.faviconUrl) {
        // Not next/image: a favicon is an arbitrary remote URL from whatever
        // page the human opened, so it cannot go through the optimiser, and it
        // is 16px, so there is nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        return <img className={styles.fileTabFavicon} src={tab.faviconUrl} alt="" aria-hidden="true" />;
      }
      return <BrowserIcon />;
    case "file":
      return getFileIcon(tab.label, 13);
  }
}

/** The tooltip for a Tab's label: its most specific identity, by kind. */
function tabTitle(tab: Tab): string {
  switch (tab.kind) {
    case "file":
      return tab.filePath;
    case "browser":
      return tab.url;
    case "sources":
      return tab.label;
  }
}

interface Props {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  /** Entries for the control at the end of the strip. Empty hides it. */
  newTabActions?: LauncherAction[];
}

export function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, newTabActions }: Props) {
  const { t } = useI18n();
  const closeLabel = t("i18n.close");

  return (
    <Surface
      className={styles.tabBar}
      /*
        * The strip shares the panel's own surface, so it reads as one piece
        * with the chat and the title bar rather than as a lighter band across
        * the top. Only the active Tab lifts above it.
        */
      tone="canvas"
      border="none"
      radius="none"
      data-component="tab-bar"
      role="tablist"
      aria-label={t("tabs.strip")}
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
              <TabIcon tab={tab} />
            </span>
            <span
              className={styles.fileTabLabel}
              title={tabTitle(tab)}
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
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <line x1="2" y1="2" x2="8" y2="8" />
                <line x1="8" y1="2" x2="2" y2="8" />
              </svg>
            </IconButton>
          </div>
        );
      })}
      {newTabActions && newTabActions.length > 0 && (
        <NewTabLauncher actions={newTabActions} />
      )}
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

function BrowserIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" />
      <path d="M2.4 8h11.2" />
      <path d="M8 2.4a8.6 8.6 0 0 1 0 11.2a8.6 8.6 0 0 1 0-11.2" />
    </svg>
  );
}
