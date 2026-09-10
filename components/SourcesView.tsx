"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { openExternal } from "@/lib/open-external";
import type { SummarySource } from "@/lib/session-summary";
import { getFileIcon } from "./FileIcons";
import { Dialog } from "./ui/Dialog";
import styles from "./navigation/sources-view.module.css";

interface Props {
  onOpenFile: (path: string) => void;
  sources: SummarySource[];
}

export function SourcesView({ onOpenFile, sources }: Props) {
  const { t } = useI18n();
  const [previewSource, setPreviewSource] = useState<Extract<SummarySource, { kind: "image" }> | null>(null);

  const openSource = (source: SummarySource) => {
    if (source.kind === "image") {
      setPreviewSource(source);
      return;
    }
    if (source.kind === "file") {
      onOpenFile(source.path);
      return;
    }
    openExternal(source.url);
  };

  return (
    <>
      <div className={styles.panel} role="list" aria-label={t("summary.sources")}>
        {sources.length === 0 && <div className={styles.empty}>{t("summary.noSources")}</div>}
        {sources.map((source) => {
          const meta = source.kind === "file"
            ? source.path
            : source.url.startsWith("data:")
              ? null
              : source.url;
          return (
            <button
              key={source.id}
              type="button"
              role="listitem"
              className={styles.source}
              data-source-kind={source.kind}
              onClick={() => openSource(source)}
            >
              <span className={styles.icon}>
                {source.kind === "image"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={source.url} alt="" />
                  : source.kind === "file"
                    ? getFileIcon(source.label, 18)
                    : <LinkIcon />}
              </span>
              <span className={styles.details}>
                <span className={styles.label}>{source.label}</span>
                {meta && <span className={styles.meta}>{meta}</span>}
                <span className={styles.activity}>{t(`summary.sourceActivity.${source.activity}`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <Dialog
        open={previewSource !== null}
        title={previewSource?.label ?? t("summary.sourcePreview")}
        size="lg"
        onOpenChange={(open) => { if (!open) setPreviewSource(null); }}
      >
        {previewSource && (
          <div className={styles.previewDialog}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSource.url} alt={previewSource.label} />
            <button type="button" className={styles.previewClose} onClick={() => setPreviewSource(null)}>
              {t("sidebar.cancel")}
            </button>
          </div>
        )}
      </Dialog>
    </>
  );
}

function LinkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
