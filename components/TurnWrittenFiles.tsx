"use client";

import { useI18n } from "@/hooks/useI18n";
import { getFileName } from "@/lib/file-paths";
import type { WrittenFile } from "@/lib/turn-written-files";
import { Button } from "./ui/Button";
import { getFileIcon } from "./FileIcons";
import styles from "./chat/chat.module.css";

/**
 * Lists the files a turn actually wrote, as buttons that open each one in the
 * preview pane. Entries come from the turn's successful `write`/`edit` tool
 * calls — the reply text is never scanned for paths.
 */
export function TurnWrittenFiles({ files, onOpenFile }: {
  files: WrittenFile[];
  onOpenFile?: (filePath: string) => void;
}) {
  const { t } = useI18n();
  if (files.length === 0) return null;

  return (
    <div
      aria-label={t("chat.filesWritten")}
      className={styles.writtenFiles}
      data-written-files="true"
    >
      {files.map(({ filePath }) => {
        const name = getFileName(filePath);
        return (
          <Button
            key={filePath}
            type="button"
            tone="neutral"
            size="sm"
            className={styles.writtenFileAction}
            data-written-file={filePath}
            title={filePath}
            aria-label={t("chat.openWrittenFile", { name })}
            onClick={() => onOpenFile?.(filePath)}
          >
            {getFileIcon(name, 12)}
            <span>{name}</span>
          </Button>
        );
      })}
    </div>
  );
}
