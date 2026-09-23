import type { ComposerSuggestion, ComposerSuggestionSection } from "@/lib/composer-intelligence";
import {
  THINKING_STEP_ORDER,
  thinkingLevelLabelKey,
  type ModelOption,
  type ModelRef,
  type ThinkingStep,
} from "./index";

export type CommandThinkingLevel = ThinkingStep | "auto";

export interface ModelConfiguration {
  model: ModelRef;
  thinkingLevel: CommandThinkingLevel;
}

const RECENT_LIMIT = 5;

export function readRecentModelConfigurations(value: unknown): ModelConfiguration[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ModelConfiguration => (
    typeof entry === "object" && entry !== null
    && typeof entry.model?.provider === "string"
    && typeof entry.model?.modelId === "string"
    && (entry.thinkingLevel === "auto" || THINKING_STEP_ORDER.includes(entry.thinkingLevel))
  )).slice(0, RECENT_LIMIT);
}

export function rememberModelConfiguration(
  recent: readonly ModelConfiguration[],
  configuration: ModelConfiguration,
): ModelConfiguration[] {
  return [{ model: { provider: configuration.model.provider, modelId: configuration.model.modelId }, thinkingLevel: configuration.thinkingLevel }, ...recent.filter((entry) => (
    entry.model.provider !== configuration.model.provider
    || entry.model.modelId !== configuration.model.modelId
    || entry.thinkingLevel !== configuration.thinkingLevel
  ))].slice(0, RECENT_LIMIT);
}

function matches(option: ModelOption, query: string): boolean {
  return `${option.name} ${option.modelId} ${option.provider}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function buildModelCommandSections(
  models: readonly ModelOption[],
  recent: readonly ModelConfiguration[],
  query: string,
  label: (key: string) => string,
): { sections: ComposerSuggestionSection[]; choices: Map<string, { model: ModelRef; thinkingLevel?: CommandThinkingLevel }> } {
  const choices = new Map<string, { model: ModelRef; thinkingLevel?: CommandThinkingLevel }>();
  const recentItems: ComposerSuggestion[] = [];
  for (const configuration of recent) {
    const option = models.find((model) => model.provider === configuration.model.provider && model.modelId === configuration.model.modelId);
    if (!option || !matches(option, query)) continue;
    const id = `model-command:recent:${recentItems.length}`;
    choices.set(id, configuration);
    recentItems.push({
      id, group: "commands", kind: "command", icon: "model",
      label: option.name, raw: `/model ${option.provider}/${option.modelId}:${configuration.thinkingLevel}`,
      detail: `${option.provider} · ${label(thinkingLevelLabelKey(configuration.thinkingLevel))}`,
      searchTerms: [option.name, option.modelId, option.provider],
    });
  }

  const matchingItems: ComposerSuggestion[] = models.filter((option) => matches(option, query)).map((option, index) => {
    const id = `model-command:catalog:${index}`;
    choices.set(id, { model: { provider: option.provider, modelId: option.modelId } });
    return {
      id, group: "commands", kind: "command", icon: "model",
      label: option.name, raw: `/model ${option.provider}/${option.modelId}`,
      detail: option.provider,
      searchTerms: [option.name, option.modelId, option.provider],
    };
  });
  const sections: ComposerSuggestionSection[] = [];
  if (recentItems.length) sections.push({ id: "commands", title: label("composer.modelSlashCommand.recent.title"), items: recentItems });
  if (matchingItems.length) sections.push({ id: "commands", title: label("composer.modelSlashCommand.matchingModels.title"), items: matchingItems });
  return { sections, choices };
}

export function buildReasoningCommandSections(
  supported: readonly string[],
  query: string,
  label: (key: string) => string,
): { sections: ComposerSuggestionSection[]; choices: Map<string, CommandThinkingLevel> } {
  const choices = new Map<string, CommandThinkingLevel>();
  const levels: CommandThinkingLevel[] = ["auto", ...THINKING_STEP_ORDER.filter((level) => supported.includes(level))];
  const items: ComposerSuggestion[] = levels.filter((level) => (
    `${level} ${label(thinkingLevelLabelKey(level))}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )).map((level) => {
    const id = `reasoning-command:${level}`;
    choices.set(id, level);
    return {
      id, group: "commands", kind: "command", icon: "model",
      label: label(thinkingLevelLabelKey(level)), raw: `/reasoning ${level}`,
      searchTerms: [level],
    };
  });
  return { sections: items.length ? [{ id: "commands", title: label("composer.reasoningSlashCommand.title"), items }] : [], choices };
}
