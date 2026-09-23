"use client";

import React from "react";
import cssModule from "./dictation-control.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) { return target[property] ?? property; },
});

interface DesktopMicrophoneBridge { openMicrophoneSettings(): Promise<unknown> }

function desktopMicrophoneBridge(): DesktopMicrophoneBridge | undefined {
  return (globalThis as { ompDesktop?: DesktopMicrophoneBridge }).ompDesktop;
}

export type DictationState = "idle" | "starting" | "recording" | "finishing" | "transcribing" | "cancelled" | "failed";
export type DictationAction = "start" | "stop" | "cancel" | "retry" | "none";
export type DictationError = { kind: "start" | "transcription" | "permission"; message: string } | null;
export interface DictationLabels {
  idle: string; starting: string; recording: string; finishing: string; transcribing: string;
  transcribingCancel: string; failedRetry: string; failedView: string; startError: string;
  transcribeError: string; unsupported: string; permissionDenied: string; openMicrophoneSettings: string;
}

export function dictationPresentation(state: DictationState): { action: DictationAction; labelKey: keyof Pick<DictationLabels, "idle" | "starting" | "recording" | "finishing" | "transcribing" | "transcribingCancel" | "failedRetry">; disabled: boolean } {
  switch (state) {
    case "starting": return { action: "cancel", labelKey: "starting", disabled: false };
    case "recording": return { action: "stop", labelKey: "recording", disabled: false };
    case "finishing": return { action: "none", labelKey: "finishing", disabled: true };
    case "transcribing": return { action: "cancel", labelKey: "transcribingCancel", disabled: false };
    case "failed": return { action: "start", labelKey: "failedRetry", disabled: false };
    case "cancelled": return { action: "start", labelKey: "idle", disabled: false };
    default: return { action: "start", labelKey: "idle", disabled: false };
  }
}

interface Props {
  state: DictationState;
  labels: DictationLabels;
  available?: boolean;
  error?: DictationError;
  onAction: (action: DictationAction) => void;
  onViewRecording: () => void;
  onOpenMicrophoneSettings?: () => void;
}

export function DictationControl({ state, labels, available = true, error, onAction, onViewRecording, onOpenMicrophoneSettings }: Props) {
  if (!available) return null;
  const view = dictationPresentation(state);
  const label = labels[view.labelKey];
  return (
    <div className={styles.control} data-state={state}>
      {error && <div role="status" className={styles.toast}>
        {error.message}
        {error.kind === "permission" && onOpenMicrophoneSettings && desktopMicrophoneBridge() && <button type="button" className={styles.secondary} onClick={onOpenMicrophoneSettings}>{labels.openMicrophoneSettings}</button>}
      </div>}
      {state === "transcribing" && <span className={styles.status}>{labels.transcribing}</span>}
      <button type="button" disabled={view.disabled} aria-label={label} title={label} onClick={() => onAction(view.action)} className={styles.action}>
        <span aria-hidden="true">{state === "recording" ? "■" : "●"}</span>
        <span>{label}</span>
      </button>
      {state === "failed" && <button type="button" onClick={onViewRecording} className={styles.secondary}>{labels.failedView}</button>}
    </div>
  );
}
