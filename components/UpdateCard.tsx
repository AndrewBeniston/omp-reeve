"use client";

import { useState } from "react";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { DynamicStyleVars } from "./ui/DynamicStyleVars";
import { useI18n } from "@/hooks/useI18n";
import { openExternal } from "@/lib/open-external";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
import type { DesktopUpdateState } from "@/hooks/useDesktopUpdate";
import styles from "./shell/update-card.module.css";

const RELEASES_URL = "https://github.com/AndrewBeniston/omp-reeve/releases";

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function updateCardIsVisible(state: DesktopUpdateState | null, dismissedVersion: string | null): boolean {
  if (!state || !state.availableVersion) return false;
  if (state.phase !== "downloading" && state.phase !== "ready") return false;
  return dismissedVersion !== state.availableVersion;
}

interface UpdateCardViewProps {
  state: DesktopUpdateState;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateCardView({ state, onInstall, onDismiss }: UpdateCardViewProps) {
  const { t } = useI18n();
  const ready = state.phase === "ready";
  const version = state.availableVersion ?? "";

  return (
    <section className={styles.card} aria-live="polite" data-phase={state.phase}>
      <div className={styles.header}>
        <p className={styles.title}>
          {ready
            ? t("update.readyTitle").replace("{version}", version)
            : t("update.downloadingTitle").replace("{version}", version)}
        </p>
        <IconButton label={t("update.dismiss")} size="sm" className={styles.dismiss} onClick={onDismiss}>
          <CloseIcon />
        </IconButton>
      </div>
      {ready ? null : (
        <DynamicStyleVars
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.percent}
          variables={{ "--ui-progress": `${state.percent}%` }}
        >
          <span className={styles.progressFill} />
        </DynamicStyleVars>
      )}
      <div className={styles.actions}>
        {ready ? (
          <Button size="sm" tone="primary" onClick={onInstall}>{t("update.restartNow")}</Button>
        ) : null}
        <Button size="sm" tone="ghost" onClick={() => openExternal(RELEASES_URL)}>{t("update.readMore")}</Button>
      </div>
    </section>
  );
}

export function UpdateCard() {
  const { state, install } = useDesktopUpdate();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  if (!updateCardIsVisible(state, dismissedVersion) || !state) return null;

  return (
    <UpdateCardView
      state={state}
      onInstall={() => { void install(); }}
      onDismiss={() => setDismissedVersion(state.availableVersion)}
    />
  );
}
