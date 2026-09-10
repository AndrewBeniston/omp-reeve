import type { ComponentPropsWithoutRef } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { AnsiSegment } from "@/components/ui/AnsiSegment";
import { useI18n } from "@/hooks/useI18n";
import { normalizeCustomPanelLines, parseAnsiLine, stripAnsi } from "@/lib/ansi";
import styles from "./terminal-output.module.css";

function UnstyledCodeTag({ children, className }: ComponentPropsWithoutRef<"span">) {
  return <span className={className}>{children}</span>;
}

export function TerminalOutput({ command, output, pending, isError, duration, local }: {
  command: string;
  output: string;
  pending: boolean;
  isError: boolean;
  duration?: number;
  local?: boolean;
}) {
  const { t } = useI18n();
  const normalizedLines = normalizeCustomPanelLines(output.split(/\r?\n/));
  const outputLines = normalizedLines.length === 1 && normalizedLines[0] === "" ? [] : normalizedLines;
  const statusLabel = pending ? t("chat.runningCommand") : isError ? "failed" : "";

  return (
    <div className="shell-output-preview">
      <div className={styles.preview} data-error={isError ? "true" : "false"}>
        <div className={styles.commandLine}>
          <span className={styles.commandPrompt} aria-hidden="true">$</span>
          <SyntaxHighlighter className={styles.commandCode} language="bash" PreTag="span" CodeTag={UnstyledCodeTag} useInlineStyles={false} wrapLongLines>
            {command || " "}
          </SyntaxHighlighter>
          {local && <span className="shell-local-label">local</span>}
        </div>
        <div className={styles.outputPanel}>
          <div className={styles.outputDivider}>
            <span className={styles.outputLabel}>Output</span>
            {statusLabel && <span className={styles.outputStatus} data-state={isError ? "error" : pending ? "pending" : undefined}>{statusLabel}</span>}
          </div>
          <div className={styles.outputBody} aria-live={pending ? "polite" : undefined}>
            {outputLines.length === 0 && !pending && <span className={styles.outputEmpty}>{t("i18n.noOutput")}</span>}
            {outputLines.map((line, lineIndex) => {
              const plainLine = stripAnsi(line).trimStart();
              const lineClass = isError || /^(?:error|fatal|failed|failure|✖|x\b)/i.test(plainLine)
                ? "is-error"
                : /^(?:warning|warn|!)/i.test(plainLine)
                ? "is-warning"
                : /^(?:success|passed|ok\b|✓|\+)/i.test(plainLine)
                ? "is-success"
                : "";
              return (
                <div key={lineIndex} className={`shell-output-line ${lineClass}`.trim()}>
                  {parseAnsiLine(line).map((segment, segmentIndex) => <AnsiSegment key={segmentIndex} segment={segment} preserveUnstyledSpan />)}
                  {line === "" ? "\u00a0" : null}
                </div>
              );
            })}
            {pending && <span className="shell-output-pending" aria-label={t("chat.runningCommand")}>▋</span>}
          </div>
        </div>
        {duration !== undefined && <div className="shell-output-footer">{duration}s</div>}
      </div>
    </div>
  );
}
