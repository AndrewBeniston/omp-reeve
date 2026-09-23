"use client";

import { useRef, useState, type ReactNode } from "react";
import { Copy, Expand, X } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { Dialog } from "./ui/Dialog";
import styles from "./MarkdownTable.module.css";

export function MarkdownTable({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const tableRef = useRef<HTMLTableElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const copyTable = () => {
    const table = tableRef.current;
    if (!table) return;
    const rows = Array.from(table.querySelectorAll("tr"), (row) =>
      Array.from(row.querySelectorAll("th,td"), (cell) =>
        (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
      ).join("\t"),
    );
    void copyText(rows.join("\n"));
  };

  return (
    <div className={styles.tableBlock}>
      <div className={styles.controls}>
        <button type="button" className={styles.control} aria-label={t("markdown.copyTable")}
          title={t("markdown.copyTable")} onClick={copyTable}>
          <Copy size={15} aria-hidden="true" />
        </button>
        <button type="button" className={styles.control} aria-label={t("markdown.expandTable")}
          title={t("markdown.expandTable")} onClick={() => setPreviewOpen(true)}>
          <Expand size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="markdown-table-wrap"><table ref={tableRef}>{children}</table></div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen} size="lg"
        title={t("markdown.tablePreview")} aria-label={t("markdown.tablePreview")}
        initialFocus={closeRef} className={`markdown-body ${styles.previewDialog}`}>
        <button ref={closeRef} type="button" className={`${styles.control} ${styles.close}`}
          aria-label={t("markdown.closeTablePreview")} title={t("markdown.closeTablePreview")}
          onClick={() => setPreviewOpen(false)}>
          <X size={18} aria-hidden="true" />
        </button>
        <div className="markdown-table-wrap"><table>{children}</table></div>
      </Dialog>
    </div>
  );
}
