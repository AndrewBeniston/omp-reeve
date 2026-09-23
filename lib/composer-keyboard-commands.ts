export type ComposerEnterBehavior = "enter" | "cmdIfMultiline" | "cmdAlways";

export const COMPOSER_ENTER_BEHAVIOR_SETTING_PATH = "web.composer-enter-behavior";
export const COMPOSER_ENTER_BEHAVIOR_STORAGE_KEY = "reeve-composer-enter-behavior";

export const COMPOSER_COMMANDS = [
  { id: "composer.addFiles", title: "Attach files and folders" },
  { id: "composer.openModelPicker", title: "Open model picker" },
  { id: "composer.startDictation", title: "Start dictation" },
  { id: "composer.clear", title: "Clear prompt" },
  { id: "composer.submit", title: "Send message" },
  { id: "composer.steer", title: "Steer prompt" },
  { id: "composer.queue", title: "Queue prompt" },
  { id: "composer.increaseReasoningEffort", title: "Increase reasoning effort" },
  { id: "composer.decreaseReasoningEffort", title: "Decrease reasoning effort" },
  { id: "composer.cycleReasoningEffort", title: "Cycle reasoning effort" },
  { id: "composer.toggleWorktreeMode", title: "Toggle Local/Worktree" },
  { id: "composer.openProjectPicker", title: "Open project picker" },
] as const;

export const UNAVAILABLE_COMPOSER_COMMANDS = [
  { id: "composer.startVoiceMode", title: "Toggle voice chat", reason: "Voice chat is out of scope." },
  { id: "composer.addPhotos", title: "Add photos", reason: "The photo picker is only available in the reference desktop application." },
  { id: "composer.captureAppshot", title: "Capture appshot", reason: "Reeve has no desktop appshot capture service." },
  { id: "composer.submitInBackground", title: "Send message in background", reason: "Reeve has no background-send action." },
  { id: "composer.togglePlanMode", title: "Toggle plan mode", reason: "Reeve has no plan-mode composer action." },
  { id: "composer.toggleFastMode", title: "Toggle Fast mode", reason: "Fast mode is a model setting, not a composer command." },
  { id: "composer.toggleWorkRunLocation", title: "Toggle Cloud/Local", reason: "Reeve has no cloud run-location composer action." },
] as const;

export interface ComposerKeyLike {
  key: string;
  isComposing?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export type DefaultComposerCommand = "composer.addFiles" | "composer.openModelPicker" | "composer.startDictation";

export type ComposerCommandCallback = (command: "composer.toggleWorktreeMode") => void;

export function runComposerCommand(command: "composer.toggleWorktreeMode", callback?: ComposerCommandCallback): boolean {
  if (command !== "composer.toggleWorktreeMode" || !callback) return false;
  callback(command);
  return true;
}

export function matchDefaultComposerCommand(event: ComposerKeyLike): DefaultComposerCommand | null {
  if (event.isComposing) return null;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "u") return "composer.addFiles";
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === "m") return "composer.openModelPicker";
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === "d") return "composer.startDictation";
  return null;
}

export function readComposerEnterBehavior(storedValue: string | null): ComposerEnterBehavior {
  return storedValue === "cmdIfMultiline" || storedValue === "cmdAlways" ? storedValue : "enter";
}

export function writeComposerEnterBehavior(behavior: ComposerEnterBehavior): string {
  return behavior;
}

export function shouldSendWithEnterBehavior({
  key,
  shiftKey,
  metaKey,
  ctrlKey,
  behavior,
  isComposing,
  recentlyComposed,
  isMultiline,
}: ComposerKeyLike & {
  behavior: ComposerEnterBehavior;
  isComposing: boolean;
  recentlyComposed: boolean;
  isMultiline: boolean;
}): boolean {
  if (key !== "Enter" || isComposing || recentlyComposed) return false;
  const commandKey = Boolean(metaKey || ctrlKey);
  if (shiftKey) return false;
  if (behavior === "cmdAlways") return commandKey;
  if (behavior === "cmdIfMultiline") return !isMultiline || commandKey;
  return !commandKey;
}

export function nextThinkingLevel(
  current: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
  direction: "increase" | "decrease" | "cycle",
  steps: readonly string[],
): string | null {
  const index = steps.indexOf(current);
  const step = direction === "decrease" ? -1 : 1;
  if (direction === "cycle" && index < 0) return steps[0] ?? null;
  const next = (index < 0 ? 0 : index) + step;
  if (next < 0 || next >= steps.length) return null;
  return steps[next] ?? null;
}
