"use client";

import { useState } from "react";
import type { ToolCallContent, ToolResultMessage } from "@/lib/types";
import { TerminalOutput } from "./TerminalOutput";
import { ToolDiffView, ToolResultView } from "./ToolDiffView";
import { ToolIcon, type ToolStatus } from "./ToolIcon";
import { ImageView } from "./ImageView";
import {
  classifyTool,
  getDiffStats,
  getResultDiff,
  getResultText,
  getTerminalCommand,
  getToolPreview,
  isEmptyResultText,
} from "./tool-presentation";
import styles from "./message-view.module.css";

export function ToolActivity({ block, result, duration }: { block: ToolCallContent; result?: ToolResultMessage; duration?: number }) {
  const classification = classifyTool(block.toolName);
  const [expanded, setExpanded] = useState(classification.isEdit);
  const resultText = getResultText(result);
  const resultIsEmpty = isEmptyResultText(resultText);
  const isError = result?.isError ?? false;
  const status: ToolStatus = isError ? "error" : result ? "success" : "running";
  const terminalCommand = getTerminalCommand(classification, block.input);

  const resultImages = result?.content.filter((item): item is Extract<typeof item, { type: "image" }> => item.type === "image") ?? [];
  if (classification.kind === "image" && resultImages.length > 0) {
    return <ImageView images={resultImages} />;
  }

  if (terminalCommand !== null) {
    return (
      <TerminalOutput
        command={terminalCommand}
        output={resultText ?? ""}
        pending={!result}
        isError={isError}
        duration={duration}
        local={classification.isLocal}
      />
    );
  }

  if (classification.isTodo) return null;

  const resultDiff = result && !isError ? getResultDiff(result) : null;
  const diffStats = resultDiff ? getDiffStats(resultDiff.text) : null;
  const inputText = JSON.stringify(block.input, null, 2);

  return (
    <div className={styles.toolCard} data-tool-state={status}>
      <button
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${block.toolName} ${isError ? "error" : result ? "complete" : "running"}`}
        className={styles.toolHeader}
      >
        <ToolIcon kind={classification.kind} status={status} />
        <span className={styles.toolName}>{block.toolName}</span>
        <span className={styles.toolPreview}>{getToolPreview(block, classification)}</span>
        {diffStats && (
          <span
            title={`${diffStats.added} lines added, ${diffStats.removed} lines removed`}
            aria-label={`${diffStats.added} lines added, ${diffStats.removed} lines removed`}
            className={styles.diffStats}
          >
            <span className={styles.diffAdded}>+{diffStats.added}</span>
            <span className={styles.diffRemoved}>−{diffStats.removed}</span>
          </span>
        )}
        {duration !== undefined && <span className={styles.toolDuration}>{duration}s</span>}
        <svg
          className={styles.toolMarker}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>
      {resultDiff && (
        <div className={styles.toolDiff} data-expanded={expanded}>
          <ToolDiffView text={resultDiff.text} />
        </div>
      )}
      {result && isError && (
        <ToolResultView text={resultText ?? ""} isEmpty={resultIsEmpty} isError />
      )}
      {expanded && !resultDiff && <pre className={styles.toolInput}>{inputText}</pre>}
      {expanded && result && !resultDiff && !isError && (
        <ToolResultView text={resultText ?? ""} isEmpty={resultIsEmpty} isError={false} />
      )}
    </div>
  );
}
