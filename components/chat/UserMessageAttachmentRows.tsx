"use client";

import { useState } from "react";
import { getFileIcon, FolderIcon } from "../FileIcons";
import { useI18n } from "@/hooks/useI18n";
import type { UserMessageAttachment } from "@/lib/types";
import styles from "./user-message-attachments.module.css";

export function UserMessageAttachmentRows({ attachments, onOpenFile }: {
  attachments: UserMessageAttachment[];
  onOpenFile?: (filePath: string) => void;
}) {
  return <div className={styles.rows} data-message-attachments>
    {attachments.map((attachment, index) => <UserMessageAttachmentRow
      attachment={attachment}
      key={`${attachment.name}-${index}`}
      onOpenFile={onOpenFile}
    />)}
  </div>;
}

function UserMessageAttachmentRow({ attachment, onOpenFile }: {
  attachment: UserMessageAttachment;
  onOpenFile?: (filePath: string) => void;
}) {
  const { t } = useI18n();
  const [sourceOpen, setSourceOpen] = useState(false);
  const kindLabel = attachment.kind === "folder"
    ? t("codex.userMessage.folderAttachmentKind")
    : t("codex.userMessage.fileAttachmentKind");
  const label = attachment.available ? attachment.name : t("codex.userMessage.unavailableFileAttachment", { fileName: attachment.name });
  const content = attachment.uploaded ? attachment.content : undefined;
  const canOpenFile = attachment.available && !attachment.uploaded && attachment.openPath && onOpenFile;

  return <div className={styles.row} data-attachment-kind={attachment.kind} data-available={attachment.available}>
    <span className={styles.icon}>{attachment.kind === "folder" ? <FolderIcon /> : getFileIcon(attachment.name)}</span>
    <span className={styles.name}>{label}</span>
    <span className={styles.kind}>{kindLabel}</span>
    {canOpenFile && <button
      type="button"
      className={styles.open}
      onClick={() => onOpenFile(attachment.openPath!)}
    >
      {t("codex.userMessage.openAttachment")}
    </button>}
    {content && <button
      type="button"
      className={styles.open}
      aria-expanded={sourceOpen}
      onClick={() => setSourceOpen((open) => !open)}
    >
      {t(sourceOpen ? "codex.userMessage.hideAttachmentSource" : "codex.userMessage.showAttachmentSource")}
    </button>}
    {content && sourceOpen && <pre className={styles.source}>{content}</pre>}
  </div>;
}
