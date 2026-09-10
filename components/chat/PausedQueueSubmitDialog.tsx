"use client";

import { useRef } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { IconButton } from "../ui/IconButton";
import styles from "./paused-queue-submit-dialog.module.css";

export function PausedQueueSubmitDialog({
  count,
  busy,
  error,
  title,
  description,
  clearLabel,
  sendLabel,
  closeLabel,
  onClose,
  onClearQueue,
  onSendMessage,
}: {
  count: number;
  busy: boolean;
  error: string | null;
  title: string;
  description: string;
  clearLabel: string;
  sendLabel: string;
  closeLabel: string;
  onClose: () => void;
  onClearQueue: () => void;
  onSendMessage: () => void;
}) {
  const clearButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      title={title}
      description={description.replace("{count}", String(count))}
      size="md"
      dismissible={!busy}
      initialFocus={clearButtonRef}
      className={styles.dialog}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <IconButton
        label={closeLabel}
        size="sm"
        disabled={busy}
        className={styles.closeButton}
        onClick={onClose}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </IconButton>
      {error ? <div role="alert" className={styles.error}>{error}</div> : null}
      <div className={styles.actions}>
        <Button
          ref={clearButtonRef}
          type="button"
          size="lg"
          tone="danger"
          disabled={busy}
          className={styles.clearButton}
          onClick={onClearQueue}
        >
          {clearLabel}
        </Button>
        <Button
          type="button"
          size="lg"
          tone="primary"
          loading={busy}
          className={styles.sendButton}
          onClick={onSendMessage}
        >
          {sendLabel}
        </Button>
      </div>
    </Dialog>
  );
}
