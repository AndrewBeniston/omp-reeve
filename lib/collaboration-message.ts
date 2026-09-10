import type { CollaborationSnapshot } from "./omp-types";
import type { AgentMessage, CustomMessage } from "./types";

export function isCollaborationSnapshot(value: unknown): value is CollaborationSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CollaborationSnapshot>;
  return typeof candidate.active === "boolean"
    && (candidate.mode === "write" || candidate.mode === "view")
    && Array.isArray(candidate.participants);
}

export function applyCollaborationSnapshot(
  messages: AgentMessage[],
  collaboration: CollaborationSnapshot,
  options: { appendIfMissing?: boolean; message?: string } = {},
): AgentMessage[] {
  const index = messages.findLastIndex((message) => (
    message.role === "custom" && message.customType === "collaboration"
  ));
  const content = options.message ?? (collaboration.active
    ? "Collaboration session active"
    : "Collaboration stopped");
  if (index < 0) {
    if (!options.appendIfMissing || !collaboration.active) return messages;
    const message: CustomMessage = {
      role: "custom",
      customType: "collaboration",
      content,
      display: true,
      details: collaboration,
      timestamp: Date.now(),
    };
    return [...messages, message];
  }
  const current = messages[index];
  if (!current || current.role !== "custom") return messages;
  const updated: CustomMessage = { ...current, content, details: collaboration };
  const next = [...messages];
  next[index] = updated;
  return next;
}
