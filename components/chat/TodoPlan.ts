import type { ToolCallContent, ToolResultMessage } from "@/lib/types";

export type TodoStatus = "pending" | "in_progress" | "completed" | "abandoned" | "blocked";

export interface TodoTask {
  content: string;
  status: TodoStatus;
  blocker?: string;
}

export interface TodoPhase {
  name: string;
  tasks: TodoTask[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTodoStatus(value: unknown): value is TodoStatus {
  return value === "pending" || value === "in_progress" || value === "completed" || value === "abandoned" || value === "blocked";
}

export function getTodoPhases(block: ToolCallContent, result?: ToolResultMessage): TodoPhase[] | null {
  const details = result?.details;
  if (isRecord(details) && Array.isArray(details.phases)) {
    const phases = details.phases.flatMap((phase): TodoPhase[] => {
      if (!isRecord(phase) || typeof phase.name !== "string" || !Array.isArray(phase.tasks)) return [];
      const tasks = phase.tasks.flatMap((task): TodoTask[] => {
        if (!isRecord(task) || typeof task.content !== "string" || !isTodoStatus(task.status)) return [];
        return [{ content: task.content, status: task.status, blocker: typeof task.blocker === "string" ? task.blocker : undefined }];
      });
      return tasks.length > 0 ? [{ name: phase.name, tasks }] : [];
    });
    if (phases.length > 0) return phases;
  }

  if (!isRecord(block.input) || !Array.isArray(block.input.list)) return null;
  const phases = block.input.list.flatMap((phase): TodoPhase[] => {
    if (!isRecord(phase) || typeof phase.phase !== "string" || !Array.isArray(phase.items)) return [];
    const tasks = phase.items
      .filter((item): item is string => typeof item === "string")
      .map((content) => ({ content, status: "pending" as const }));
    return tasks.length > 0 ? [{ name: phase.phase, tasks }] : [];
  });
  return phases.length > 0 ? phases : null;
}
