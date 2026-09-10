import type { AgentMessage, SubagentSnapshot } from "@/lib/types";

export type SubagentTranscriptEntry = {
  id: string;
  message: AgentMessage;
};

export type SubagentTranscriptResult = {
  fromByte: number;
  nextByte: number;
  reset: boolean;
  entries: Array<{ id?: string; type?: string; message?: AgentMessage }>;
};

export type SubagentSemanticStatus = "retry" | "running" | "failed" | "aborted" | "completed";

export function isSubagentActive(subagent: Pick<SubagentSnapshot, "status">): boolean {
  const s = subagent.status as string;
  return s === "pending" || s === "running" || s === "starting" || s === "waiting";
}

export function formatSubagentDuration(durationMs = 0): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

export function getSubagentStatus(subagent: Pick<SubagentSnapshot, "status" | "progress">): SubagentSemanticStatus {
  if (subagent.progress?.retryState) return "retry";
  if (isSubagentActive(subagent)) return "running";
  if (subagent.status === "failed") return "failed";
  if (subagent.status === "aborted" || (subagent.status as string) === "cancelled") return "aborted";
  return "completed";
}

export function subagentTitle(subagent: Partial<SubagentSnapshot>, fallback: string): string {
  return subagent.task ?? subagent.assignment ?? subagent.description ?? fallback;
}

export function subagentActivity(
  subagent: Pick<SubagentSnapshot, "status" | "progress">,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const progress = subagent.progress;
  switch (getSubagentStatus(subagent)) {
    case "retry": {
      const retry = progress!.retryState!;
      return t("subagents.retrying", { attempt: retry.attempt, max: retry.maxAttempts });
    }
    case "running":
      if (progress?.currentTool) return t("subagents.usingTool", { tool: progress.currentTool });
      return progress?.lastIntent || t("subagents.running");
    case "failed":
      return t("subagents.failed");
    case "aborted":
      return t("subagents.aborted");
    case "completed":
      return t("subagents.finished");
  }
}
