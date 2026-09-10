import type { ModelCatalogPreset } from "@/lib/model-catalog";
import type { ModelEntry, ProviderEntry } from "./types";

const DEEPSEEK_COMPAT = {
  thinkingFormat: "deepseek",
  requiresReasoningContentOnAssistantMessages: true,
} as const;

export function hasDeepseekCompat(model: ModelEntry): boolean {
  return model.compat?.thinkingFormat === "deepseek";
}

export function setDeepseekCompat(model: ModelEntry, enabled: boolean): ModelEntry {
  if (enabled) {
    return { ...model, compat: { ...(model.compat ?? {}), ...DEEPSEEK_COMPAT } };
  }
  if (!model.compat) return model;
  const rest = { ...model.compat };
  delete rest.thinkingFormat;
  delete rest.requiresReasoningContentOnAssistantMessages;
  return { ...model, compat: Object.keys(rest).length ? rest : undefined };
}

/**
 * Compat can be configured at the provider or model level; provider-composer
 * merges them (model wins) at runtime. The UI reads the effective value so
 * hand-edited models.json settings are reflected correctly, while toggles
 * write to the model entry so a per-model override is explicit.
 */
export function effectiveCompat(provider: ProviderEntry, model: ModelEntry): Record<string, unknown> {
  return { ...(provider.compat ?? {}), ...(model.compat ?? {}) };
}

export function fillEmptyModelFields(
  model: ModelEntry,
  preset: ModelCatalogPreset,
): { model: ModelEntry; appliedCount: number } {
  const next = { ...model };
  let appliedCount = 0;
  if (!model.name?.trim() && preset.name) {
    next.name = preset.name;
    appliedCount += 1;
  }
  if (model.reasoning === undefined && preset.reasoning === true) {
    next.reasoning = true;
    appliedCount += 1;
  }
  if (!model.input?.length && preset.input?.length) {
    next.input = [...preset.input];
    appliedCount += 1;
  }
  if (model.contextWindow === undefined && preset.contextWindow !== undefined) {
    next.contextWindow = preset.contextWindow;
    appliedCount += 1;
  }
  if (model.maxTokens === undefined && preset.maxTokens !== undefined) {
    next.maxTokens = preset.maxTokens;
    appliedCount += 1;
  }

  if (preset.cost) {
    const cost = { ...(model.cost ?? {}) };
    let costChanged = false;
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      if (cost[key] === undefined && preset.cost[key] !== undefined) {
        cost[key] = preset.cost[key];
        costChanged = true;
        appliedCount += 1;
      }
    }
    if (costChanged) next.cost = cost;
  }
  return { model: next, appliedCount };
}
