"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { copyText, copyTextOrFail } from "@/lib/clipboard";
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
  userText?: ReactNode;
}

const USER_MESSAGE_LINES = 2;
const USER_MESSAGE_FALLBACK_FONT_PX = 13;
const USER_MESSAGE_HEIGHT_TOLERANCE_PX = 1;

function UserMessageBody({ children, text }: { children: ReactNode; text?: ReactNode }) {
  const { t } = useI18n();
  const textId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [collapsible, setCollapsible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const element = contentRef.current;
    if (!element) return;
    const style = window.getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize) || USER_MESSAGE_FALLBACK_FONT_PX;
    const lineHeight = style.lineHeight.endsWith("px")
      ? Number.parseFloat(style.lineHeight)
      : fontSize * 1.5;
    const height = lineHeight * USER_MESSAGE_LINES;
    setCollapsible(element.getBoundingClientRect().height > height + USER_MESSAGE_HEIGHT_TOLERANCE_PX);
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, text]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || !window.ResizeObserver) return;
    const observer = new window.ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, text]);

  useEffect(() => {
    let active = true;
    const fonts = document.fonts;
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    fonts?.addEventListener("loadingdone", measure);
    void fonts?.ready.then(() => { if (active) measure(); });
    return () => {
      active = false;
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      fonts?.removeEventListener("loadingdone", measure);
    };
  }, [measure]);

  return (
    <div className={styles.userBubble} onLoadCapture={measure}>
      {children}
      {text !== undefined && (
        <>
          <div
            id={textId}
            className={styles.userTextViewport}
            data-collapsed={collapsible && !expanded}
          >
            <div ref={contentRef} className={styles.userTextContent}>{text}</div>
          </div>
          {collapsible && (
            <button
              type="button"
              className={styles.userMessageToggle}
              aria-controls={textId}
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {t(expanded ? "codex.userMessage.showLess" : "codex.userMessage.showMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
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
  userText,
}: MessageTurnProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCopied = () => {
    if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
    setCopied(true);
    copiedTimerRef.current = setTimeout(() => {
      copiedTimerRef.current = null;
      setCopied(false);
    }, 1500);
  };

  const copyMessage = () => {
    if (copyContent === undefined) return;
    void copyText(copyContent).then(markCopied);
  };

  const copyUserMessage = () => {
    if (copyContent === undefined) return;
    void copyTextOrFail(copyContent).then(markCopied).catch(() => {});
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
          <UserMessageBody text={userText}>{children}</UserMessageBody>
        </div>
        <div className={styles.messageFooter}>
          {copyContent !== undefined && (
            <div className={styles.messageActions} data-visible={hovered}>
              <Tooltip content={t(copied ? "codex.userMessage.copiedAriaLabel" : "codex.userMessage.copyAriaLabel")}>
                <button
                  type="button"
                  onClick={copyUserMessage}
                  aria-label={t(copied ? "codex.userMessage.copiedAriaLabel" : "codex.userMessage.copyAriaLabel")}
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
