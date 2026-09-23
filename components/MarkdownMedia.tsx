"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
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

type MarkdownAudioProps = {
  src?: string;
  alt?: string;
  children?: ReactNode;
  audioProps?: Omit<ComponentProps<"audio">, "src" | "children" | "onError" | "aria-label">;
};

function formatTime(seconds: number): string {
  const roundedSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(roundedSeconds / 60);
  return `${minutes}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

function audioFilename(src: string | undefined): string {
  if (!src) return "audio";
  try {
    return decodeURIComponent(new URL(src, "https://example.invalid").pathname.split("/").pop() || "audio");
  } catch {
    return "audio";
  }
}

function audioFormat(filename: string): string | undefined {
  const extension = filename.split(".").pop();
  return extension && extension !== filename ? extension.toUpperCase() : undefined;
}

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

export function MarkdownAudioMedia({ src, alt, children, audioProps }: MarkdownAudioProps) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const filename = audioFilename(src);
  const altText = alt?.trim() ? alt : undefined;
  const format = audioFormat(filename);
  const fileType = format
    ? t("markdown.audio.formattedFileType", { format })
    : t("markdown.audio.fileType");

  if (state === "failed") {
    return (
      <span className={styles.fallback} role="img" aria-label={altText ?? t("markdown.audio.unavailable")}>
        {t("markdown.audio.unavailable")}
      </span>
    );
  }

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    void audio.play();
  };

  return (
    <span className={styles.audioPlayer} role="group" aria-label={altText ?? t("markdown.audioPlayer")}>
      <audio
        {...audioProps}
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setState("loaded");
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setState("failed")}
        className={styles.audioElement}
      >
        {children}
      </audio>
      <span className={styles.audioControls}>
        <button
          type="button"
          className={styles.audioPlayButton}
          aria-label={t(playing ? "markdown.audio.pause" : "markdown.audio.play", { filename })}
          onClick={togglePlayback}
        >
          <span aria-hidden="true">{playing ? "||" : ">"}</span>
        </button>
        <span className={styles.audioDetails}>
          <span className={styles.audioTimeline}>
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={currentTime}
              aria-label={t("markdown.audio.seek", { filename })}
              onChange={(event) => {
                const nextTime = Number(event.currentTarget.value);
                setCurrentTime(nextTime);
                if (audioRef.current) audioRef.current.currentTime = nextTime;
              }}
            />
            <span>{t("markdown.audio.progress", { currentTime: formatTime(currentTime), duration: formatTime(duration) })}</span>
          </span>
          <span className={styles.audioFileType}>{fileType}</span>
        </span>
        {state === "loading" && <span className={styles.audioLoading}>{t("markdown.audio.loading")}</span>}
      </span>
    </span>
  );
}
