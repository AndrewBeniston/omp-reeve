"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./UserMediaAttachments.module.css";

type MediaBlock = Record<string, unknown>;

function blocksFromContent(content: unknown): MediaBlock[] {
  return Array.isArray(content) ? content.filter((block): block is MediaBlock =>
    typeof block === "object" && block !== null,
  ) : [];
}

export function hasUserMediaAttachments(content: unknown): boolean {
  return blocksFromContent(content).some((block) => block.type === "image" || isVideoBlock(block));
}

function imageSource(block: MediaBlock): string {
  const source = block.source as MediaBlock | undefined;
  if (source?.type === "base64" && typeof source.data === "string") {
    return `data:${typeof source.media_type === "string" ? source.media_type : "image/png"};base64,${source.data}`;
  }
  if (source?.type === "url" && typeof source.url === "string") return source.url;
  if (typeof block.data === "string") {
    return `data:${typeof block.mimeType === "string" ? block.mimeType : "image/png"};base64,${block.data}`;
  }
  return "";
}

function isVideoBlock(block: MediaBlock): boolean {
  const mimeType = typeof block.mimeType === "string" ? block.mimeType : "";
  const path = typeof block.path === "string" ? block.path : "";
  return block.type === "video" || mimeType.startsWith("video/") || /\.(?:mp4|mov|webm|m4v|avi|mkv)$/i.test(path);
}

function UserImage({ block }: { block: MediaBlock }) {
  const { t } = useI18n();
  const source = imageSource(block);
  const [state, setState] = useState<"loading" | "loaded" | "failed">(source ? "loading" : "failed");
  const label = t("codex.userMessage.userImageAttachment");

  if (state === "failed") {
    return (
      <span className={styles.failed} role="img" aria-label={t("codex.userMessage.userImageAttachmentFailed")}>
        <span>{t("codex.userMessage.userImageAttachmentFailed")}</span>
        <span className={styles.shortStatus}>{t("codex.userMessage.userImageAttachmentFailedShort")}</span>
      </span>
    );
  }

  return (
    <span className={styles.imageFrame} aria-busy={state === "loading" || undefined}>
      {/* Images are user-provided bytes. They must not use the Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt={label}
        className={styles.image}
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
      {state === "loading" && (
        <span className={styles.loading} role="status" aria-label={label}>
          {label}
        </span>
      )}
    </span>
  );
}

export function UserMediaAttachments({ content }: { content: unknown }) {
  const { t } = useI18n();
  const blocks = blocksFromContent(content);
  const images = blocks.filter((block) => block.type === "image");
  const videos = blocks.filter(isVideoBlock);
  if (images.length === 0 && videos.length === 0) return null;

  return (
    <div className={styles.attachments} data-has-text={blocks.some((block) => block.type === "text")}>
      {images.map((block, index) => <UserImage key={`image-${index}`} block={block} />)}
      {videos.map((block, index) => (
        <span key={`video-${index}`} className={styles.videoMarker} role="img" aria-label={t("markdown.videoUnavailable")}>
          {t("markdown.videoUnavailable")}
        </span>
      ))}
    </div>
  );
}
