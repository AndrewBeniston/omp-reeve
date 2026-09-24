"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageContent } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { ToolIcon } from "./ToolIcon";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import styles from "./image-view.module.css";

function imageSource(image: ImageContent): string {
  if (image.source.type === "base64") {
    return `data:${image.source.media_type ?? "image/png"};base64,${image.source.data ?? ""}`;
  }
  return image.source.url ?? "";
}

export function ImageView({ images }: { images: ImageContent[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setOpenIndex(null);
    setZoom(1);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (openIndex === null) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openIndex]);

  if (images.length === 0) return null;
  const label = t("localConversation.imageView.summary", { imageCount: images.length });
  const activeImage = openIndex === null ? null : images[openIndex];

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <ToolIcon kind="image" status="success" />
        <span>{label}</span>
        <svg className={styles.marker} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>
      {expanded && (
        <div className={styles.strip} data-image-view-strip="true" aria-label={label}>
          {images.map((image, index) => {
            const source = imageSource(image);
            const isFailed = failed.has(index);
            return (
              <button
                type="button"
                className={styles.thumbnailButton}
                key={`${source}-${index}`}
                aria-label={t("localConversation.imageView.previewAlt")}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setOpenIndex(index);
                }}
              >
                {isFailed ? (
                  <span className={styles.unavailable} role="img" aria-label="Image unavailable">
                    {t("localConversation.imageView.unavailable")}
                  </span>
                ) : (
                  <img
                    src={source}
                    alt={t("localConversation.imageView.previewAlt")}
                    className={styles.thumbnail}
                    onError={() => setFailed((current) => new Set(current).add(index))}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
      {activeImage && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label={t("localConversation.imageView.previewAlt")}>
            <div className={styles.dialogHeader}>
              <span>{label}</span>
              <button ref={closeButtonRef} type="button" className={styles.dialogButton} aria-label="Close image preview" onClick={close}>Close</button>
            </div>
            <div className={styles.dialogImage}>
              {failed.has(openIndex!) ? (
                <span className={styles.unavailable} role="img" aria-label="Image unavailable">{t("localConversation.imageView.unavailable")}</span>
              ) : (
                <DynamicStyleVars className={styles.dialogImageMedia} variables={{ "--ui-image-zoom": zoom }}><img src={imageSource(activeImage)} alt={t("localConversation.imageView.previewAlt")} onError={() => setFailed((current) => new Set(current).add(openIndex!))} /></DynamicStyleVars>
              )}
            </div>
            <div className={styles.dialogControls} aria-label="Image zoom controls">
              <button type="button" className={styles.dialogButton} aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>−</button>
              <button type="button" className={styles.dialogButton} aria-label="Reset zoom" onClick={() => setZoom(1)}>100%</button>
              <button type="button" className={styles.dialogButton} aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}>+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
