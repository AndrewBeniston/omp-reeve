"use client";

import { parseAnsiLine, stripAnsi } from "@/lib/ansi";
import type { ExtensionStatusItem } from "@/lib/types";
import { AnsiSegment } from "./ui/AnsiSegment";
import styles from "./chat/chat.module.css";

export function sanitizeExtensionStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

export function formatExtensionStatusLine(statuses: ExtensionStatusItem[]): string {
  return [...statuses]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ text }) => sanitizeExtensionStatusText(text))
    .join(" ");
}

export function ExtensionStatusBar({ statuses }: { statuses: ExtensionStatusItem[] }) {
  if (statuses.length === 0) return null;

  const statusLine = formatExtensionStatusLine(statuses);
  const plainStatusLine = stripAnsi(statusLine);

  return (
    <div
      role="status"
      aria-label={plainStatusLine}
      title={plainStatusLine}
      className={styles.extensionStatus}
      data-extension-status="true"
    >
      <span
        className={styles.extensionStatusLine}
        data-extension-status-line="true"
      >
        {parseAnsiLine(statusLine).map((segment, index) => (
          <AnsiSegment key={index} segment={segment} preserveUnstyledSpan />
        ))}
      </span>
    </div>
  );
}
