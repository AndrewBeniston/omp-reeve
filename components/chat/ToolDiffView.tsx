import { useMemo } from "react";
import { useI18n } from "@/hooks/useI18n";
import { parseUnifiedPatch, type SplitDiffCell } from "@/lib/patch";
import styles from "./message-view.module.css";

export function ToolDiffView({ text }: { text: string }) {
  const { t } = useI18n();
  const files = useMemo(() => parseUnifiedPatch(text), [text]);

  if (!files) {
    return <div className={styles.pairedDiff}><PatchTextView text={text} /></div>;
  }

  const showFileHeaders = files.length > 1;
  return (
    <div className={styles.pairedDiff}>
      <div className={styles.splitDiff}>
        {files.map((file, fileIndex) => (
          <div key={fileIndex} className={styles.splitDiffFile}>
            {showFileHeaders && (
              <div className={styles.splitDiffHeaders}>
                <SplitDiffHeader title={file.oldPath || t("i18n.before")} side="left" />
                <SplitDiffHeader title={file.newPath || t("i18n.after")} side="right" />
              </div>
            )}
            <div className={styles.splitDiffRows}>
              {file.rows.map((row, rowIndex) => row.type === "hunk" ? null : (
                <div key={rowIndex} className={styles.splitDiffRow}>
                  <SplitDiffCellView cell={row.left} side="left" />
                  <SplitDiffCellView cell={row.right} side="right" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToolResultView({ text, isEmpty, isError }: {
  text: string;
  isEmpty: boolean;
  isError: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.pairedResult} data-error={isError}>
      <pre className={styles.pairedResultContent} data-empty={isEmpty}>
        {isEmpty ? t("i18n.noOutput") : text}
      </pre>
    </div>
  );
}

function SplitDiffHeader({ title, side }: { title: string; side: "left" | "right" }) {
  return <div title={title} className={styles.splitDiffHeader} data-side={side}>{title}</div>;
}

function SplitDiffCellView({ cell, side }: { cell: SplitDiffCell; side: "left" | "right" }) {
  const marker = cell.type === "added" ? "+" : cell.type === "removed" ? "-" : " ";
  return (
    <div className={styles.splitDiffCell} data-type={cell.type} data-side={side}>
      <span className={styles.splitDiffLineNumber}>{cell.lineNo ?? ""}</span>
      <span className={styles.splitDiffMarker}>{marker}</span>
      <span className={styles.splitDiffText}>{cell.text || "\u00a0"}</span>
    </div>
  );
}

function PatchTextView({ text }: { text: string }) {
  return (
    <div className={styles.patchText}>
      {text.split(/\r?\n/).map((line, index) => {
        const kind = line.startsWith("@@") ? "hunk" : line.startsWith("+") && !line.startsWith("+++") ? "added" : line.startsWith("-") && !line.startsWith("---") ? "removed" : "context";
        return (
          <div key={index} className={styles.patchLine} data-kind={kind}>
            <span className={styles.patchLineNumber}>{index + 1}</span>
            <span className={styles.patchLineText}>{line || "\u00a0"}</span>
          </div>
        );
      })}
    </div>
  );
}
