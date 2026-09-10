"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openExternal } from "@/lib/open-external";
import type { SummarySource } from "@/lib/session-summary";
import type { SessionInfo, SubagentStatus } from "@/lib/types";
import type { SessionStatsInfo } from "@/lib/omp-types";
import type { GitStatusResponse } from "@/lib/git-types";
import { Disclosure } from "./ui/Disclosure";
import { Dialog } from "./ui/Dialog";
import styles from "./shell/summary-panel.module.css";

interface SummarySubagent {
  id: string;
  agent: string;
  status: SubagentStatus;
}

interface SummaryTitleAction {
  disabled: boolean;
  label: string;
  state: "idle" | "naming" | "success" | "error";
}

interface Props {
  branchContent: ReactNode;
  cwd: string | null;
  gitStatus: GitStatusResponse | null;
  onGenerateTitle: () => void;
  onOpenHistory: () => void;
  onOpenSourceFile: (path: string) => void;
  onViewAllSources: () => void;
  repositoryLabel?: string;
  session: SessionInfo | null;
  sessionStats: SessionStatsInfo | null;
  sources: SummarySource[];
  sourceInputId: string;
  subagents: SummarySubagent[];
  systemPrompt: string | null;
  titleAction: SummaryTitleAction;
}

export function SummaryPanel({
  branchContent,
  cwd,
  gitStatus,
  onGenerateTitle,
  onOpenHistory,
  onOpenSourceFile,
  onViewAllSources,
  repositoryLabel,
  session,
  sessionStats,
  sources,
  sourceInputId,
  subagents,
  systemPrompt,
  titleAction,
}: Props) {
  const { t } = useI18n();
  const number = new Intl.NumberFormat();
  const [previewSource, setPreviewSource] = useState<Extract<SummarySource, { kind: "image" }> | null>(null);
  const visibleSources = sources.slice(0, 3);

  useEffect(() => {
    setPreviewSource(null);
  }, [session?.id]);

  const openSource = (source: SummarySource) => {
    if (source.kind === "image") {
      setPreviewSource(source);
      return;
    }
    if (source.kind === "file") {
      onOpenSourceFile(source.path);
      return;
    }
    openExternal(source.url);
  };

  return (
    <>
    <aside className={styles.panel} aria-label={t("summary.title")}>
      <SummarySection title={t("summary.environment")} open>
        {gitStatus?.isGitRepository && (
          <div className={styles.row}>
            <span className={styles.rowIcon}><ChangesIcon /></span>
            <span className={styles.rowValue}>{t("summary.changes")}</span>
            <span className={styles.changeMetrics}>
              <span className={styles.changeAdditions}>+{number.format(gitStatus.additions)}</span>
              <span className={styles.changeDeletions}>-{number.format(gitStatus.deletions)}</span>
            </span>
          </div>
        )}
        {cwd && <SummaryRow icon={<ComputerIcon />} value={t("summary.local")} />}
        {session?.gitBranch && <SummaryRow icon={<BranchIcon />} value={session.gitBranch} />}
        {repositoryLabel && <SummaryRow icon={<RepositoryIcon />} value={repositoryLabel} />}
        {cwd && <SummaryRow icon={<FolderIcon />} value={cwd} />}
        {session?.isWorktree && <SummaryRow icon={<WorktreeIcon />} value={t("sidebar.gitWorktree")} />}
        {!cwd && <div className={styles.empty}>{t("summary.noEnvironment")}</div>}
      </SummarySection>

      <SummarySection title={t("summary.session")} open>
        <button type="button" className={styles.action} onClick={onOpenHistory} disabled={!session}>
          <HistoryIcon />
          <span>{t("history.full")}</span>
        </button>
        <button type="button" className={styles.action} onClick={onGenerateTitle} disabled={titleAction.disabled} data-state={titleAction.state}>
          <TitleIcon />
          <span>{titleAction.label}</span>
        </button>
      </SummarySection>

      <SummarySection title={t("i18n.branches")}>
        {branchContent}
      </SummarySection>

      <SummarySection title={t("system.label")}>
        <div className={styles.systemPrompt}>
          {systemPrompt === null ? t("system.load") : systemPrompt || t("system.empty")}
        </div>
      </SummarySection>

      {sessionStats && (
        <SummarySection title={t("summary.usage")} open>
          <SummaryMetric label={t("summary.tokens")} value={number.format(sessionStats.tokens.total)} />
          <SummaryMetric label={t("summary.messages")} value={number.format(sessionStats.totalMessages)} />
          <SummaryMetric label={t("summary.toolCalls")} value={number.format(sessionStats.toolCalls)} />
          <SummaryMetric label={t("summary.cost")} value={`$${sessionStats.cost.toFixed(2)}`} />
        </SummarySection>
      )}

      {subagents.length > 0 && (
        <SummarySection title={t("subagents.title")} open>
          {subagents.map((subagent) => (
            <SummaryRow
              key={subagent.id}
              icon={<AgentIcon status={subagent.status} />}
              value={subagent.agent}
              meta={subagentStatusLabel(subagent.status, t)}
            />
          ))}
        </SummarySection>
      )}

      {sources.length > 0 && (
        <section className={`${styles.section} ${styles.staticSection}`}>
          <div className={styles.staticSectionHeader}>
            <span>{t("summary.sources")}</span>
            <button
              type="button"
              className={styles.sectionAction}
              onClick={() => document.getElementById(sourceInputId)?.click()}
              title={t("chat.attachImage")}
              aria-label={t("chat.attachImage")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                <path d="M8 2v12M2 8h12" />
              </svg>
            </button>
          </div>
          <div className={styles.sectionBody}>
          <div className={styles.sourceList} role="list" aria-label={t("summary.sources")}>
            {visibleSources.map((source) => (
              <button
                key={source.id}
                type="button"
                role="listitem"
                className={styles.sourceRow}
                data-summary-source={source.kind}
                title={source.kind === "file" ? source.path : source.url}
                onClick={() => openSource(source)}
              >
                <span className={styles.sourceIcon}>
                  {source.kind === "image"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className={styles.sourcePreview} src={source.url} alt="" />
                    : source.kind === "file"
                      ? <SourceFileIcon />
                      : <SourceLinkIcon />}
                </span>
                <span className={styles.sourceLabel}>{source.label}</span>
              </button>
            ))}
          </div>
          {sources.length > 3 && (
            <button
              type="button"
              className={styles.viewAllSources}
              onClick={onViewAllSources}
            >
              <SourceChainIcon />
              <span>{t("summary.viewAllSources")}</span>
            </button>
          )}
          </div>
        </section>
      )}
    </aside>
    <Dialog
      open={previewSource !== null}
      title={previewSource?.label ?? t("summary.sourcePreview")}
      size="lg"
      onOpenChange={(open) => { if (!open) setPreviewSource(null); }}
    >
      {previewSource && (
        <div className={styles.sourcePreviewDialog}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSource.url} alt={previewSource.label} />
          <button type="button" className={styles.sourcePreviewClose} onClick={() => setPreviewSource(null)}>
            {t("sidebar.cancel")}
          </button>
        </div>
      )}
    </Dialog>
    </>
  );
}

function subagentStatusLabel(
  status: SubagentStatus,
  t: (key: string) => string,
): string {
  if (status === "running" || status === "pending") return t("subagents.running");
  if (status === "failed") return t("subagents.failed");
  if (status === "aborted") return t("subagents.aborted");
  return t("subagents.finished");
}

function SummarySection({ children, open = false, title }: { children: ReactNode; open?: boolean; title: string }) {
  return (
    <Disclosure className={styles.section} label={title} defaultExpanded={open}>
      <div className={styles.sectionBody}>{children}</div>
    </Disclosure>
  );
}

function SummaryRow({ icon, value, meta }: { icon: ReactNode; value: string; meta?: string }) {
  return (
    <div className={styles.row} title={value}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowValue}>{value}</span>
      {meta && <span className={styles.rowMeta}>{meta}</span>}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}

function FolderIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" /></svg>;
}

function ChangesIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
}

function ComputerIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M2 20h20" /></svg>;
}

function RepositoryIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="4" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="20" r="2" /><path d="M6 6v12M8 6h4a6 6 0 0 1 6 6V8" /></svg>;
}

function BranchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 7h4a6 6 0 0 1 6 6V8" /></svg>;
}

function WorktreeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4v10a4 4 0 0 0 4 4h10" /><circle cx="5" cy="4" r="2" /><circle cx="19" cy="18" r="2" /><path d="m13 8 3-3 3 3M16 5v7" /></svg>;
}

function HistoryIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>;
}

function TitleIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5L7 22l-5-5Z" /><path d="m14 5 5 5" /><path d="M6 4V2M5 3H3M19 19v3M17.5 20.5h3" /></svg>;
}

function AgentIcon({ status }: { status: SubagentStatus }) {
  return (
    <span className={styles.agentIcon} data-status={status} aria-hidden="true">
      <span /><span /><span /><span /><span /><span /><span /><span /><span />
    </span>
  );
}

function SourceFileIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v5h5" /></svg>;
}

function SourceLinkIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></svg>;
}

function SourceChainIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="17" r="3" /><circle cx="18" cy="7" r="3" /><path d="m8.5 15.5 7-7" /></svg>;
}
