import {
  parseConfiguredThinkingLevel,
  type ConfiguredThinkingLevel,
} from "@oh-my-pi/pi-coding-agent/thinking";

export function parseRequestedThinkingLevel(value: unknown): ConfiguredThinkingLevel | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "string" ? parseConfiguredThinkingLevel(value) : undefined;
  if (parsed === undefined) throw new Error(`Invalid thinking level: ${String(value)}`);
  return parsed;
}
