"use client";

import { useMemo, type ReactNode } from "react";
import { Minimize2 } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { parseCompactionSummary } from "@/lib/compaction-summary";
import { MarkdownBody } from "@/components/MarkdownBody";
import styles from "./compaction-note.module.css";

export interface CompactionNoteProps {
  completed?: boolean;
  source?: "manual" | "automatic" | string;
  error?: string | null;
  summary?: string;
  readFiles?: readonly string[];
  modifiedFiles?: readonly string[];
  children?: ReactNode;
}

export function CompactionNote({
  completed = true,
  source = "automatic",
  error = null,
  summary,
  readFiles,
  modifiedFiles,
  children,
}: CompactionNoteProps) {
  const { t } = useI18n();

  const isManual = source === "manual";
  const labelKey = isManual
    ? completed
      ? "transcript.contextManuallyCompacted"
      : "transcript.contextManuallyCompacting"
    : completed
      ? "transcript.contextAutomaticallyCompacted"
      : "transcript.contextAutomaticallyCompacting";

  const label = t(labelKey);

  const parsedSummary = useMemo(() => {
    if (!summary) return null;
    return parseCompactionSummary(summary);
  }, [summary]);

  const effectiveReadFiles = readFiles ?? parsedSummary?.readFiles ?? [];
  const effectiveModifiedFiles = modifiedFiles ?? parsedSummary?.modifiedFiles ?? [];
  const bodyText = parsedSummary?.body ?? summary;

  return (
    <div
      className={styles.note}
      data-transcript-note="compaction"
      data-completed={completed ? "true" : "false"}
      data-source={isManual ? "manual" : "automatic"}
    >
      <div className={styles.labelRow}>
        <Minimize2 className={styles.icon} aria-hidden="true" />
        {completed ? (
          <span className={styles.label}>{label}</span>
        ) : (
          <span className={styles.shimmer} data-shimmer="true">
            {label}
          </span>
        )}
      </div>

      {error ? (
        <div className={styles.error} role="alert" data-state="error">
          {error}
        </div>
      ) : null}

      {children ? (
        <div className={styles.content}>{children}</div>
      ) : (bodyText || effectiveReadFiles.length > 0 || effectiveModifiedFiles.length > 0) ? (
        <div className={styles.content}>
          {bodyText ? (
            <MarkdownBody className="markdown-compaction-message">{bodyText}</MarkdownBody>
          ) : null}
          <CompactionFileMetadata
            readFiles={effectiveReadFiles}
            modifiedFiles={effectiveModifiedFiles}
          />
        </div>
      ) : null}
    </div>
  );
}

export function CompactionFileMetadata({
  readFiles,
  modifiedFiles,
}: {
  readFiles: readonly string[];
  modifiedFiles: readonly string[];
}) {
  const { t } = useI18n();
  const total = readFiles.length + modifiedFiles.length;
  if (total === 0) return null;

  const parts = [];
  if (readFiles.length > 0) parts.push(`${readFiles.length} read`);
  if (modifiedFiles.length > 0) parts.push(`${modifiedFiles.length} modified`);

  return (
    <details className="compaction-file-details">
      <summary>{t("i18n.fileContext", { details: parts.join(", ") })}</summary>
      {modifiedFiles.length > 0 && (
        <CompactionFileList title={t("i18n.modifiedFiles")} files={modifiedFiles} />
      )}
      {readFiles.length > 0 && (
        <CompactionFileList title={t("i18n.readFiles")} files={readFiles} />
      )}
    </details>
  );
}

function CompactionFileList({
  title,
  files,
}: {
  title: string;
  files: readonly string[];
}) {
  return (
    <div className="compaction-file-section">
      <div className="compaction-file-title">{title}</div>
      <ul className="compaction-file-list">
        {files.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
    </div>
  );
}

