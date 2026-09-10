import type { HTMLAttributes, ReactNode } from "react";
import { getPanelWidthCssValue, SIDEBAR_DEFAULT_WIDTH } from "@/lib/panel-layout";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import styles from "./shell.module.css";

type SeparatorProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  role: "separator";
};

interface ShellLayoutResize {
  isResizing: boolean;
  separatorProps: SeparatorProps;
  title: string;
  width: number;
}

interface ShellLayoutSidebar {
  content: ReactNode;
  label: string;
  mobileReady: boolean;
  onBackdropClick: () => void;
  open: boolean;
  resize: ShellLayoutResize;
}

interface ShellLayoutRightPanel {
  content: ReactNode;
  header: ReactNode;
  label: string;
  onBackdropClick: () => void;
  open: boolean;
  resize: ShellLayoutResize;
}

interface ShellLayoutProps {
  header: ReactNode;
  isMobile: boolean;
  main: ReactNode;
  rightPanel: ShellLayoutRightPanel;
  secondaryPanel?: ReactNode;
  sidebar: ShellLayoutSidebar;
  topBar?: ReactNode;
}

export function ShellLayout({
  header,
  isMobile,
  main,
  rightPanel,
  secondaryPanel,
  sidebar,
  topBar,
}: ShellLayoutProps) {
  return (
    <div className={styles.shellFrame}>
      {topBar}
      <div className={styles.shell}>
        <div
          aria-hidden="true"
          className={styles.sidebarBackdrop}
          data-open={sidebar.open}
          data-ready={sidebar.mobileReady}
          data-testid="sidebar-backdrop"
          onClick={sidebar.onBackdropClick}
        />

        <DynamicStyleVars
          variables={{
            "--ui-panel-width": getPanelWidthCssValue(
              isMobile ? SIDEBAR_DEFAULT_WIDTH : sidebar.resize.width,
            ),
          }}
          id="session-sidebar"
          className={styles.sidebarPanel}
          data-open={sidebar.open}
          data-ready={sidebar.mobileReady}
          data-resizing={sidebar.resize.isResizing}
        >
          <nav aria-label={sidebar.label} className={styles.sidebarNav}>
            {sidebar.content}
          </nav>
        </DynamicStyleVars>

        {sidebar.open && (
          <div
            {...sidebar.resize.separatorProps}
            aria-controls="session-sidebar"
            className={styles.sidebarResizeHandle}
            data-resize-handle="sidebar"
            data-resizing={sidebar.resize.isResizing}
            title={sidebar.resize.title}
          />
        )}

        <section className={styles.centerColumn}>
          {header}
          <div className={styles.contentLayout}>
            <main className={styles.mainContent}>{main}</main>
            {secondaryPanel && (
              <aside className={styles.secondaryPanel}>{secondaryPanel}</aside>
            )}
          </div>
        </section>

        <div
          aria-hidden="true"
          className={styles.rightPanelBackdrop}
          data-open={rightPanel.open}
          data-testid="right-panel-backdrop"
          onClick={rightPanel.onBackdropClick}
        />

        {rightPanel.open && (
          <div
            {...rightPanel.resize.separatorProps}
            aria-controls="file-panel"
            className={styles.rightPanelResizeHandle}
            data-resize-handle="right-panel"
            data-resizing={rightPanel.resize.isResizing}
            title={rightPanel.resize.title}
          />
        )}

        <DynamicStyleVars
          variables={{ "--ui-panel-width": getPanelWidthCssValue(rightPanel.resize.width) }}
          id="file-panel"
          className={styles.rightPanelContainer}
          data-open={rightPanel.open}
          data-resizing={rightPanel.resize.isResizing}
        >
          <aside aria-label={rightPanel.label} className={styles.rightPanelAside}>
            <div className={styles.rightPanelHeader}>{rightPanel.header}</div>
            <div className={styles.rightPanelContent}>{rightPanel.content}</div>
          </aside>
        </DynamicStyleVars>
      </div>
    </div>
  );
}
