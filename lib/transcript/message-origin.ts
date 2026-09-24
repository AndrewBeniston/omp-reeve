export type MessageOriginKind = "hook-feedback" | "live-delegation";

export function messageOrigin(message: { role: string; customType?: string; display?: boolean }): MessageOriginKind | null {
  if (message.display === false) return null;
  if (message.role === "hookMessage") return "hook-feedback";
  if (message.role === "custom" && message.customType === "live-delegation") return "live-delegation";
  return null;
}
