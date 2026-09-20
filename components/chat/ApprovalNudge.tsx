"use client";

import { useI18n } from "@/hooks/useI18n";
import styles from "./approval-nudge.module.css";

/**
 * The offer to stop approving every command by hand (R19). Accepting writes
 * `tools.approvalMode`; declining is permanent. The consequence sentence
 * belongs where the decision is made, not in a help page.
 *
 * It takes no focus. It sits inside the approval dialog, and the pending
 * approval keeps the first answer, so Enter cannot widen permissions.
 */
export function ApprovalNudge({
  busy = false,
  error = null,
  onAccept,
  onDismiss,
}: {
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className={styles.root} aria-label={t("approvalNudge.title")}>
      <p className={styles.title}>{t("approvalNudge.title")}</p>
      <p className={styles.body}>{t("approvalNudge.body")}</p>
      <p className={styles.consequence}>{t("approvalNudge.consequence")}</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.decline} disabled={busy} onClick={onDismiss}>
          {t("approvalNudge.keepAsking")}
        </button>
        <button type="button" className={styles.accept} disabled={busy} onClick={onAccept}>
          {t("approvalNudge.accept")}
        </button>
      </div>
    </section>
  );
}
