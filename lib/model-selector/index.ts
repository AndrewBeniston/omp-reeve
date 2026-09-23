/** The OMP-backed model and thinking choices used by the Composer. */
import type { ModelRoleAssignment } from "../api-types";

export type ModelSubmenu = "model" | "effort" | "speed" | "advanced";

export interface ModelMenuState {
  open: boolean;
  submenu: ModelSubmenu | null;
  filter: string;
}

export const INITIAL_MODEL_MENU_STATE: ModelMenuState = { open: false, submenu: null, filter: "" };

export type ModelMenuAction =
  | { type: "toggle" }
  | { type: "close" }
  | { type: "submenu"; value: ModelSubmenu | null }
  | { type: "filter"; value: string };

export function reduceModelMenuState(state: ModelMenuState, action: ModelMenuAction): ModelMenuState {
  switch (action.type) {
    case "toggle":
      return state.open ? INITIAL_MODEL_MENU_STATE : { ...state, open: true };
    case "close":
      return INITIAL_MODEL_MENU_STATE;
    case "submenu":
      return { ...state, submenu: action.value };
    case "filter":
      return { ...state, filter: action.value };
  }
}

export const THINKING_STEP_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingStep = typeof THINKING_STEP_ORDER[number];
export type ReferenceEffort = "none" | Exclude<ThinkingStep, "off">;

export interface ModelRef {
  provider: string;
  modelId: string;
}

export interface RegistryModel {
  provider: string;
  id: string;
  name: string;
  thinkingLevels: readonly string[];
}

export interface PowerSelection {
  id: string;
  model: ModelRef;
  thinkingLevel: ThinkingStep;
  effort: ReferenceEffort;
  effortLabel: string;
  sliderLabel: string;
}

export interface ModelSelectorInput {
  registry: readonly RegistryModel[];
  roles: readonly ModelRoleAssignment[];
  currentModel?: ModelRef | null;
  currentThinkingLevel?: string | null;
  thinkingLevelPins?: Readonly<Record<string, string>>;
  explicitModelOverride?: boolean;
  filter?: string;
}

const EFFORT_LABEL_KEYS: Record<ThinkingStep, string> = {
  off: "chat.effortNone",
  minimal: "chat.effortMinimal",
  low: "chat.effortLight",
  medium: "chat.effortMedium",
  high: "chat.effortHigh",
  xhigh: "chat.effortExtraHigh",
  max: "chat.effortMax",
};

export function thinkingLevelLabelKey(level: ThinkingStep | "auto"): string {
  return level === "auto" ? "chat.effortAuto" : EFFORT_LABEL_KEYS[level];
}

const SLIDER_LABEL_KEYS: Partial<Record<ThinkingStep, string>> = {
  medium: "chat.effortStandard",
  high: "chat.effortExtended",
};

const MODEL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function modelKey(model: ModelRef): string {
  return `${model.provider}/${model.modelId}`;
}

function selectionId(model: ModelRef, effort: ReferenceEffort): string {
  return `${modelKey(model)}:${effort}`;
}

function routeLabel(provider: string, label: (key: string) => string): string {
  if (provider === "openai") return label("chat.openaiApiRoute");
  if (provider === "openai-codex") return label("chat.chatgptSubscriptionRoute");
  return provider;
}

function sameModel(a: ModelRef, b: ModelRef): boolean {
  return a.provider === b.provider && a.modelId === b.modelId;
}

function defaultModelFromRoles(roles: readonly ModelRoleAssignment[]): ModelRef | undefined {
  const resolved = roles.find((role) => role.role === "default")?.resolved;
  return resolved ? { provider: resolved.provider, modelId: resolved.modelId } : undefined;
}

/** Clear an explicit selection and return the OMP default role's model. */
export function resetModelOverride(input: ModelSelectorInput): ModelSelectorInput | null {
  const defaultModel = defaultModelFromRoles(input.roles);
  if (!input.explicitModelOverride || !defaultModel) return null;
  return { ...input, currentModel: defaultModel, explicitModelOverride: false };
}

/** A model option keeps the provider in its identity. */
export interface ModelOption extends ModelRef {
  name: string;
}

export function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;
  return options.filter((option) => `${option.name} ${option.modelId}`.toLocaleLowerCase().includes(normalizedQuery));
}

/** Build the selector without React, the DOM, or an OMP runtime. */
export function buildModelSelectorState(input: ModelSelectorInput, label: (key: string) => string) {
  const defaultRole = input.roles.find((role) => role.role === "default");
  const defaultModel = defaultModelFromRoles(input.roles);
  const currentModel = input.currentModel ?? defaultModel;

  const registry = new Map<string, { option: ModelOption; levels: Set<string> }>();
  for (const model of input.registry) {
    const key = modelKey({ provider: model.provider, modelId: model.id });
    const entry = registry.get(key) ?? {
      option: { provider: model.provider, modelId: model.id, name: model.name },
      levels: new Set<string>(),
    };
    for (const level of model.thinkingLevels) entry.levels.add(level);
    registry.set(key, entry);
  }

  const models = [...registry.values()].map((entry) => entry.option).sort((a, b) => (
    MODEL_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId)
      || MODEL_COLLATOR.compare(a.provider, b.provider)
      || MODEL_COLLATOR.compare(a.modelId, b.modelId)
  ));
  const filteredModels = filterModelOptions(models, input.filter ?? "");
  const modelsByProvider: { provider: string; label: string; options: ModelOption[] }[] = [];
  for (const option of filteredModels) {
    const group = modelsByProvider.find((candidate) => candidate.provider === option.provider);
    if (group) group.options.push(option);
    else modelsByProvider.push({ provider: option.provider, label: routeLabel(option.provider, label), options: [option] });
  }

  const selections: PowerSelection[] = [];
  for (const { option, levels } of registry.values()) {
    for (const thinkingLevel of THINKING_STEP_ORDER) {
      if (!levels.has(thinkingLevel)) continue;
      const effort = thinkingLevel === "off" ? "none" : thinkingLevel;
      const effortLabel = label(EFFORT_LABEL_KEYS[thinkingLevel]);
      selections.push({
        id: selectionId(option, effort),
        model: { provider: option.provider, modelId: option.modelId },
        thinkingLevel,
        effort,
        effortLabel,
        sliderLabel: label(SLIDER_LABEL_KEYS[thinkingLevel] ?? EFFORT_LABEL_KEYS[thinkingLevel]),
      });
    }
  }

  const steps = currentModel ? selections.filter((selection) => sameModel(selection.model, currentModel)) : [];
  const pin = currentModel && input.thinkingLevelPins?.[modelKey(currentModel)];
  const configuredLevel = input.currentThinkingLevel;
  const currentLevel = configuredLevel && configuredLevel !== "auto" && configuredLevel !== "inherit"
    ? configuredLevel
    : pin ?? (currentModel && defaultModel && sameModel(currentModel, defaultModel) ? defaultRole?.resolved?.thinkingLevel : undefined);
  const currentStep = steps.find((step) => step.thinkingLevel === currentLevel);
  const selectionIds = new Set(selections.map((selection) => selection.id));
  const modelRowsByProvider = modelsByProvider.map((group) => ({
    ...group,
    options: group.options.map((option) => {
      const matchingId = currentStep && selectionId(option, currentStep.effort);
      const optionSelectionId = matchingId && selectionIds.has(matchingId) ? matchingId : undefined;
      return {
        ...option,
        selectionId: optionSelectionId,
        selected: Boolean(optionSelectionId && optionSelectionId === currentStep?.id),
      };
    }),
  }));
  const pinnedDefaultLevel = defaultRole?.resolved?.thinkingLevel;
  const pinnedDefaultEffort = pinnedDefaultLevel === "off" ? "none"
    : THINKING_STEP_ORDER.includes(pinnedDefaultLevel as ThinkingStep) ? pinnedDefaultLevel as ReferenceEffort
    : undefined;
  const defaultSelectionId = defaultModel && currentStep
    ? selectionId(defaultModel, pinnedDefaultEffort ?? currentStep.effort)
    : undefined;
  const roleRows = input.roles.filter((role) => !role.hidden && role.resolved);
  const activeRole = currentModel
    ? roleRows.find((role) => role.resolved && sameModel(role.resolved, currentModel))
    : undefined;

  return {
    models,
    filteredModels,
    modelsByProvider,
    modelRowsByProvider,
    roleRows,
    activeRole,
    selections,
    currentModel,
    currentRouteLabel: currentModel ? routeLabel(currentModel.provider, label) : undefined,
    currentStep,
    steps,
    defaultRow: defaultModel ? {
      label: label("chat.modelDefault"),
      description: label("chat.modelDefaultDescription"),
      model: defaultModel,
    } : undefined,
    defaultRowSelected: Boolean(!input.explicitModelOverride && defaultSelectionId && defaultSelectionId === currentStep?.id),
    reset: input.explicitModelOverride && defaultModel ? { model: defaultModel, role: "default" as const } : undefined,
  };
}
