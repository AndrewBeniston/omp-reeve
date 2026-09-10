"use client";

import React, { type ChangeEvent, type ReactNode, type Ref } from "react";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import { Tooltip } from "../ui/Tooltip";
import { QueuedMessageList, type QueuedMessageListProps } from "./QueuedMessageList";
import cssModule from "./composer.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

interface ComposerAttachment {
  previewUrl: string;
}

interface ComposerRetryStatus {
  message: string;
  detail?: string;
}

interface ComposerFrameProps {
  requestPending?: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  fileInputRef: Ref<HTMLInputElement>;
  fileInputId: string;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  modelError?: string | null;
  modelScopeWarnings?: string[];
  queue?: QueuedMessageListProps | null;
  retryStatus?: ComposerRetryStatus | null;
  successStatus?: string | null;
  compactError?: string | null;
  attachments: ComposerAttachment[];
  onRemoveAttachment: (index: number) => void;
  inputOverlay?: ReactNode;
  editor: ReactNode;
  textareaHeight: string;
  mode: "bash" | "streaming" | "idle";
  primaryActions: ReactNode;
  statusLine?: ReactNode;
  toolbarStart: ReactNode;
  toolbarCenter: ReactNode;
  toolbarModelArea: ReactNode;
  toolbarEnd: ReactNode;
  dictateLabel: string;
  dictationAvailable?: boolean;
  toolbarEndRef: Ref<HTMLDivElement>;
  isMobile: boolean;
}

function ModelNoticeBanner({ tone, title, body }: { tone: "error" | "warning"; title: string; body: string }) {
  return (
    <div role="alert" data-state={tone} className={styles.modelNotice}>
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.noticeIcon}
        aria-hidden="true"
      >
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className={styles.noticeBody}>
        <div className={styles.noticeTitle}>{title}</div>
        <div className={styles.noticeText}>{body}</div>
      </div>
    </div>
  );
}

export function ModelErrorBanner({ error }: { error?: string | null }) {
  if (!error) return null;
  return <ModelNoticeBanner tone="error" title="Model error" body={error} />;
}

export function ModelScopeWarningBanner({ warnings }: { warnings?: string[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <ModelNoticeBanner
      tone="warning"
      title={warnings.length > 1 ? "Model scope warnings" : "Model scope warning"}
      body={warnings.join("\n")}
    />
  );
}

function RetryStatus({ status }: { status: ComposerRetryStatus }) {
  return (
    <div role="status" aria-live="polite" data-state="retry" className={`${styles.statusBanner} ${styles.warningBanner}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.statusIcon} aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      {status.message}
      {status.detail && <span className={styles.statusDetail}>— {status.detail}</span>}
    </div>
  );
}

function SuccessStatus({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" data-state="success" className={`${styles.statusBanner} ${styles.successBanner}`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.statusIcon} aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {children}
    </div>
  );
}

export function ComposerFloatingGeometry({
  left,
  bottom,
  maxHeight,
  isMobile,
  children,
}: {
  left: number;
  bottom: number;
  maxHeight: number;
  isMobile: boolean;
  children: ReactNode;
}) {
  return (
    <DynamicStyleVars
      variables={{
        "--ui-animation-origin-x": `${left}px`,
        "--ui-animation-origin-y": `${bottom}px`,
        "--ui-scroll-offset": `${maxHeight}px`,
      }}
      className={styles.modelMenuGeometry}
      data-mobile={isMobile ? "true" : "false"}
    >
      {children}
    </DynamicStyleVars>
  );
}

export function ComposerFrame({
  requestPending = false,
  onSubmit,
  fileInputRef,
  fileInputId,
  onFileInputChange,
  modelError,
  modelScopeWarnings,
  queue,
  retryStatus,
  successStatus,
  compactError,
  attachments,
  onRemoveAttachment,
  inputOverlay,
  editor,
  textareaHeight,
  mode,
  primaryActions,
  statusLine,
  toolbarStart,
  toolbarCenter,
  toolbarModelArea,
  toolbarEnd,
  dictateLabel,
  dictationAvailable = false,
  toolbarEndRef,
  isMobile,
}: ComposerFrameProps) {
  const useSingleRow = requestPending
    && !modelError
    && !(modelScopeWarnings?.length)
    && !queue
    && !retryStatus
    && !successStatus
    && !compactError
    && attachments.length === 0
    && !statusLine;
  const dictateControl = (
    <button
      type="button"
      aria-label={dictateLabel}
      hidden={!dictationAvailable}
      className={`${styles.stateControl} ${styles.dictateControl}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0" />
        <line x1="12" y1="17" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    </button>
  );

  return (
    <form aria-label="Message composer" className={styles.composerShell} onSubmit={onSubmit}>
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept="image/*"
        multiple
        data-composer-image-input
        className={styles.hiddenInput}
        onChange={onFileInputChange}
      />
      {queue && (
        <div className={styles.queuePlacement}>
          <QueuedMessageList {...queue} />
        </div>
      )}
      <div className={styles.composer} data-compact={useSingleRow ? "true" : undefined}>
      <div className={styles.composerContent}>
        <ModelErrorBanner error={modelError} />
        <ModelScopeWarningBanner warnings={modelScopeWarnings} />
        {retryStatus && <RetryStatus status={retryStatus} />}
        {successStatus && <SuccessStatus>{successStatus}</SuccessStatus>}
        {compactError && <div role="alert" data-state="error" className={`${styles.statusBanner} ${styles.compactError}`}>{compactError}</div>}
        {attachments.length > 0 && (
          <div className={styles.imagePreviews} role="list" aria-label="Image attachments">
            {attachments.map((attachment, index) => (
              <div key={index} className={styles.imagePreview} role="listitem">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.previewUrl} alt="" className={styles.previewImage} />
                <button type="button" onClick={() => onRemoveAttachment(index)} className={styles.removeImage} aria-label={`Remove image ${index + 1}`}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <line x1="1" y1="1" x2="7" y2="7" />
                    <line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.inputArea}>
          {inputOverlay}
          <div className={styles.composerFrame} data-mode={mode}>
            <DynamicStyleVars className={styles.textareaGeometry} variables={{ "--ui-composer-height": textareaHeight }}>
              {editor}
            </DynamicStyleVars>
            {primaryActions}
          </div>
        </div>
        {statusLine}
        {isMobile && toolbarCenter && <div className={styles.mobileContext}>{toolbarCenter}</div>}
        <div className={styles.toolbar} data-mobile={isMobile ? "true" : "false"} role="group" aria-label="Composer controls">
          <div className={styles.toolbarLeft} data-mobile={isMobile ? "true" : "false"}>{toolbarStart}</div>
          <div ref={toolbarEndRef} className={styles.toolbarRight} data-mobile={isMobile ? "true" : "false"}>
            {isMobile ? toolbarEnd : (
              <>
                <div className={styles.toolbarModelArea}>
                  {!isMobile && toolbarCenter}
                  {toolbarModelArea}
                </div>
                <div className={styles.toolbarTrailing}>
                  {dictationAvailable
                    ? <Tooltip content={dictateLabel}>{dictateControl}</Tooltip>
                    : dictateControl}
                  {toolbarEnd}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </form>
  );
}
