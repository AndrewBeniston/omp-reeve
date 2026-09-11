"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import styles from "./navigation/session-rename-dialog.module.css";

/**
 * Rename something that has a short human-set name.
 *
 * It was written for a Session and was never Session-specific: the words are
 * the only part that was. They are props now, defaulting to the Session
 * wording so that call site reads exactly as it did.
 */
export function RenameDialog({
  initialName,
  open,
  title,
  description,
  onCancel,
  onSave,
}: {
  initialName: string;
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const heading = title ?? t("sidebar.renameChat");
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(initialName);
  }, [initialName, open]);

  const save = async () => {
    const nextName = name.trim();
    if (!nextName || saving) return;
    setSaving(true);
    try {
      await onSave(nextName);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={heading}
      description={description ?? t("sidebar.renameDescription")}
      size="sm"
      className={styles.dialog}
      dismissible={!saving}
      initialFocus={inputRef}
      onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}
    >
      <button
        type="button"
        className={styles.closeButton}
        onClick={onCancel}
        disabled={saving}
        title={t("sidebar.cancel")}
        aria-label={t("sidebar.cancel")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          aria-label={heading}
        />
        <div className={styles.actions}>
          <Button type="button" size="md" tone="ghost" onClick={onCancel} disabled={saving}>
            {t("sidebar.cancel")}
          </Button>
          <Button type="submit" size="md" tone="primary" loading={saving} disabled={!name.trim()}>
            {t("sidebar.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
