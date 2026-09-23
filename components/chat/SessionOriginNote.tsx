"use client";

import { CornerDownRight, GitFork } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./session-origin-note.module.css";

export interface SessionOriginNoteProps {
  kind: "continued" | "parent";
  relatedSessionId: string;
  onOpenSession: (sessionId: string) => void;
}

export function SessionOriginNote({ kind, relatedSessionId, onOpenSession }: SessionOriginNoteProps) {
  const { t } = useI18n();
  const label = t(kind === "continued" ? "transcript.continuedFromChat" : "transcript.parentChat");
  const Icon = kind === "continued" ? CornerDownRight : GitFork;

  return (
    <div className={styles.note} data-origin-kind={kind} data-transcript-note="session-origin">
      {kind === "continued" ? <span className={styles.rule} aria-hidden="true" /> : null}
      <button
        className={styles.label}
        data-session-id={relatedSessionId}
        onClick={() => onOpenSession(relatedSessionId)}
        type="button"
      >
        <Icon className={styles.icon} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {kind === "continued" ? <span className={styles.rule} aria-hidden="true" /> : null}
    </div>
  );
}
