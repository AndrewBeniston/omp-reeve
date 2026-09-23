"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./MarkdownMedia.module.css";

type MarkdownImageProps = {
  src?: string;
  alt?: string;
  imageProps?: Omit<ComponentProps<"img">, "src" | "alt" | "onLoad" | "onError">;
};

type MarkdownVideoProps = {
  src?: string;
  alt?: string;
  children?: ReactNode;
  videoProps?: Omit<ComponentProps<"video">, "src" | "children" | "onError" | "aria-label">;
};

export function MarkdownMedia({ src, alt, imageProps }: MarkdownImageProps) {
  const { t } = useI18n();
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const altText = alt?.trim() ? alt : undefined;
  const ariaLabel = altText ?? t(state === "loading" ? "markdown.imageLoading" : "markdown.imagePreviewButton");

  if (state === "failed") {
    return (
      <span className={styles.fallback} role="img" aria-label={altText ?? t("markdown.imageUnavailable")}>
        {t("markdown.imageUnavailable")}
      </span>
    );
  }

  const imageClassName = [styles.image, imageProps?.className, state === "loading" ? styles.loadingImage : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={styles.imageButton}
      aria-label={ariaLabel}
      aria-busy={state === "loading" ? true : undefined}
      disabled={state === "loading"}
      onClick={() => {
        if (src) window.open(src, "_blank", "noopener,noreferrer");
      }}
    >
      {state === "loading" && (
        <span className={styles.loadingLabel} aria-hidden="true">
          {t("markdown.imageLoading")}
        </span>
      )}
      <img
        {...imageProps}
        src={src}
        alt={altText ?? ""}
        loading="lazy"
        className={imageClassName}
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </button>
  );
}

export function MarkdownVideoMedia({ src, alt, children, videoProps }: MarkdownVideoProps) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const altText = alt?.trim() ? alt : undefined;

  if (failed) {
    return (
      <span className={styles.fallback} role="img" aria-label={altText ?? t("markdown.videoUnavailable")}>
        {t("markdown.videoUnavailable")}
      </span>
    );
  }

  return (
    <video
      {...videoProps}
      src={src}
      className={[styles.video, videoProps?.className].filter(Boolean).join(" ")}
      aria-label={altText ?? t("markdown.videoPlayer")}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
    >
      {children}
    </video>
  );
}
