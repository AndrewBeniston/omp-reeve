"use client";

import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useI18n } from "@/hooks/useI18n";
import styles from "./full-access-confirm-dialog.module.css";

export function FullAccessConfirmDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open
      title={t("approvalMode.confirmTitle")}
      size="sm"
      dismissible={!busy}
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <ul className={styles.areas}>
        <li>{t("approvalMode.confirmFiles")}</li>
        <li>{t("approvalMode.confirmTerminal")}</li>
        <li>{t("approvalMode.confirmInternet")}</li>
      </ul>
      <div className={styles.actions}>
        <Button type="button" size="sm" tone="ghost" disabled={busy} onClick={onCancel}>
          {t("trust.cancel")}
        </Button>
        <Button type="button" size="sm" tone="primary" loading={busy} onClick={onConfirm}>
          {t("approvalMode.confirmAction")}
        </Button>
      </div>
    </Dialog>
  );
}
