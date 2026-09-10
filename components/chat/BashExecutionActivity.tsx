"use client";

import { useState } from "react";
import type { BashExecutionMessage } from "@/lib/types";
import { TerminalOutput } from "./TerminalOutput";
import styles from "./message-view.module.css";

export function BashExecutionActivity({ message, sessionId }: { message: BashExecutionMessage; sessionId?: string }) {
  const [fullOutput, setFullOutput] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);
  const isPending = !message.output && message.exitCode === undefined && !message.cancelled;
  const isError = Boolean(message.cancelled || (message.exitCode !== undefined && message.exitCode !== 0));
  const fullOutputUrl = sessionId && message.fullOutputPath
    ? `/api/agent/${encodeURIComponent(sessionId)}/bash-output?path=${encodeURIComponent(message.fullOutputPath)}`
    : null;
  const showFullButton = Boolean(message.truncated && fullOutputUrl && fullOutput === null);
  const displayOutput = fullOutput ?? message.output;

  async function loadFullOutput() {
    if (!fullOutputUrl) return;
    setLoadingFull(true);
    setFullError(null);
    try {
      const response = await fetch(fullOutputUrl);
      const data = await response.json() as { success?: boolean; data?: { output?: string }; error?: string };
      if (data.success) setFullOutput(data.data?.output ?? "");
      else setFullError(data.error ?? "failed");
    } catch (error) {
      setFullError(String(error));
    } finally {
      setLoadingFull(false);
    }
  }

  return (
    <div className={styles.bashExecution}>
      <TerminalOutput command={message.command} output={displayOutput} pending={isPending} isError={isError} local={message.excludeFromContext} />
      {message.truncated && fullOutputUrl && (
        <div className={styles.bashOutputActions}>
          {showFullButton && (
            <button onClick={loadFullOutput} disabled={loadingFull} className={styles.bashOutputLink}>
              {loadingFull ? "loading…" : "view full output"}
            </button>
          )}
          <a href={`${fullOutputUrl}&download=1`} className={styles.bashOutputLink} data-leading={showFullButton}>download full output</a>
          {fullError && <span className={styles.bashOutputError}>({fullError})</span>}
        </div>
      )}
    </div>
  );
}
