"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import styles from "./activity-archive-dialog.module.css";

export function ActivityArchiveDialog({
  count,
  includesRunning,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  count: number;
  includesRunning: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const chats = count === 1 ? "chat" : "chats";
  const title = includesRunning
    ? `Stop and archive ${count} ${chats}?`
    : `Archive ${count} priority ${chats}?`;
  const description = includesRunning
    ? `Archiving stops ongoing work. You can restore the ${chats} later in settings.`
    : "Recent chats will not be archived.";

  return (
    <Dialog
      open={true}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      className={styles.dialog}
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      {error ? <div role="alert" className={styles.error}>{error}</div> : null}
      <div className={styles.actions}>
        <Button type="button" size="sm" tone="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" tone="danger" loading={busy} onClick={onConfirm}>
          {busy ? "Archiving…" : includesRunning ? "Stop and archive" : "Archive"}
        </Button>
      </div>
    </Dialog>
  );
}
