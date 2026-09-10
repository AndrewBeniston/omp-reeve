"use client";

import { useId, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { getFileName } from "@/lib/file-paths";
import { extractTurnWrittenFiles } from "@/lib/turn-written-files";
import type { AssistantContentBlock, ToolResultMessage } from "@/lib/types";
import { getTodoPhases, type TodoTask } from "./TodoPlan";
import { classifyTool, getDiffStats, getResultDiff } from "./tool-presentation";
import styles from "./composer-turn-status.module.css";

interface ChangedFileSummary {
  filePath: string;
  added: number;
  removed: number;
}

export interface ActiveTurnStatus {
  tasks: TodoTask[];
  stepNumber: number;
  stepCount: number;
  completedCount: number;
  changes: ChangedFileSummary[];
}

export function getActiveTurnStatus(
  blocks: AssistantContentBlock[],
  toolResults?: Map<string, ToolResultMessage>,
  cwd?: string,
): ActiveTurnStatus | null {
  let tasks: TodoTask[] = [];
  const changes = new Map<string, ChangedFileSummary>();

  for (const block of blocks) {
    if (block.type !== "toolCall") continue;
    const classification = classifyTool(block.toolName);

    if (classification.isTodo) {
      const phases = getTodoPhases(block, toolResults?.get(block.toolCallId));
      if (phases) tasks = phases.flatMap((phase) => phase.tasks);
      continue;
    }

    const result = toolResults?.get(block.toolCallId);
    if (!result || result.isError) continue;
    const [writtenFile] = extractTurnWrittenFiles([block], toolResults, cwd);
    if (!writtenFile) continue;
    const diff = getResultDiff(result);
    const stats = diff ? getDiffStats(diff.text) : { added: 0, removed: 0 };
    const current = changes.get(writtenFile.filePath);
    changes.set(writtenFile.filePath, {
      filePath: writtenFile.filePath,
      added: (current?.added ?? 0) + stats.added,
      removed: (current?.removed ?? 0) + stats.removed,
    });
  }

  if (tasks.length === 0 && changes.size === 0) return null;

  const activeIndex = tasks.findIndex((task) => task.status === "in_progress");
  const unfinishedIndex = tasks.findIndex((task) => task.status !== "completed" && task.status !== "abandoned");
  const stepIndex = activeIndex >= 0 ? activeIndex : unfinishedIndex >= 0 ? unfinishedIndex : Math.max(0, tasks.length - 1);

  return {
    tasks,
    stepNumber: tasks.length > 0 ? stepIndex + 1 : 0,
    stepCount: tasks.length,
    completedCount: tasks.filter((task) => task.status === "completed").length,
    changes: [...changes.values()],
  };
}

export function ComposerTurnStatus({
  blocks,
  toolResults,
  cwd,
  onOpenFile,
}: {
  blocks: AssistantContentBlock[];
  toolResults?: Map<string, ToolResultMessage>;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}) {
  const status = getActiveTurnStatus(blocks, toolResults, cwd);
  if (!status) return null;

  const hasSteps = status.stepCount > 0;
  const hasChanges = status.changes.length > 0;

  return (
    <div className={styles.statusRow} data-composer-turn-status="true">
      <div className={styles.statusPill}>
        {hasSteps && <StepsStatus status={status} />}
        {hasSteps && hasChanges && <span aria-hidden="true" className={styles.separator}>·</span>}
        {hasChanges && (
          <ChangesStatus changes={status.changes} onOpenFile={onOpenFile} />
        )}
      </div>
    </div>
  );
}

function StepsStatus({ status }: { status: ActiveTurnStatus }) {
  const { t } = useI18n();
  const tooltipId = useId();
  const percent = status.stepCount === 0 ? 0 : (status.completedCount / status.stepCount) * 100;

  return (
    <span className={styles.tooltipTrigger}>
      <span
        aria-describedby={tooltipId}
        className={styles.stepsSummary}
        role="button"
        tabIndex={0}
      >
        <ProgressDonut percent={percent} />
        <span className={styles.stepCount}>
          {t("chat.stepProgress", { current: status.stepNumber, total: status.stepCount })}
        </span>
      </span>
      <RichTooltip id={tooltipId}>
        <div className={styles.stepsList} role="list" aria-label={t("chat.steps")}>
          {status.tasks.map((task, index) => (
            <div
              className={styles.stepRow}
              data-step-status={task.status}
              key={`${task.content}-${index}`}
              role="listitem"
            >
              <StepMarker status={task.status} />
              <span>
                {task.content}
                {task.status === "blocked" && task.blocker ? (
                  <span className={styles.blocker}> ({task.blocker})</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </RichTooltip>
    </span>
  );
}

function ChangesStatus({
  changes,
  onOpenFile,
}: {
  changes: ChangedFileSummary[];
  onOpenFile?: (filePath: string) => void;
}) {
  const { t } = useI18n();
  const tooltipId = useId();
  const added = changes.reduce((total, file) => total + file.added, 0);
  const removed = changes.reduce((total, file) => total + file.removed, 0);
  const openFirstFile = onOpenFile ? () => onOpenFile(changes[0].filePath) : undefined;

  return (
    <span className={styles.tooltipTrigger}>
      <button
        aria-describedby={tooltipId}
        className={styles.changesSummary}
        disabled={!openFirstFile}
        onClick={openFirstFile}
        type="button"
      >
        <span className={styles.changedFilesLabel}>
          {t(changes.length === 1 ? "chat.fileChanged" : "chat.filesChanged", { count: changes.length })}
        </span>
        <DiffStats added={added} removed={removed} />
      </button>
      <RichTooltip className={styles.changesTooltip} id={tooltipId}>
        <div className={styles.changeList} role="list" aria-label={t("chat.filesWritten")}>
          {changes.map((file) => {
            const content = (
              <>
                <span className={styles.changedFileName}>{getFileName(file.filePath)}</span>
                <DiffStats added={file.added} removed={file.removed} />
              </>
            );
            return onOpenFile ? (
              <button
                className={styles.changeRow}
                key={file.filePath}
                onClick={() => onOpenFile(file.filePath)}
                role="listitem"
                type="button"
              >
                {content}
              </button>
            ) : (
              <div className={styles.changeRow} key={file.filePath} role="listitem">
                {content}
              </div>
            );
          })}
        </div>
      </RichTooltip>
    </span>
  );
}

function RichTooltip({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <span className={`${styles.tooltip} ${className}`} id={id} role="tooltip">
      {children}
    </span>
  );
}

function ProgressDonut({ percent }: { percent: number }) {
  return (
    <svg aria-hidden="true" className={styles.progressDonut} viewBox="0 0 16 16">
      <circle className={styles.progressTrack} cx="8" cy="8" fill="none" pathLength="100" r="5.25" />
      <circle
        className={styles.progressValue}
        cx="8"
        cy="8"
        fill="none"
        pathLength="100"
        r="5.25"
        strokeDasharray={`${percent} 100`}
      />
    </svg>
  );
}

function DiffStats({ added, removed }: { added: number; removed: number }) {
  return (
    <span className={styles.diffStats}>
      <span className={styles.added}>+{added}</span>
      <span className={styles.removed}>−{removed}</span>
    </span>
  );
}

function StepMarker({ status }: { status: TodoTask["status"] }) {
  if (status === "in_progress") {
    return <span aria-hidden="true" className={`${styles.stepMarker} ${styles.stepSpinner}`} />;
  }

  const label = status === "completed" ? "✓" : status === "abandoned" ? "×" : status === "blocked" ? "!" : "";
  return <span aria-hidden="true" className={styles.stepMarker} data-status={status}>{label}</span>;
}
