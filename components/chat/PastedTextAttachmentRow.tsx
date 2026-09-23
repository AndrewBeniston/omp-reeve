"use client";

import { useI18n } from "@/hooks/useI18n";
import type { UserMessageAttachment } from "@/lib/types";
import styles from "./pasted-text-attachment.module.css";

export function isPastedTextAttachment(attachment: UserMessageAttachment): boolean {
  return attachment.uploaded && attachment.name === "Pasted text.txt";
}

export function PastedTextAttachmentRow({ attachments }: {
  attachments: UserMessageAttachment[];
}) {
  const { t } = useI18n();
  const pastedTextAttachments = attachments.filter(isPastedTextAttachment);
  if (pastedTextAttachments.length === 0) return null;
  const [first, ...rest] = pastedTextAttachments;
  const label = rest.length === 0
    ? t("composer.queuedMessage.pastedTextAttachment")
    : t("composer.queuedMessage.additionalPastedTextAttachments", {
        preview: first.name,
        remainingCount: rest.length,
      });

  return <div className={styles.row} data-pasted-text-attachments>
    <span className={styles.label}>{label}</span>
  </div>;
}
