"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { Tooltip } from "@/components/ui/Tooltip";
import styles from "./message-view.module.css";

export type MessageTurnRole = "user" | "assistant" | "custom" | "compaction";

interface MessageTurnProps {
  role: MessageTurnRole;
  children: ReactNode;
  header?: ReactNode;
  afterBody?: ReactNode;
  footer?: ReactNode;
  timestamp?: string | null;
  copyContent?: string;
  onRetry?: () => void;
  onBranch?: () => void;
  branchPending?: boolean;
  streaming?: boolean;
  cardHidden?: boolean;
  cardExpanded?: boolean;
  navigationId?: string;
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function MessageTurn({
  role,
  children,
  header,
  afterBody,
  footer,
  timestamp,
  copyContent,
  onRetry,
  onBranch,
  branchPending = false,
  streaming = false,
  cardHidden,
  cardExpanded,
  navigationId,
}: MessageTurnProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyMessage = () => {
    if (copyContent === undefined) return;
    void copyText(copyContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (role === "custom" || role === "compaction") {
    const hasActions = copyContent !== undefined || footer !== undefined;
    return (
      <div className={styles.cardTurn} data-message-role={role}>
        <div
          className={styles.messageCard}
          data-hidden={cardHidden}
          data-expanded={cardExpanded}
        >
          <div className={styles.messageCardHeader}>
            {header}
            {timestamp && <span className={`${styles.timestamp} ${styles.timestampTrailing}`}>{timestamp}</span>}
          </div>
          {children}
          {hasActions && (
            <div className={styles.messageCardActions}>
              {copyContent !== undefined && (
                <button
                  type="button"
                  onClick={copyMessage}
                  title={t("i18n.copyMessage")}
                  className={styles.cardAction}
                  data-message-action="copy"
                  data-state={copied ? "copied" : "idle"}
                >
                  {copied ? t("i18n.copied") : t("i18n.copy")}
                </button>
              )}
              {footer}
            </div>
          )}
          {afterBody}
        </div>
      </div>
    );
  }

  if (role === "user") {
    return (
      <div
        className={styles.userTurn}
        data-message-role="user"
        data-transcript-navigation-id={navigationId}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className={styles.userMessageRow}>
          <div className={styles.userBubble}>{children}</div>
        </div>
        <div className={styles.messageFooter}>
          {copyContent !== undefined && (
            <div className={styles.messageActions} data-visible={hovered}>
              <Tooltip content={copied ? t("i18n.copied") : t("i18n.copyMessage")}>
                <button
                  type="button"
                  onClick={copyMessage}
                  aria-label={t("i18n.copyMessage")}
                  className={styles.messageAction}
                  data-message-action="copy"
                  data-state={copied ? "copied" : "idle"}
                >
                  <CopyIcon copied={copied} />
                </button>
              </Tooltip>
            </div>
          )}
          {(onRetry || onBranch) && (
            <div className={styles.messageActions} data-visible={hovered || branchPending}>
              {onRetry && (
                <Tooltip content={t("i18n.editFromHereTitle")}>
                  <button
                    type="button"
                    onClick={onRetry}
                    aria-label={t("i18n.editFromHere")}
                    className={styles.messageAction}
                    data-message-action="edit"
                    data-state="idle"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="15 10 20 15 15 20" />
                      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                    </svg>
                  </button>
                </Tooltip>
              )}
              {onBranch && (
                <Tooltip content={branchPending ? t("i18n.creatingSession") : t("i18n.newSessionTitle")}>
                  <button
                    type="button"
                    onClick={onBranch}
                    disabled={branchPending}
                    aria-label={branchPending ? t("i18n.creatingSession") : t("i18n.newSession")}
                    className={styles.messageAction}
                    data-message-action="fork"
                    data-state={branchPending ? "running" : "idle"}
                    aria-busy={branchPending || undefined}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>
          )}
          {timestamp && <span className={styles.timestamp} data-visible={hovered}>{timestamp}</span>}
        </div>
      </div>
    );
  }

  const canCopy = Boolean(copyContent) && !streaming;
  return (
    <div
      className={styles.assistantTurn}
      data-message-role="assistant"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {header && <div className={styles.assistantMeta}>{header}</div>}
      <div className={styles.assistantBlocks}>{children}</div>
      {afterBody}
      <div className={styles.assistantFooter}>
        {(footer || (timestamp && !streaming)) && (
          <div className={styles.assistantFooterMeta} data-visible={hovered}>
            {footer}
            {timestamp && !streaming && (
              <span className={styles.timestamp} data-visible={hovered}>{timestamp}</span>
            )}
          </div>
        )}
        {canCopy && (
          <Tooltip content={copied ? t("i18n.copied") : t("i18n.copyMessage")}>
            <button
              type="button"
              onClick={copyMessage}
              aria-label={t("i18n.copyMessage")}
              className={styles.messageAction}
              data-message-action="copy"
              data-state={copied ? "copied" : "idle"}
              data-visible={hovered}
            >
              <CopyIcon copied={copied} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
