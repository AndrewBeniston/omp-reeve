import {
  formatModelRoleSelector,
  getModelRoleThinkingLevel,
  getModelRoleThinkingOptions,
} from "@/lib/model-role-selection";

export interface RoleModelChange {
  /** The model selector the operator picked, or "" to unset the role. */
  value: string;
  /** The selector the role holds now, which may carry a thinking suffix. */
  currentSelector?: string;
  /** Thinking levels the picked model supports, or undefined when unknown. */
  supportedLevels?: readonly string[];
}

/**
 * Decide the selector to write when the operator picks a model for a role.
 *
 * The role keeps its thinking level when the new model supports that level.
 * When the new model does not support it, the role falls back to inherit, so
 * omp never sends an effort the model rejects. An empty value unsets the role.
 */
export function resolveRoleModelChange({
  value,
  currentSelector,
  supportedLevels,
}: RoleModelChange): string | null {
  if (!value) return null;
  const preservedLevel = getModelRoleThinkingLevel(currentSelector);
  const nextLevel = getModelRoleThinkingOptions(supportedLevels).includes(preservedLevel)
    ? preservedLevel
    : "inherit";
  return formatModelRoleSelector(value, nextLevel);
}
