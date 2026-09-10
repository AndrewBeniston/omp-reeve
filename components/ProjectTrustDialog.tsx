"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useI18n } from "@/hooks/useI18n";
import styles from "./ProjectTrustDialog.module.css";

export function ProjectTrustDialog({
  cwd,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  cwd: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog
      open
      title={(
        <>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={styles.warningIcon}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>{" "}
          {t("trust.dialogTitle")}
        </>
      )}
      description={t("trust.dialogBody")}
      size="sm"
      dismissible={!busy}
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <code className={styles.pathCode}>
        {cwd}
      </code>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          onClick={onCancel}
          disabled={busy}
          size="sm"
          tone="ghost"
        >
          {t("trust.cancel")}
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          loading={busy}
          size="sm"
          tone="primary"
        >
          {busy ? t("trust.trusting") : t("trust.trustProject")}
        </Button>
      </div>
    </Dialog>
  );
}
