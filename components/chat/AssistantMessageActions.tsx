"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ForkDialog } from "./ForkDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { useI18n } from "@/hooks/useI18n";
import { copyTextOrFail } from "@/lib/clipboard";
import styles from "./assistant-message-actions.module.css";

interface AssistantMessageActionsProps {
  children: ReactNode;
  text: string;
  entryId?: string;
  cwd?: string;
  onFork?: (entryId: string, options?: { cwd?: string }) => Promise<{ forked: boolean; error?: string } | void> | void;
  forking?: boolean;
  pinVisible?: boolean;
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function AssistantMessageActions({ children, text, entryId, cwd, onFork, forking = false, pinVisible = false }: AssistantMessageActionsProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const branchButtonRef = useRef<HTMLButtonElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canFork = Boolean(entryId && onFork);
  const hasActions = Boolean(text || canFork);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
  }, []);

  const closeDialog = () => {
    setDialogOpen(false);
    requestAnimationFrame(() => branchButtonRef.current?.focus());
  };

  const copyResponse = async () => {
    try {
      await copyTextOrFail(text);
      if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const visible = pinVisible || hovered || focused || forking;
  return (
    <div
      className={styles.surface}
      data-assistant-surface="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {children}
      {hasActions && <div className={styles.actions} data-assistant-actions="true" data-visible={visible}>
        {text && (
          <Tooltip content={copied ? t("i18n.copied") : t("assistantMessageContent.copyResponseTooltip")}>
            <button type="button" onClick={() => void copyResponse()} aria-label={t("assistantMessageContent.copyResponseTooltip")} className={styles.action} data-message-action="copy-response" data-state={copied ? "copied" : "idle"}>
              <CopyIcon copied={copied} />
            </button>
          </Tooltip>
        )}
        <span className={styles.slot} data-slot="leading-first" />
        <span className={styles.slot} data-slot="leading-second" />
        <span className={styles.slot} data-slot="feedback" />
        {canFork && (
          <Tooltip content={t("assistantMessageContent.branchInNewChatTooltip")}>
            <button ref={branchButtonRef} type="button" onClick={() => setDialogOpen(true)} disabled={forking} aria-busy={forking || undefined} aria-label={t("assistantMessageContent.forkAriaLabel")} className={styles.action} data-message-action="fork" data-state={forking ? "running" : "idle"}>
              <span className={styles.spinner} aria-hidden="true" data-visible={forking || undefined} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </button>
          </Tooltip>
        )}
        <span className={styles.slot} data-slot="statistics-first" />
        <span className={styles.slot} data-slot="statistics-second" />
        <span className={styles.slot} data-slot="entries" />
        <span className={styles.slot} data-slot="trailing-first" />
        <span className={styles.slot} data-slot="trailing-second" />
      </div>}
      {canFork && (
        <ForkDialog open={dialogOpen} entryId={entryId} cwd={cwd} onClose={closeDialog} onForkLocal={async () => onFork!(entryId!)} onForkWorktree={async (worktreePath) => onFork!(entryId!, { cwd: worktreePath })} />
      )}
    </div>
  );
}
