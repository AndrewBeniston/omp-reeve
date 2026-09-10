"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { formatCompactSidebarTime } from "@/lib/sidebar-time";
import { DynamicStyleVars } from "@/components/ui/DynamicStyleVars";
import { ProjectFolderIcon } from "./CodexIcons";
import styles from "./navigation.module.css";

export function RichHoverCard({
  open,
  anchor,
  width,
  className,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  width: number;
  className: string;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const rightPosition = rect.right + 2;
      setPosition({
        left: rightPosition + width <= window.innerWidth - 8
          ? rightPosition
          : Math.max(8, rect.left - width - 2),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 260)),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, open, width]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <DynamicStyleVars
      className={`${styles.richHoverCard} ${className}`}
      variables={{
        "--ui-hover-card-left": `${position.left}px`,
        "--ui-hover-card-top": `${position.top}px`,
      }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </DynamicStyleVars>,
    document.body,
  );
}

function HoverCardRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.hoverCardRow}>
      <span className={styles.hoverCardIcon}>{icon}</span>
      <span className={styles.hoverCardRowText}>{children}</span>
    </div>
  );
}

function HoverCardPath({ children }: { children: string }) {
  return (
    <span className={styles.pathLabel}>
      <span className={styles.pathLabelText}>{children}</span>
    </span>
  );
}

export function ProjectHoverCard({
  projectName,
  taskCount,
  repositoryLabel,
  projectPath,
  onEdit,
}: {
  projectName: string;
  taskCount: number;
  repositoryLabel?: string;
  projectPath: string;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <HoverCardRow icon={<ProjectFolderIcon open />}>
        <strong className={styles.hoverCardTitle}>{projectName}</strong>
      </HoverCardRow>
      <HoverCardRow icon={<MessageIcon />}>
        {taskCount === 1 ? t("sidebar.oneTask") : t("sidebar.taskCount", { count: taskCount })}
      </HoverCardRow>
      <div className={styles.hoverCardDivider} />
      {repositoryLabel && <HoverCardRow icon={<RepositoryIcon />}>{repositoryLabel}</HoverCardRow>}
      <HoverCardRow icon={<ProjectFolderIcon open={false} />}>
        <HoverCardPath>{projectPath}</HoverCardPath>
      </HoverCardRow>
      <div className={styles.hoverCardDivider} />
      <button type="button" className={styles.hoverCardAction} onClick={onEdit}>
        <SettingsIcon />
        <span>{t("sidebar.editProject")}</span>
      </button>
    </>
  );
}

export function SessionHoverCard({
  title,
  modified,
  projectName,
  repositoryLabel,
  cwd,
  gitBranch,
  isWorktree,
  unread,
}: {
  title: string;
  modified: string;
  projectName: string;
  repositoryLabel?: string;
  cwd: string;
  gitBranch?: string;
  isWorktree?: boolean;
  unread?: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <>
      <div className={styles.sessionHoverCardHeading}>
        <strong className={styles.sessionHoverCardTitle}>{title}</strong>
        <span className={styles.hoverCardTime}>
          {formatCompactSidebarTime(modified, locale)}
          {unread && <span className={styles.hoverCardUnreadDot} aria-hidden="true" />}
        </span>
      </div>
      <HoverCardRow icon={<ProjectFolderIcon open={false} />}>{projectName}</HoverCardRow>
      {repositoryLabel && <HoverCardRow icon={<RepositoryIcon />}>{repositoryLabel}</HoverCardRow>}
      <HoverCardRow icon={<ProjectFolderIcon open={false} />}>
        <HoverCardPath>{cwd}</HoverCardPath>
      </HoverCardRow>
      {gitBranch && <HoverCardRow icon={<BranchIcon />}>{gitBranch}</HoverCardRow>}
      {isWorktree && <HoverCardRow icon={<WorktreeIcon />}>{t("sidebar.gitWorktree")}</HoverCardRow>}
    </>
  );
}

function MessageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></svg>;
}

function RepositoryIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="4" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="20" r="2" /><path d="M6 6v12M8 6h4a6 6 0 0 1 6 6v-4" /></svg>;
}

function BranchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 7h4a6 6 0 0 1 6 6V8" /></svg>;
}

function WorktreeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4v10a4 4 0 0 0 4 4h10" /><circle cx="5" cy="4" r="2" /><circle cx="19" cy="18" r="2" /><path d="m13 8 3-3 3 3M16 5v7" /></svg>;
}

function SettingsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
}
