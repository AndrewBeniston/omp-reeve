"use client";

import React, { useRef, useState, useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, forwardRef } from "react";
import type { BuiltinSlashCommandResult, CompactResultInfo, QueuedMessages } from "@/hooks/useAgentSession";
import type { ModelRoleAssignment, PluginPackageInfo, PluginsResponse, ProjectTrustStatus, SkillInfo, SkillsResponse } from "@/lib/api-types";
import type { ContextUsage, SessionStatsInfo, SlashCommandInfo } from "@/lib/omp-types";
import type { QueuedMessageDraft } from "@/lib/queued-message-types";
import type { ApprovalMode } from "@/lib/approval-mode";
import type { SubagentSnapshot, TextContent, UserMessage } from "@/lib/types";
import {
  clearDraft,
  getDraft,
  mergeRestoredSubmissionDraft,
  mergeRestoredSubmissionText,
  rekeyDraft as rekeyStoredDraft,
  setDraft,
  type ChatDraftImage,
} from "@/lib/draft-store";
import {
  MAX_ATTACHED_IMAGE_BYTES,
  isBase64ImageWithinLimits,
} from "@/lib/image-attachments";
import {
  buildEntriesFromFiles, extractAtQuery, filterFileEntries,
  type AtQueryMatch, type FileIndexEntry,
} from "@/lib/file-fuzzy";
import {
  buildAtMentionSections,
  buildComposerAddSections,
  buildRecognizedComposerMentions,
  buildSlashSections,
  buildSlashSubcommandSections,
  extractSlashQuery,
  flattenSuggestionSections,
  resolveAutocompleteSelection,
  type ComposerSuggestion,
} from "@/lib/composer-intelligence";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getAttachmentPicker } from "@/lib/desktop-attachments";
import { useI18n } from "@/hooks/useI18n";
import { PRESET_DEFAULT, PRESET_FULL } from "@/lib/tool-presets";
import {
  ComposerFloatingGeometry,
  ComposerFrame,
} from "./chat/ComposerFrame";
import { ComposerAutocomplete } from "./chat/ComposerAutocomplete";
import { ComposerAddMenu } from "./chat/ComposerAddMenu";
import { CommandArgumentsDialog } from "./chat/CommandArgumentsDialog";
import { ComposerEditor, type ComposerEditorHandle } from "./chat/ComposerEditor";
import { PausedQueueSubmitDialog } from "./chat/PausedQueueSubmitDialog";
import { ApprovalModeSelector } from "./chat/ApprovalModeSelector";
import { SendArrowIcon, StopSquareIcon } from "./navigation/CodexIcons";
import { Menu, MenuItem } from "./ui/Menu";
import { Tooltip } from "./ui/Tooltip";
import cssModule from "./chat/composer.module.css";

export { ModelErrorBanner, ModelScopeWarningBanner } from "./chat/ComposerFrame";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

export function resolveStreamingSubmissionMode(queueingEnabled: boolean, useOppositeMode: boolean): "steer" | "followUp" {
  const defaultMode = queueingEnabled ? "followUp" : "steer";
  if (!useOppositeMode) return defaultMode;
  return defaultMode === "followUp" ? "steer" : "followUp";
}

export function shouldConfirmPausedQueueSubmission(queue: QueuedMessages | null | undefined, isStreaming: boolean): boolean {
  return !isStreaming && Boolean(queue?.paused && queue.items.length > 0);
}

export async function dispatchPausedQueueSubmission({
  clearQueue,
  onResolve,
  onSend,
}: {
  clearQueue: boolean;
  onResolve: (clearQueue: boolean) => Promise<void>;
  onSend: () => Promise<void>;
}): Promise<void> {
  await onResolve(clearQueue);
  await onSend();
}

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

interface Props {
  requestPending?: boolean;
  onSend: (message: string, images?: AttachedImage[]) => void;
  onAbort: () => void;
  onSteer?: (message: string, images?: AttachedImage[]) => void;
  onFollowUp?: (message: string, images?: AttachedImage[]) => void;
  onPromptWithStreamingBehavior?: (message: string, behavior: "steer" | "followUp", images?: AttachedImage[]) => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  isAutoModelSelection?: boolean;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  modelError?: string | null;
  /** Diagnostics from resolving `enabledModels`, e.g. a pattern that matched nothing. */
  modelScopeWarnings?: string[];
  onModelChange?: (provider: string, modelId: string) => void;
  /** omp's model roles (default/smol/slow/plan/commit/…) with their assignments. */
  modelRoles?: ModelRoleAssignment[];
  onRoleModelChange?: (role: string) => void;
  modelSwitching?: boolean;
  onCompact?: () => void;
  onAbortCompaction?: () => void;
  isCompacting?: boolean;
  compactError?: string | null;
  compactResult?: CompactResultInfo | null;
  toolPreset?: "none" | "default" | "full";
  onToolPresetChange?: (preset: "none" | "default" | "full") => void;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max") => void;
  onCycleThinkingLevel?: () => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  fastModeEnabled?: boolean;
  fastModeAvailable?: boolean;
  onFastModeChange?: (enabled: boolean) => void;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  queuedMessages?: QueuedMessages | null;
  onDeleteQueuedMessage?: (id: string) => Promise<string | null>;
  onUndoDeletedQueuedMessage?: (undoToken: string) => Promise<void>;
  onEditQueuedMessage?: (id: string) => Promise<QueuedMessageDraft | null>;
  onCancelQueuedMessageEdit?: (editToken: string) => Promise<void>;
  onCompleteQueuedMessageEdit?: (editToken: string, message: string, images?: AttachedImage[]) => Promise<void>;
  onReorderQueuedMessages?: (ids: string[]) => Promise<void>;
  onSendQueuedMessageNow?: (id: string) => Promise<void>;
  onResumeQueuedMessages?: () => Promise<void>;
  onResolvePausedQueueSubmission?: (clearQueue: boolean) => Promise<void>;
  inputHistory?: string[];
  subagents?: SubagentSnapshot[];
  slashCommands?: SlashCommandInfo[];
  slashCommandsLoading?: boolean;
  onLoadSlashCommands?: () => Promise<SlashCommandInfo[]> | SlashCommandInfo[];
  onBuiltinCommand?: (message: string) => Promise<BuiltinSlashCommandResult>;
  onAudioUnlock?: () => void;
  draftKey?: string;
  imageInputId?: string;
  /** Session working directory — enables the @ file autocomplete menu */
  cwd?: string | null;
  contextUsage?: ContextUsage | null;
  sessionStats?: SessionStatsInfo | null;
  projectTrust?: ProjectTrustStatus | null;
  onProjectTrustClick?: () => void;
  approvalMode?: ApprovalMode | null;
  approvalModeChanging?: boolean;
  approvalModeError?: string | null;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  replaceMessage: (message: UserMessage) => void;
  prependText: (text: string) => void;
  addImages: (files: File[]) => void;
  rekeyDraft: (previousKey: string, nextKey: string) => void;
  restoreSubmission: (text: string, images?: ChatDraftImage[], targetDraftKey?: string) => void;
}

export const COMPOSER_IMAGE_INPUT_ID = "reeve-composer-image-input";

const TOOL_PRESETS = ["off", "default", "full"] as const;
const TOOL_PRESET_MAP: Record<"off" | "default" | "full", "none" | "default" | "full"> = { off: "none", default: "default", full: "full" };
const DEFAULT_TOOL_LABEL = PRESET_DEFAULT.join(" · ");
const FULL_TOOL_ADDITIONS = PRESET_FULL.filter((name) => !PRESET_DEFAULT.includes(name)).join(" · ");
const COMPOSITION_END_ENTER_GRACE_MS = 100;
const COMPOSER_MAX_ATTACHED_IMAGES = 5;
const FOLLOW_UP_QUEUE_MODE_KEY = "reeve-follow-up-queue-mode";
const MODEL_FILTER_THRESHOLD = 8;
const MODEL_OPTION_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const EMPTY_SUBAGENTS: SubagentSnapshot[] = [];

function compareModelOptions(a: ModelOption, b: ModelOption): number {
  return MODEL_OPTION_COLLATOR.compare(a.name || a.modelId, b.name || b.modelId)
    || MODEL_OPTION_COLLATOR.compare(a.provider, b.provider)
    || MODEL_OPTION_COLLATOR.compare(a.modelId, b.modelId);
}

export function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) => (
    `${option.name} ${option.modelId}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  ));
}

export function getComposerTextareaHeight(scrollHeight: number): string {
  return `${scrollHeight}px`;
}

export function getAcceptedImageFiles<T extends Pick<File, "type" | "size">,>(
  files: T[],
  attachedCount: number,
  pendingCount: number,
): T[] {
  const remaining = Math.max(0, COMPOSER_MAX_ATTACHED_IMAGES - attachedCount - pendingCount);
  return files
    .filter((file) => file.type.startsWith("image/") && file.size <= MAX_ATTACHED_IMAGE_BYTES)
    .slice(0, remaining);
}

export function shouldSubmitComposer({
  key,
  shiftKey,
  isComposing,
  recentlyComposed,
}: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  recentlyComposed: boolean;
}): boolean {
  return key === "Enter" && !shiftKey && !isComposing && !recentlyComposed;
}

export function shouldAbortComposer({
  key,
  isComposing,
  isStreaming,
  menuOpen,
}: {
  key: string;
  isComposing: boolean;
  isStreaming: boolean;
  menuOpen: boolean;
}): boolean {
  return key === "Escape" && !isComposing && isStreaming && !menuOpen;
}

export function shouldCycleComposerEffort({
  key,
  shiftKey,
  isComposing,
  menuOpen,
  canCycle,
}: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  menuOpen: boolean;
  canCycle: boolean;
}): boolean {
  return key === "Tab" && shiftKey && !isComposing && !menuOpen && canCycle;
}

interface IdleSubmissionOptions {
  value: string;
  images: AttachedImage[];
  isStreaming: boolean;
  onBuiltinCommand?: (message: string) => Promise<BuiltinSlashCommandResult>;
  onBuiltinAction?: (action: "openSessionStats") => void;
  onAudioUnlock?: () => void;
  clearInput: () => void;
  onSend: Props["onSend"];
}

export async function dispatchIdleSubmission({
  value,
  images,
  isStreaming,
  onBuiltinCommand,
  onBuiltinAction,
  onAudioUnlock,
  clearInput,
  onSend,
}: IdleSubmissionOptions): Promise<"ignored" | "command" | "sent"> {
  const message = value.trim();
  if ((!message && images.length === 0) || isStreaming) return "ignored";
  onAudioUnlock?.();
  if (images.length === 0 && message.startsWith("/") && onBuiltinCommand) {
    const result = await onBuiltinCommand(message);
    if (result.handled) {
      if (result.action) onBuiltinAction?.(result.action);
      if (!result.error) {
        clearInput();
        if (result.prompt) onSend(result.prompt);
      }
      return "command";
    }
  }
  clearInput();
  onSend(message, images.length > 0 ? images : undefined);
  return "sent";
}

interface StreamingSubmissionOptions {
  value: string;
  images: AttachedImage[];
  mode: "steer" | "followUp";
  onPromptWithStreamingBehavior?: Props["onPromptWithStreamingBehavior"];
  onSteer?: Props["onSteer"];
  onFollowUp?: Props["onFollowUp"];
  onAudioUnlock?: () => void;
  clearInput: () => void;
}

export function dispatchStreamingSubmission({
  value,
  images,
  mode,
  onPromptWithStreamingBehavior,
  onSteer,
  onFollowUp,
  onAudioUnlock,
  clearInput,
}: StreamingSubmissionOptions): "ignored" | "steered" | "followed-up" {
  const message = value.trim();
  if (!message && images.length === 0) return "ignored";
  onAudioUnlock?.();
  if (message.startsWith("/") && images.length === 0 && onPromptWithStreamingBehavior) {
    clearInput();
    onPromptWithStreamingBehavior(message, mode);
    return mode === "steer" ? "steered" : "followed-up";
  }
  if (mode === "steer" && onSteer) {
    clearInput();
    onSteer(message, images.length ? images : undefined);
    return "steered";
  }
  if (mode === "followUp" && onFollowUp) {
    clearInput();
    onFollowUp(message, images.length ? images : undefined);
    return "followed-up";
  }
  return "ignored";
}

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const THINKING_LEVEL_LABEL_KEYS: Record<typeof THINKING_LEVELS[number], string> = {
  auto: "chat.effortAuto",
  off: "chat.effortNone",
  minimal: "chat.effortMinimal",
  low: "chat.effortLight",
  medium: "chat.effortMedium",
  high: "chat.effortHigh",
  xhigh: "chat.effortExtraHigh",
  max: "chat.effortUltra",
};

type ModelSubmenu = "model" | "effort" | "speed" | "advanced";

function ModelSelectionMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.selectionMark} aria-hidden="true">
      <polyline points="1.5 5 4 7.5 8.5 2.5" />
    </svg>
  );
}

function SubmenuSelectionCheck() {
  return (
    <svg className={styles.submenuCheck} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3.5 8 3 3 6-7" />
    </svg>
  );
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return tokens.toLocaleString();
}


type LocalBuiltinSlashCommand = {
  name: string;
  descriptionKey: string;
  icon: string;
  source: "builtin";
};

const BUILTIN_SLASH_COMMANDS: LocalBuiltinSlashCommand[] = [
  { name: "compact", descriptionKey: "chat.commandCompact", icon: "compress", source: "builtin" },
  { name: "reload", descriptionKey: "chat.commandReload", icon: "restart", source: "builtin" },
  { name: "name", descriptionKey: "chat.commandName", icon: "pencil", source: "builtin" },
  { name: "session", descriptionKey: "chat.commandSession", icon: "session", source: "builtin" },
  { name: "copy", descriptionKey: "chat.commandCopy", icon: "copy", source: "builtin" },
];

function imageToDraftImage(image: AttachedImage): ChatDraftImage {
  return { data: image.data, mimeType: image.mimeType };
}

function draftImageToAttachedImage(image: ChatDraftImage): AttachedImage {
  return {
    ...image,
    previewUrl: `data:${image.mimeType};base64,${image.data}`,
  };
}

function draftImagesToAttachedImages(images: ChatDraftImage[] | undefined): AttachedImage[] {
  return (images ?? [])
    .filter(isBase64ImageWithinLimits)
    .slice(0, COMPOSER_MAX_ATTACHED_IMAGES)
    .map(draftImageToAttachedImage);
}

export function canRestoreUserMessage(
  value: string,
  attachedImageCount: number,
  pendingImageCount: number,
): boolean {
  return !value.trim() && attachedImageCount === 0 && pendingImageCount === 0;
}

export function getUserMessageText(message: UserMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function getUserMessageDraftImages(message: UserMessage): ChatDraftImage[] {
  if (typeof message.content === "string") return [];
  return message.content.flatMap((block) => {
    if (block.type !== "image") return [];

    // Support both the current nested image format and older flat pi-ai entries.
    const flat = block as unknown as { data?: unknown; mimeType?: unknown };
    const data = block.source?.type === "base64" ? block.source.data : flat.data;
    const mimeType = block.source?.type === "base64" ? block.source.media_type : flat.mimeType;
    if (typeof data !== "string" || typeof mimeType !== "string") return [];

    const image = { data, mimeType };
    return isBase64ImageWithinLimits(image) ? [image] : [];
  });
}

function revokeImagePreview(image: AttachedImage): void {
  if (image.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  imageInputId = COMPOSER_IMAGE_INPUT_ID,
  requestPending = false,
  onSend, onAbort, onSteer, onFollowUp, isStreaming, model, isAutoModelSelection, modelNames, modelList, modelError, modelScopeWarnings, onModelChange,
  modelRoles, onRoleModelChange, modelSwitching,
  onCompact, onAbortCompaction, isCompacting, compactError, compactResult, toolPreset, onToolPresetChange,
  thinkingLevel, onThinkingLevelChange, onCycleThinkingLevel, availableThinkingLevels, thinkingLevelMap,
  fastModeEnabled = false, fastModeAvailable = false, onFastModeChange,
  retryInfo, queuedMessages, inputHistory = [], subagents = EMPTY_SUBAGENTS,
  onDeleteQueuedMessage, onUndoDeletedQueuedMessage, onEditQueuedMessage,
  onCancelQueuedMessageEdit, onCompleteQueuedMessageEdit, onReorderQueuedMessages,
  onSendQueuedMessageNow, onResumeQueuedMessages, onResolvePausedQueueSubmission,
  slashCommands, slashCommandsLoading, onLoadSlashCommands,
  onBuiltinCommand,
  onAudioUnlock,
  onPromptWithStreamingBehavior,
  draftKey,
  cwd,
  contextUsage,
  sessionStats,
  projectTrust,
  onProjectTrustClick,
  approvalMode = null,
  approvalModeChanging = false,
  approvalModeError = null,
  onApprovalModeChange = () => {},
}: Props, ref) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [value, setValue] = useState(() => (draftKey ? getDraft(draftKey)?.value ?? "" : ""));
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [attachmentPickerError, setAttachmentPickerError] = useState<string | null>(null);
  const [commandActionError, setCommandActionError] = useState<string | null>(null);
  const [commandActionPending, setCommandActionPending] = useState(false);
  const [pendingAddCommand, setPendingAddCommand] = useState<ComposerSuggestion | null>(null);
  const [modelDropdownRect, setModelDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [modelSubmenu, setModelSubmenu] = useState<ModelSubmenu | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [sessionCommandStatus, setSessionCommandStatus] = useState<string | null>(null);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(() => (
    draftKey ? draftImagesToAttachedImages(getDraft(draftKey)?.images) : []
  ));
  const [queueingEnabled, setQueueingEnabled] = useState(true);
  const [editingQueuedMessage, setEditingQueuedMessage] = useState<QueuedMessageDraft | null>(null);
  const [lastQueueUndoToken, setLastQueueUndoToken] = useState<string | null>(null);
  const [debugQueuedMessages, setDebugQueuedMessages] = useState<QueuedMessages | null>(null);
  const [pausedQueueSubmitOpen, setPausedQueueSubmitOpen] = useState(false);
  const [pausedQueueSubmitBusy, setPausedQueueSubmitBusy] = useState(false);
  const [pausedQueueSubmitError, setPausedQueueSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (contextUsage) setSessionCommandStatus(null);
  }, [contextUsage]);
  const trimmedValue = value.trimStart();
  const bashMode = attachedImages.length === 0 && trimmedValue.startsWith("!");
  const bashExcluded = bashMode && trimmedValue.startsWith("!!");
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [atQuery, setAtQuery] = useState<AtQueryMatch | null>(null);
  const [atMenuOpen, setAtMenuOpen] = useState(false);
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [historyActiveIndex, setHistoryActiveIndex] = useState(0);
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const [fileIndex, setFileIndex] = useState<{ cwd: string; entries: FileIndexEntry[]; truncated: boolean } | null>(null);
  const [fileIndexLoading, setFileIndexLoading] = useState(false);
  const [atServerResult, setAtServerResult] = useState<{ cwd: string; query: string; matches: FileIndexEntry[] } | null>(null);
  const [composerResourcesState, setComposerResourcesState] = useState<{
    cwd: string;
    loading: boolean;
    skills: SkillInfo[];
    plugins: PluginPackageInfo[];
  } | null>(null);
  const composerSkills = useMemo(
    () => cwd && composerResourcesState?.cwd === cwd ? composerResourcesState.skills : [],
    [composerResourcesState, cwd],
  );
  const composerPlugins = useMemo(
    () => cwd && composerResourcesState?.cwd === cwd ? composerResourcesState.plugins : [],
    [composerResourcesState, cwd],
  );
  const mentionablePlugins = useMemo(
    () => toolPreset === "none" ? [] : composerPlugins,
    [composerPlugins, toolPreset],
  );
  const composerResourcesLoading = Boolean(cwd && composerResourcesState?.cwd === cwd && composerResourcesState.loading);

  const textareaRef = useRef<ComposerEditorHandle>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownPanelRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelRowRef = useRef<HTMLButtonElement>(null);
  const effortRowRef = useRef<HTMLButtonElement>(null);
  const speedRowRef = useRef<HTMLButtonElement>(null);
  const advancedRowRef = useRef<HTMLButtonElement>(null);
  const modelFilterRef = useRef<HTMLInputElement>(null);
  const contextTriggerRef = useRef<HTMLButtonElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const controlsMenuRef = useRef<HTMLDivElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const slashCommandsRequestedRef = useRef(false);
  const historyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileIndexMetaRef = useRef<{ cwd: string; fetchedAt: number } | null>(null);
  const fileIndexFetchingRef = useRef<string | null>(null);
  const draftKeyRef = useRef(draftKey);
  const valueRef = useRef(value);
  const attachedImagesRef = useRef(attachedImages);
  const pendingImageCountRef = useRef(0);
  const editingQueuedMessageRef = useRef<QueuedMessageDraft | null>(null);
  valueRef.current = value;
  attachedImagesRef.current = attachedImages;
  editingQueuedMessageRef.current = editingQueuedMessage;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FOLLOW_UP_QUEUE_MODE_KEY);
      if (saved === "queue" || saved === "steer") setQueueingEnabled(saved === "queue");
    } catch {
      // Keep Queue as the default when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("queueDebug")) return;
    setDebugQueuedMessages({
      paused: params.has("queuePausedDebug"),
      items: [
        { id: "debug-queue-1", kind: "followUp", text: "Sorry, I gave you two different instructions.", imageCount: 0 },
        { id: "debug-queue-2", kind: "followUp", text: "Check the exact spacing before changing the Composer.", imageCount: 0 },
        { id: "debug-queue-3", kind: "followUp", text: "Then summarize the verified result.", imageCount: 0 },
      ],
    });
  }, []);

  const changeQueueingEnabled = useCallback((enabled: boolean) => {
    setQueueingEnabled(enabled);
    try {
      window.localStorage.setItem(FOLLOW_UP_QUEUE_MODE_KEY, enabled ? "queue" : "steer");
    } catch {
      // The current page still keeps the selected mode.
    }
  }, []);

  useEffect(() => () => {
    const edit = editingQueuedMessageRef.current;
    if (edit) void onCancelQueuedMessageEdit?.(edit.editToken);
  }, [draftKey, onCancelQueuedMessageEdit]);

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = getAcceptedImageFiles(
      files,
      attachedImagesRef.current.length,
      pendingImageCountRef.current,
    );
    if (imageFiles.length === 0) return;
    pendingImageCountRef.current += imageFiles.length;
    try {
      const newImages = await Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<AttachedImage>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1];
                resolve({ data: base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }),
        ),
      );
      setAttachedImages((previous) => {
        const accepted = newImages.slice(0, Math.max(0, COMPOSER_MAX_ATTACHED_IMAGES - previous.length));
        newImages.slice(accepted.length).forEach(revokeImagePreview);
        const next = [...previous, ...accepted];
        attachedImagesRef.current = next;
        return next;
      });
    } finally {
      pendingImageCountRef.current -= imageFiles.length;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    insertIfEmpty(text: string) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (current.trim()) return;
      valueRef.current = text;
      setValue(text);
      setAtQuery(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
      });
    },
    replaceMessage(message: UserMessage) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (!canRestoreUserMessage(current, attachedImagesRef.current.length, pendingImageCountRef.current)) return;

      const restoredText = getUserMessageText(message);
      const restoredImages = draftImagesToAttachedImages(getUserMessageDraftImages(message));
      valueRef.current = restoredText;
      attachedImagesRef.current = restoredImages;
      setValue(restoredText);
      setAtQuery(null);
      setHistoryMenuOpen(false);
      setAttachedImages((prev) => {
        prev.forEach(revokeImagePreview);
        return restoredImages;
      });
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
      });
    },
    prependText(text: string) {
      if (!text.trim()) return;
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      // Mirrors the TUI's queue restore: queued text first, then whatever
      // the user already typed, separated by a blank line.
      const combined = [text, current].filter((t) => t.trim()).join("\n\n");
      valueRef.current = combined;
      setValue(combined);
      setAtQuery(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(combined.length, combined.length);
      });
    },
    rekeyDraft(previousKey: string, nextKey: string) {
      if (previousKey === nextKey) return;
      if (draftKeyRef.current !== previousKey) {
        rekeyStoredDraft(previousKey, nextKey);
        return;
      }

      const currentDraft = {
        value: valueRef.current,
        images: attachedImagesRef.current.map(imageToDraftImage),
      };
      const moved = rekeyStoredDraft(previousKey, nextKey, currentDraft) ?? { value: "", images: [] };
      const unchanged = moved.value === currentDraft.value
        && moved.images.length === currentDraft.images.length
        && moved.images.every((image, index) => (
          image.data === currentDraft.images[index]?.data
          && image.mimeType === currentDraft.images[index]?.mimeType
        ));
      draftKeyRef.current = nextKey;
      if (unchanged) return;

      const movedImages = draftImagesToAttachedImages(moved.images);
      valueRef.current = moved.value;
      attachedImagesRef.current = movedImages;
      setValue(moved.value);
      setAttachedImages((current) => {
        current.forEach(revokeImagePreview);
        return movedImages;
      });
      setAtQuery(null);
      setHistoryMenuOpen(false);
    },
    restoreSubmission(text: string, images?: ChatDraftImage[], targetDraftKey?: string) {
      if (!text.trim() && !images?.length) return;

      // clearInput is queued before the submission handler runs. Compose with
      // that queued state so a fast rejection cannot observe stale DOM text and
      // then get overwritten by the clear.
      const currentDraftKey = draftKeyRef.current;
      const destinationDraftKey = targetDraftKey ?? currentDraftKey;
      const targetsCurrentComposer = destinationDraftKey === currentDraftKey;
      const storedDraft = !targetsCurrentComposer && destinationDraftKey
        ? getDraft(destinationDraftKey)
        : null;
      const restoredDraft = mergeRestoredSubmissionDraft(
        text,
        images,
        targetsCurrentComposer ? valueRef.current : (storedDraft?.value ?? ""),
        targetsCurrentComposer
          ? attachedImagesRef.current.map(imageToDraftImage)
          : (storedDraft?.images ?? []),
      );
      // The first optimistic message switches ChatWindow out of its empty-state
      // layout and remounts this component. Persist synchronously so recovery is
      // not lost if this instance is the one being unmounted.
      if (destinationDraftKey) setDraft(destinationDraftKey, restoredDraft);
      if (!targetsCurrentComposer) return;
      const restoredImages = images?.length
        ? [
            ...draftImagesToAttachedImages(images).slice(
              0,
              Math.max(0, COMPOSER_MAX_ATTACHED_IMAGES - attachedImagesRef.current.length),
            ),
            ...attachedImagesRef.current,
          ].slice(0, COMPOSER_MAX_ATTACHED_IMAGES)
        : attachedImagesRef.current;
      // Session promotion can rekey this composer before React flushes the
      // functional updates below, so update the imperative snapshot first.
      valueRef.current = restoredDraft.value;
      attachedImagesRef.current = restoredImages;
      setValue((current) => {
        const restored = mergeRestoredSubmissionText(text, current);
        valueRef.current = restored;
        return restored;
      });
      setAtQuery(null);
      setHistoryMenuOpen(false);
      if (images?.length) {
        setAttachedImages((current) => {
          const available = Math.max(0, COMPOSER_MAX_ATTACHED_IMAGES - current.length);
          const restored = draftImagesToAttachedImages(images)
            .slice(0, available);
          const next = restored.length > 0 ? [...restored, ...current] : current;
          attachedImagesRef.current = next;
          return next;
        });
      }
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    },
    insertText(text: string) {
      const ta = textareaRef.current;
      if (!ta) {
        setValue((v) => v + (v ? " " : "") + text);
        return;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
      const newVal = before + sep + text + after;
      valueRef.current = newVal;
      setValue(newVal);
      setAtQuery(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = start + sep.length + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
      });
    },
    addImages(files: File[]) {
      processImageFiles(files);
    },
  }));

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) revokeImagePreview(removed);
      attachedImagesRef.current = next;
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    attachedImagesRef.current = [];
    setAttachedImages((prev) => {
      prev.forEach(revokeImagePreview);
      return [];
    });
  }, []);

  const clearInput = useCallback(() => {
    valueRef.current = "";
    setValue("");
    setAtQuery(null);
    setHistoryMenuOpen(false);
    if (draftKey) clearDraft(draftKey);
    if (draftKeyRef.current && draftKeyRef.current !== draftKey) clearDraft(draftKeyRef.current);
    clearImages();
    setTextareaHeight("auto");
  }, [clearImages, draftKey]);

  const editQueuedMessage = useCallback(async (id: string) => {
    if (editingQueuedMessageRef.current) return;
    const draft = await onEditQueuedMessage?.(id);
    if (!draft) return;
    const restoredImages = draftImagesToAttachedImages(draft.images);
    valueRef.current = draft.text;
    attachedImagesRef.current = restoredImages;
    setValue(draft.text);
    setAttachedImages((current) => {
      current.forEach(revokeImagePreview);
      return restoredImages;
    });
    setEditingQueuedMessage(draft);
    setAtQuery(null);
    setHistoryMenuOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [onEditQueuedMessage]);

  const cancelQueuedMessageEdit = useCallback(async () => {
    if (!editingQueuedMessage) return;
    await onCancelQueuedMessageEdit?.(editingQueuedMessage.editToken);
    setEditingQueuedMessage(null);
    clearInput();
  }, [clearInput, editingQueuedMessage, onCancelQueuedMessageEdit]);

  const completeQueuedMessageEdit = useCallback(async () => {
    if (!editingQueuedMessage || !onCompleteQueuedMessageEdit) return false;
    const message = value.trim();
    if (!message && attachedImages.length === 0) return false;
    await onCompleteQueuedMessageEdit(
      editingQueuedMessage.editToken,
      message,
      attachedImages.length ? attachedImages : undefined,
    );
    setEditingQueuedMessage(null);
    clearInput();
    return true;
  }, [attachedImages, clearInput, editingQueuedMessage, onCompleteQueuedMessageEdit, value]);

  const deleteQueuedMessage = useCallback(async (id: string) => {
    const undoToken = await onDeleteQueuedMessage?.(id);
    if (undoToken) setLastQueueUndoToken(undoToken);
  }, [onDeleteQueuedMessage]);

  const undoDeletedQueuedMessage = useCallback(async () => {
    if (!lastQueueUndoToken || !onUndoDeletedQueuedMessage) return false;
    const undoToken = lastQueueUndoToken;
    setLastQueueUndoToken(null);
    await onUndoDeletedQueuedMessage(undoToken);
    return true;
  }, [lastQueueUndoToken, onUndoDeletedQueuedMessage]);

  useEffect(() => {
    if (!draftKey || draftKeyRef.current !== draftKey) return;
    setDraft(draftKey, {
      value,
      images: attachedImages.map(imageToDraftImage),
    });
  }, [attachedImages, draftKey, value]);

  useEffect(() => {
    const previousDraftKey = draftKeyRef.current;
    if (previousDraftKey === draftKey) return;

    if (previousDraftKey) {
      setDraft(previousDraftKey, {
        value: valueRef.current,
        images: attachedImagesRef.current.map(imageToDraftImage),
      });
    }

    const draft = draftKey ? getDraft(draftKey) : null;
    draftKeyRef.current = draftKey;
    const nextValue = draft?.value ?? "";
    const nextImages = draftImagesToAttachedImages(draft?.images);
    valueRef.current = nextValue;
    attachedImagesRef.current = nextImages;
    setValue(nextValue);
    setAtQuery(null);
    setHistoryMenuOpen(false);
    setAttachedImages((prev) => {
      prev.forEach(revokeImagePreview);
      return nextImages;
    });
  }, [draftKey]);

  useLayoutEffect(() => {
    setTextareaHeight("auto");
  }, [value]);

  useLayoutEffect(() => {
    if (!value || textareaHeight !== "auto") return;
    const ta = textareaRef.current;
    if (!ta) return;
    setTextareaHeight(getComposerTextareaHeight(ta.scrollHeight));
  }, [textareaHeight, value]);

  useEffect(() => {
    return () => {
      attachedImagesRef.current.forEach(revokeImagePreview);
    };
  }, []);

  const handleSend = useCallback(async () => {
    await dispatchIdleSubmission({
      value,
      images: attachedImages,
      isStreaming,
      onBuiltinCommand,
      onBuiltinAction: (action) => {
        if (action !== "openSessionStats") return;
        if (contextUsage) {
          setSessionCommandStatus(null);
          setSessionMenuOpen(true);
          return;
        }
        setSessionCommandStatus(t("session.noContextUsage"));
      },
      onAudioUnlock,
      clearInput,
      onSend,
    });
  }, [value, attachedImages, isStreaming, onBuiltinCommand, onSend, clearInput, onAudioUnlock, contextUsage, t]);

  const requestIdleSubmission = useCallback(() => {
    if (shouldConfirmPausedQueueSubmission(debugQueuedMessages ?? queuedMessages, isStreaming)) {
      setPausedQueueSubmitError(null);
      setPausedQueueSubmitOpen(true);
      return;
    }
    void handleSend();
  }, [debugQueuedMessages, queuedMessages, isStreaming, handleSend]);

  const resolvePausedQueueSubmission = useCallback(async (clearQueue: boolean) => {
    setPausedQueueSubmitBusy(true);
    setPausedQueueSubmitError(null);
    try {
      await dispatchPausedQueueSubmission({
        clearQueue,
        onResolve: async (shouldClearQueue) => {
          if (debugQueuedMessages) {
            setDebugQueuedMessages((current) => current ? {
              paused: false,
              items: shouldClearQueue ? [] : current.items,
            } : current);
            return;
          }
          if (!onResolvePausedQueueSubmission) throw new Error("Paused queue submission is unavailable");
          await onResolvePausedQueueSubmission(shouldClearQueue);
        },
        onSend: handleSend,
      });
      setPausedQueueSubmitOpen(false);
    } catch {
      setPausedQueueSubmitError(t("chat.pausedQueueSubmitError"));
    } finally {
      setPausedQueueSubmitBusy(false);
    }
  }, [debugQueuedMessages, handleSend, onResolvePausedQueueSubmission, t]);

  const availableSlashCommands = useMemo<SlashCommandInfo[]>(() => [
    ...(isStreaming ? [] : BUILTIN_SLASH_COMMANDS.map((command) => ({
      name: command.name,
      description: t(command.descriptionKey),
      icon: command.icon,
      source: command.source,
    }))),
    ...(slashCommands ?? []),
  ], [isStreaming, slashCommands, t]);
  const slashContext = useMemo(
    () => extractSlashQuery(value, availableSlashCommands),
    [availableSlashCommands, value],
  );
  const slashQuery = slashContext?.query ?? null;
  const slashSections = useMemo(() => {
    if (!slashContext) return [];
    if (slashContext.parentCommand) {
      return buildSlashSubcommandSections(slashContext.parentCommand, slashContext.query);
    }
    return buildSlashSections({
      query: slashContext.query,
      commands: availableSlashCommands,
      skills: composerSkills,
    });
  }, [availableSlashCommands, composerSkills, slashContext]);
  const displayedSlashCommands = useMemo(
    () => flattenSuggestionSections(slashSections),
    [slashSections],
  );
  const hasInputText = Boolean(value.trim());
  const canQueueStreamingMessage = hasInputText || attachedImages.length > 0;

  // ── @ file autocomplete ──────────────────────────────────────────────────
  // Recomputed from the text before the caret on every change/caret move.
  // Disabled entirely when there is no cwd (new session without a directory).
  const updateAtQuery = useCallback((text: string, cursor: number | null) => {
    if (!cwd) {
      setAtQuery(null);
      return;
    }
    const pos = cursor ?? text.length;
    setAtQuery(extractAtQuery(text.slice(0, pos)));
  }, [cwd]);

  const atQueryText = atQuery?.query ?? null;
  const atLocalMatches: FileIndexEntry[] = React.useMemo(() => (
    atQueryText !== null && fileIndex && fileIndex.cwd === cwd
      ? filterFileEntries(fileIndex.entries, atQueryText)
      : []
  ), [atQueryText, fileIndex, cwd]);

  // When the client index is truncated (repo larger than the index cap),
  // local filtering cannot see deep files, so queries are also ranked
  // server-side against the full listing. Local matches render immediately
  // and are replaced when the (debounced) server result for the current
  // query arrives; stale responses are ignored via the query/cwd tag.
  const needsServerSearch = Boolean(atQueryText && fileIndex?.truncated && fileIndex.cwd === cwd);
  useEffect(() => {
    if (!needsServerSearch || !cwd || !atQueryText) return;
    const fetchCwd = cwd;
    const query = atQueryText;
    const timer = setTimeout(() => {
      fetch(`/api/file-index?cwd=${encodeURIComponent(fetchCwd)}&q=${encodeURIComponent(query)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`file search failed: ${res.status}`);
          return res.json() as Promise<{ matches?: FileIndexEntry[] }>;
        })
        .then((data) => setAtServerResult({ cwd: fetchCwd, query, matches: data.matches ?? [] }))
        .catch(() => {
          // Keep showing local matches; the next keystroke retries.
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [needsServerSearch, atQueryText, cwd]);

  const serverResultInUse = needsServerSearch
    && atServerResult !== null
    && atServerResult.cwd === cwd
    && atServerResult.query === atQueryText;
  const atMatches: FileIndexEntry[] = serverResultInUse ? atServerResult.matches : atLocalMatches;
  const atSections = useMemo(() => atQueryText === null ? [] : buildAtMentionSections({
    query: atQueryText,
    files: atMatches,
    skills: composerSkills,
    plugins: mentionablePlugins,
    subagents,
  }), [atMatches, atQueryText, composerSkills, mentionablePlugins, subagents]);
  const displayedAtSuggestions = useMemo(
    () => flattenSuggestionSections(atSections),
    [atSections],
  );

  // Open/reset the menu whenever the @token appears or changes (mirrors the
  // slash menu: Escape closes it, the next keystroke re-opens it).
  const atTokenKey = atQuery === null ? null : `${atQuery.start}:${atQuery.quoted ? 1 : 0}:${atQuery.query}`;
  useEffect(() => {
    if (atTokenKey === null) {
      setAtMenuOpen(false);
      setAtActiveIndex(0);
      return;
    }
    setAtMenuOpen(true);
    setAtActiveIndex(0);
  }, [atTokenKey]);

  // Preload the file index for fast @ search and restored file chips. The
  // server caches each working directory, so session switches remain cheap.
  useEffect(() => {
    if (!cwd) return;
    const meta = fileIndexMetaRef.current;
    if (meta && meta.cwd === cwd && Date.now() - meta.fetchedAt < 10_000) return;
    if (fileIndexFetchingRef.current === cwd) return;
    fileIndexFetchingRef.current = cwd;
    const fetchCwd = cwd;
    setFileIndexLoading(true);
    fetch(`/api/file-index?cwd=${encodeURIComponent(fetchCwd)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`file index failed: ${res.status}`);
        return res.json() as Promise<{ files?: string[]; truncated?: boolean }>;
      })
      .then((data) => {
        setFileIndex({ cwd: fetchCwd, entries: buildEntriesFromFiles(data.files ?? []), truncated: !!data.truncated });
        fileIndexMetaRef.current = { cwd: fetchCwd, fetchedAt: Date.now() };
      })
      .catch(() => {
        // Leave any previous index in place; next open retries.
        fileIndexMetaRef.current = null;
      })
      .finally(() => {
        fileIndexFetchingRef.current = null;
        setFileIndexLoading(false);
      });
  }, [cwd]);

  const applyAtCompletion = useCallback((suggestion: ComposerSuggestion) => {
    if (!atQuery) return;
    const editor = textareaRef.current;
    if (!editor) return;
    const cursor = editor.selectionStart;
    const quotedEnd = atQuery.quoted && value[cursor] === '"' ? cursor + 1 : cursor;
    if (suggestion.isDirectory) {
      editor.replaceRange(atQuery.start, quotedEnd, suggestion.raw);
      const nextCursor = atQuery.start + suggestion.raw.length - (suggestion.raw.endsWith('"') ? 1 : 0);
      editor.setSelectionRange(nextCursor, nextCursor);
      const nextValue = editor.value;
      setAtQuery(extractAtQuery(nextValue.slice(0, nextCursor)));
      return;
    }
    editor.replaceRangeWithMention(atQuery.start, quotedEnd, suggestion, true);
    setAtQuery(null);
    setAtMenuOpen(false);
    setAtActiveIndex(0);
  }, [atQuery, value]);

  useEffect(() => {
    if (atActiveIndex >= displayedAtSuggestions.length) {
      setAtActiveIndex(Math.max(0, displayedAtSuggestions.length - 1));
    }
  }, [displayedAtSuggestions.length, atActiveIndex]);

  useEffect(() => {
    if (historyActiveIndex >= inputHistory.length) {
      setHistoryActiveIndex(Math.max(0, inputHistory.length - 1));
    }
  }, [inputHistory.length, historyActiveIndex]);

  useEffect(() => {
    historyItemRefs.current.length = inputHistory.length;
  }, [inputHistory.length]);

  useEffect(() => {
    if (!historyMenuOpen) return;
    historyItemRefs.current[historyActiveIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [historyActiveIndex, historyMenuOpen]);

  const applyHistoryInput = useCallback((text: string) => {
    setValue(text);
    setHistoryMenuOpen(false);
    setHistoryActiveIndex(0);
    setAtQuery(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(text.length, text.length);
    });
  }, []);

  const applySlashCommand = useCallback((suggestion: ComposerSuggestion) => {
    const editor = textareaRef.current;
    if (!editor) return;
    editor.replaceRangeWithMention(0, editor.selectionStart, {
      ...suggestion,
      label: suggestion.mentionLabel ?? suggestion.label,
    }, true);
    setSlashMenuOpen(false);
    setSlashActiveIndex(0);
  }, []);

  const sendQueued = useCallback((mode: "steer" | "followUp") => {
    dispatchStreamingSubmission({
      value,
      images: attachedImages,
      mode,
      onPromptWithStreamingBehavior,
      onSteer,
      onFollowUp,
      onAudioUnlock,
      clearInput,
    });
  }, [value, attachedImages, onPromptWithStreamingBehavior, onSteer, onFollowUp, clearInput, onAudioUnlock]);

  const getNextSlashIndex = useCallback((direction: "up" | "down") => {
    const lastIndex = displayedSlashCommands.length - 1;
    if (lastIndex < 0) return 0;
    return direction === "down"
      ? Math.min(lastIndex, slashActiveIndex + 1)
      : Math.max(0, slashActiveIndex - 1);
  }, [displayedSlashCommands.length, slashActiveIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const recentlyComposed = Date.now() - lastCompositionEndAtRef.current < COMPOSITION_END_ENTER_GRACE_MS;
      const isComposing =
        isComposingRef.current ||
        e.isComposing ||
        e.keyCode === 229;

      if (e.key === "Enter" && !e.shiftKey && (isComposing || recentlyComposed)) {
        if (recentlyComposed) e.preventDefault();
        return;
      }

      if (historyMenuOpen && !isComposing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHistoryActiveIndex((i) => Math.min(Math.max(0, inputHistory.length - 1), i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHistoryActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setHistoryMenuOpen(false);
          return;
        }
        if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) && inputHistory[historyActiveIndex]) {
          e.preventDefault();
          applyHistoryInput(inputHistory[historyActiveIndex]);
          return;
        }
      }

      if (slashMenuOpen && slashQuery !== null) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashActiveIndex(() => getNextSlashIndex("down"));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashActiveIndex(() => getNextSlashIndex("up"));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
        const selection = resolveAutocompleteSelection(e.key, e.shiftKey, displayedSlashCommands, slashActiveIndex);
        if (selection.captured) {
          e.preventDefault();
          if (selection.item) applySlashCommand(selection.item);
          return;
        }
      }

      // @ file menu — skip while composing so IME candidate navigation
      // (arrows/Enter/Tab) is never intercepted.
      if (atMenuOpen && atQuery !== null && !isComposing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAtActiveIndex((i) => Math.min(Math.max(0, displayedAtSuggestions.length - 1), i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAtActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAtMenuOpen(false);
          return;
        }
        const selection = resolveAutocompleteSelection(e.key, e.shiftKey, displayedAtSuggestions, atActiveIndex);
        if (selection.captured) {
          e.preventDefault();
          if (selection.item) applyAtCompletion(selection.item);
          return;
        }
      }

      if (shouldCycleComposerEffort({
        key: e.key,
        shiftKey: e.shiftKey,
        isComposing,
        menuOpen: historyMenuOpen || slashMenuOpen || atMenuOpen,
        canCycle: Boolean(onCycleThinkingLevel),
      })) {
        e.preventDefault();
        onCycleThinkingLevel?.();
        return;
      }

      if (e.key === "ArrowUp" && !isComposing && !isStreaming && inputHistory.length > 0 && value.trim().length === 0) {
        e.preventDefault();
        setSlashMenuOpen(false);
        setAtMenuOpen(false);
        setHistoryActiveIndex(inputHistory.length - 1);
        setHistoryMenuOpen(true);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && value.length === 0 && lastQueueUndoToken) {
        e.preventDefault();
        void undoDeletedQueuedMessage();
        return;
      }

      if (editingQueuedMessage && e.key === "Escape" && !isComposing) {
        e.preventDefault();
        void cancelQueuedMessageEdit();
        return;
      }

      // Esc stops the agent when no slash/@/history menu or IME composition is active.
      if (e.key === "Escape" && !isComposing && isStreaming && onAbort) {
        e.preventDefault();
        onAbort();
        return;
      }

      if (
        e.key === "Enter"
        && e.shiftKey
        && (e.metaKey || e.ctrlKey)
        && !isComposing
        && isStreaming
        && (onSteer || onFollowUp)
      ) {
        e.preventDefault();
        if (editingQueuedMessage) void completeQueuedMessageEdit();
        else sendQueued(resolveStreamingSubmissionMode(queueingEnabled, true));
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (editingQueuedMessage) {
          void completeQueuedMessageEdit();
        } else if (isStreaming && (onSteer || onFollowUp)) {
          sendQueued(resolveStreamingSubmissionMode(queueingEnabled, false));
        } else {
          requestIdleSubmission();
        }
      }
    },
    [isStreaming, onSteer, onFollowUp, onAbort, onCycleThinkingLevel, slashMenuOpen, slashQuery, displayedSlashCommands, slashActiveIndex, applySlashCommand, sendQueued, requestIdleSubmission, getNextSlashIndex, atMenuOpen, atQuery, displayedAtSuggestions, atActiveIndex, applyAtCompletion, historyMenuOpen, inputHistory, historyActiveIndex, applyHistoryInput, value, lastQueueUndoToken, undoDeletedQueuedMessage, editingQueuedMessage, cancelQueuedMessageEdit, completeQueuedMessageEdit, queueingEnabled]
  );

  const handlePasteImages = useCallback((files: File[]) => {
    if (!files.length) return false;
    processImageFiles(files);
    return true;
  }, [processImageFiles]);

  useEffect(() => {
    if (slashQuery === null) {
      setSlashMenuOpen(false);
      setSlashActiveIndex(0);
      return;
    }
    setSlashMenuOpen(true);
    setSlashActiveIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    slashCommandsRequestedRef.current = false;
  }, [draftKey]);

  useEffect(() => {
    const existingSession = Boolean(draftKey && !draftKey.startsWith("new:"));
    if ((!existingSession && slashQuery === null) || !onLoadSlashCommands) return;
    if (!slashCommandsRequestedRef.current) {
      slashCommandsRequestedRef.current = true;
      Promise.resolve(onLoadSlashCommands()).catch(() => {
        slashCommandsRequestedRef.current = false;
      });
    }
  }, [draftKey, onLoadSlashCommands, slashQuery]);

  // Codex uses one resource model for inline slash and @ suggestions. Reeve
  // loads OMP skills and plugins together so both menus show identical names.
  useEffect(() => {
    if (!cwd) return;
    const requestCwd = cwd;
    let cancelled = false;
    setComposerResourcesState({
      cwd: requestCwd,
      loading: true,
      skills: [],
      plugins: [],
    });
    Promise.allSettled([
      fetch(`/api/skills?cwd=${encodeURIComponent(requestCwd)}`).then(async (response) => {
        if (!response.ok) throw new Error(`skills fetch failed: ${response.status}`);
        return response.json() as Promise<Partial<SkillsResponse>>;
      }),
      fetch(`/api/plugins?cwd=${encodeURIComponent(requestCwd)}`).then(async (response) => {
        if (!response.ok) throw new Error(`plugins fetch failed: ${response.status}`);
        return response.json() as Promise<Partial<PluginsResponse>>;
      }),
    ]).then(([skillsResult, pluginsResult]) => {
      if (cancelled) return;
      setComposerResourcesState({
        cwd: requestCwd,
        loading: false,
        skills: skillsResult.status === "fulfilled" ? skillsResult.value.skills ?? [] : [],
        plugins: pluginsResult.status === "fulfilled" ? pluginsResult.value.packages ?? [] : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    if (slashActiveIndex >= displayedSlashCommands.length) {
      setSlashActiveIndex(Math.max(0, displayedSlashCommands.length - 1));
    }
  }, [displayedSlashCommands.length, slashActiveIndex]);

  // Build model options: prefer modelList (has provider info), fallback to modelNames
  const modelOptions: ModelOption[] = (() => {
    if (modelList && modelList.length > 0) {
      return modelList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name })).sort(compareModelOptions);
    }
    return Object.entries(modelNames ?? {}).map(([modelId, name]) => ({
      provider: model?.provider ?? "unknown",
      modelId,
      name,
    })).sort(compareModelOptions);
  })();
  const filteredModelOptions = filterModelOptions(modelOptions, modelFilter);
  const showModelFilter = modelOptions.length > MODEL_FILTER_THRESHOLD;

  useEffect(() => {
    if (modelDropdownOpen && modelSubmenu === "model" && showModelFilter) modelFilterRef.current?.focus();
  }, [modelDropdownOpen, modelSubmenu, showModelFilter]);

  // Group options by provider, preserving insertion order
  const modelsByProvider: { provider: string; options: ModelOption[] }[] = [];
  for (const opt of filteredModelOptions) {
    const group = modelsByProvider.find((g) => g.provider === opt.provider);
    if (group) group.options.push(opt);
    else modelsByProvider.push({ provider: opt.provider, options: [opt] });
  }

  // omp's roles, in omp's own order, minus the ones it hides from its selector
  // and the ones with nothing configured to switch to.
  const roleRows = (modelRoles ?? []).filter((role) => !role.hidden && role.resolved);
  const activeRole = model
    ? roleRows.find((role) => role.resolved?.provider === model.provider && role.resolved?.modelId === model.modelId)
    : undefined;

  const displayModelName = model
    ? (modelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)?.name ?? model.modelId)
    : null;
  const currentName = displayModelName;
  const effortLevels = availableThinkingLevels
    ? THINKING_LEVELS.filter((level) => availableThinkingLevels.includes(level))
    : [];
  const currentEffortLabel = t(THINKING_LEVEL_LABEL_KEYS[thinkingLevel ?? "auto"]);
  const currentSpeedLabel = fastModeEnabled ? t("chat.speedFast") : t("chat.speedStandard");
  const modelMenuRows: Array<{
    id: "model" | "effort" | "speed";
    label: string;
    value: string | null;
    disabled: boolean;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }> = [
    { id: "model", label: t("chat.model"), value: currentName, disabled: !onModelChange, triggerRef: modelRowRef },
    { id: "effort", label: t("chat.effort"), value: currentEffortLabel, disabled: !onThinkingLevelChange, triggerRef: effortRowRef },
    ...(fastModeAvailable
      ? [{ id: "speed" as const, label: t("chat.speed"), value: currentSpeedLabel, disabled: !onFastModeChange, triggerRef: speedRowRef }]
      : []),
  ];

  const compactSavedTokens = compactResult
    ? Math.max(0, compactResult.tokensBefore - compactResult.estimatedTokensAfter)
    : 0;
  const compactResultText = compactResult
    ? `${compactResult.reason && compactResult.reason !== "manual" ? `${compactResult.reason[0].toUpperCase()}${compactResult.reason.slice(1)} ` : t("chat.compacted")} ${formatTokenCount(compactResult.tokensBefore)} -> ${formatTokenCount(compactResult.estimatedTokensAfter)} tokens (${t("chat.tokensSaved", { saved: formatTokenCount(compactSavedTokens) })})`
    : null;
  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        modelDropdownPanelRef.current && !modelDropdownPanelRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
        setModelSubmenu(null);
        setModelFilter("");
      }
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false);
      }
      if (controlsMenuRef.current && !controlsMenuRef.current.contains(e.target as Node)) {
        setControlsMenuOpen(false);
      }
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node) && !textareaRef.current?.contains(e.target as Node)) {
        setHistoryMenuOpen(false);
      }
      if (!textareaRef.current?.contains(e.target as Node) && !target?.closest?.("[data-composer-autocomplete]")) {
        setSlashMenuOpen(false);
        setAtMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!isMobile) setControlsMenuOpen(false);
  }, [isMobile]);



  const inputOverlay = (
    <>
          {historyMenuOpen && inputHistory.length > 0 && (
            <div
              ref={historyMenuRef}
              className={`${styles.autocompleteMenu} ${styles.historyMenu}`}
              role="listbox"
              aria-label="Input history"
            >
              <div
                title="Input history"
                className={styles.historyHeader}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <div className={styles.historyScroller}>
                {inputHistory.map((item, index) => {
                  const active = index === historyActiveIndex;
                  return (
                    <button
                      key={`${index}:${item}`}
                      ref={(node) => {
                        historyItemRefs.current[index] = node;
                      }}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyHistoryInput(item);
                      }}
                      onMouseEnter={() => setHistoryActiveIndex(index)}
                      className={styles.historyItem}
                      data-active={active ? "true" : "false"}
                      role="option"
                      aria-selected={active}
                    >
                      <span className={styles.historyIndex}>
                        {index + 1}
                      </span>
                      <span className={styles.historyText}>
                        {item}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {slashMenuOpen && slashQuery !== null && (
            <ComposerAutocomplete
              sections={slashSections}
              activeIndex={slashActiveIndex}
              loading={Boolean(slashCommandsLoading || composerResourcesLoading)}
              label={t("composer.autocomplete.slashCommands")}
              emptyText={t("composer.autocomplete.noCommands")}
              groupLabels={{
                agents: t("composer.autocomplete.agents"),
                commands: t("composer.autocomplete.commands"),
                files: t("composer.autocomplete.files"),
                plugins: t("composer.autocomplete.plugins"),
                skills: t("composer.autocomplete.skills"),
              }}
              loadingText={t("composer.autocomplete.loading")}
              onActiveIndexChange={setSlashActiveIndex}
              onSelect={applySlashCommand}
            />
          )}
          {atMenuOpen && atQuery !== null && (
            <ComposerAutocomplete
              sections={atSections}
              activeIndex={atActiveIndex}
              loading={Boolean(
                composerResourcesLoading
                || (fileIndexLoading && (!fileIndex || fileIndex.cwd !== cwd))
                || (needsServerSearch && !serverResultInUse)
              )}
              label={t("composer.autocomplete.addFilesAndMore")}
              emptyText={atQuery.query
                ? t("composer.autocomplete.noResults")
                : t("composer.autocomplete.searchFiles")}
              groupLabels={{
                agents: t("composer.autocomplete.agents"),
                commands: t("composer.autocomplete.commands"),
                files: t("composer.autocomplete.files"),
                plugins: t("composer.autocomplete.plugins"),
                skills: t("composer.autocomplete.skills"),
              }}
              loadingText={t("composer.autocomplete.loading")}
              onActiveIndexChange={setAtActiveIndex}
              onSelect={applyAtCompletion}
            />
          )}
    </>
  );
  const recognizedMentions = useMemo(() => buildRecognizedComposerMentions({
    skills: composerSkills,
    plugins: mentionablePlugins,
    commands: availableSlashCommands,
    files: fileIndex && fileIndex.cwd === cwd ? fileIndex.entries : [],
    subagents,
  }), [availableSlashCommands, composerSkills, cwd, fileIndex, mentionablePlugins, subagents]);
  const editor = (
    <ComposerEditor
      ref={textareaRef}
      value={value}
      mentions={recognizedMentions}
      placeholder={t("chat.messagePlaceholder")}
      ariaLabel="Message"
      onChange={(nextValue) => {
      valueRef.current = nextValue;
      setValue(nextValue);
      setSessionCommandStatus(null);
      setHistoryMenuOpen(false);
      }}
      onSelectionChange={(nextValue, cursor) => updateAtQuery(nextValue, cursor)}
      onKeyDown={(event) => {
        handleKeyDown(event);
        return event.defaultPrevented;
      }}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={(nextValue, cursor) => {
        isComposingRef.current = false;
        lastCompositionEndAtRef.current = Date.now();
        updateAtQuery(nextValue, cursor);
      }}
      onPasteImages={handlePasteImages}
      onHeightChange={(scrollHeight) => setTextareaHeight(getComposerTextareaHeight(scrollHeight))}
    />
  );
  const primaryActions = null;
  const statusLine = bashMode ? (
          <div className={styles.bashStatus} data-excluded={bashExcluded ? "true" : "false"}>
             {t("chat.shell")} · {bashExcluded ? t("chat.outputLocal") : t("chat.outputModel")}
          </div>
  ) : sessionCommandStatus ? (
          <div role="status" aria-live="polite" className={styles.commandStatus}>
            {sessionCommandStatus}
          </div>
  ) : null;
  // Nothing has used context before the first message, so the donut waits for usage.
  const contextDonut = contextUsage ? (
    <ContextDonut
      usage={contextUsage}
      sessionStats={sessionStats}
      open={sessionMenuOpen}
      onOpenChange={setSessionMenuOpen}
      onCompact={onCompact}
      onAbortCompaction={onAbortCompaction}
      isCompacting={isCompacting}
      compactDisabled={isStreaming && !isCompacting}
      triggerRef={contextTriggerRef}
      containerRef={sessionMenuRef}
      t={t}
    />
  ) : null;
  const closeModelMenu = useCallback(() => {
    setModelDropdownOpen(false);
    setModelSubmenu(null);
    setModelFilter("");
    requestAnimationFrame(() => modelTriggerRef.current?.focus());
  }, []);
  // Codex order: the model pill sits in the right cluster, after the Context donut and before Send.
  const modelPill = (
    <>
            {/* Model selector — visible always, disabled while the session or switch is busy */}
            {(modelOptions.length > 0 || currentName || modelError) && onModelChange && (
                <div ref={dropdownRef} className={styles.modelSelector} data-mobile={isMobile ? "true" : "false"}>
                  <button
                    type="button"
                    ref={modelTriggerRef}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setModelDropdownRect({ top: rect.top, left: rect.left, width: rect.width });
                      setModelDropdownOpen((open) => {
                        if (open) {
                          setModelSubmenu(null);
                          setModelFilter("");
                        }
                        return !open;
                      });
                    }}
                    disabled={isStreaming || modelSwitching}
                    aria-label={t("chat.modelSettings")}
                    aria-haspopup="menu"
                    aria-busy={modelSwitching || undefined}
                    aria-expanded={modelDropdownOpen}
                    className={`${styles.stateControl} ${styles.menuTrigger}`}
                    data-state={modelSwitching ? "running" : "idle"}
                    data-streaming={isStreaming ? "true" : "false"}
                    data-mobile={isMobile ? "true" : "false"}
                    title={modelSwitching ? "Switching model" : modelOptions.length > 0 ? "Change model" : "No available models"}
                  >
                    {modelSwitching ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={styles.spinner} aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      </svg>
                    ) : <ModelBoltIcon />}
                    <span className={`${styles.ellipsis} ${styles.modelName}`}>
                      {currentName ?? (modelOptions.length > 0 ? "Select model" : "No models")}
                    </span>
                    <span className={styles.reasoningLevel}>{currentEffortLabel}</span>
                    <svg className={styles.modelChevron} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 6.5 3 3 3-3" />
                    </svg>
                  </button>
                  {modelDropdownOpen && modelDropdownRect && (() => {
                    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                    const bottom = viewportHeight - modelDropdownRect.top + 6;
                    const maxHeight = Math.max(120, Math.min(modelDropdownRect.top - 8, viewportHeight * 0.6));
                    return (
                      <ComposerFloatingGeometry
                        left={modelDropdownRect.left}
                        bottom={bottom}
                        maxHeight={maxHeight}
                        isMobile={isMobile}
                      >
                      <div ref={modelDropdownPanelRef} className={styles.modelMenuStack} data-mobile={isMobile ? "true" : "false"}>
                        <Menu
                          open
                          label={t("chat.modelSettings")}
                          onClose={closeModelMenu}
                          triggerRef={modelTriggerRef}
                          surface="plain"
                          className={styles.modelMenu}
                        >
                          {modelMenuRows.map((row) => {
                            return (
                              <MenuItem
                                key={row.id}
                                ref={row.triggerRef}
                                data-model-menu-row={row.id}
                                aria-haspopup="menu"
                                aria-expanded={modelSubmenu === row.id}
                                disabled={row.disabled}
                                onMouseEnter={() => setModelSubmenu(row.id)}
                                onClick={() => setModelSubmenu(row.id)}
                                className={styles.modelMenuRow}
                                surface="plain"
                              >
                                <span>{row.label}</span>
                                <span className={styles.modelMenuRowValue}>{row.value}</span>
                                <svg className={styles.modelMenuRowChevron} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m6.5 5 3 3-3 3" />
                                </svg>
                              </MenuItem>
                            );
                          })}
                          <div className={styles.modelMenuDivider} />
                          <MenuItem
                            ref={advancedRowRef}
                            data-model-menu-row="advanced"
                            aria-haspopup="menu"
                            aria-expanded={modelSubmenu === "advanced"}
                            disabled={!onToolPresetChange && !onThinkingLevelChange}
                            onMouseEnter={() => setModelSubmenu("advanced")}
                            onClick={() => setModelSubmenu("advanced")}
                            className={styles.modelMenuRow}
                            surface="plain"
                          >
                            <span>{t("chat.advanced")}</span>
                            <svg className={styles.advancedChevron} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m5 9.5 3-3 3 3" />
                            </svg>
                          </MenuItem>
                        </Menu>

                        {modelSubmenu === "model" && (
                          <Menu open label={t("chat.model")} onClose={() => setModelSubmenu(null)} triggerRef={modelRowRef} surface="plain" className={`${styles.modelSubmenu} ${styles.modelSubmenuModel}`} data-model-submenu="model">
                            {showModelFilter && (
                              <div className={styles.modelFilterWrap}>
                                <input ref={modelFilterRef} value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder={t("chat.filterModels")} aria-label={t("chat.filterModels")} autoFocus autoComplete="off" spellCheck={false} className={styles.modelFilter} data-mobile={isMobile ? "true" : "false"} />
                              </div>
                            )}
                            <div className={styles.modelMenuScroller}>
                              {roleRows.length > 0 && !modelFilter.trim() && onRoleModelChange && (
                                <div>
                                  <div className={styles.modelGroupLabel}>{t("chat.modelRoles")}</div>
                                  {roleRows.map((role) => {
                                    const isActive = activeRole?.role === role.role;
                                    const resolvedName = role.resolved?.name ?? role.resolved?.modelId ?? "";
                                    return (
                                      <MenuItem key={role.role} onClick={() => { closeModelMenu(); onRoleModelChange(role.role); }} title={role.selector ?? resolvedName} className={styles.selectableControl} data-selected={isActive ? "true" : "false"} data-active={isActive ? "true" : "false"} role="menuitemradio" checked={isActive} surface="plain">
                                        {isActive ? <ModelSelectionMark /> : <span className={styles.selectionSpacer} />}
                                        <span className={styles.roleTag} data-active={isActive ? "true" : "false"}>{role.tag ?? role.role.toUpperCase()}</span>
                                        <span className={styles.roleName}>{role.name}</span>
                                        <span className={styles.roleResolved}>{resolvedName}{role.resolved?.thinkingLevel ? ` · ${role.resolved.thinkingLevel}` : ""}</span>
                                      </MenuItem>
                                    );
                                  })}
                                  <div className={`${styles.modelGroupLabel} ${styles.modelGroupDivider}`}>{t("chat.allModels")}</div>
                                </div>
                              )}
                              {modelsByProvider.length === 0 ? (
                                <div className={styles.noModels}>{modelFilter.trim() ? t("chat.noMatchingModels") : t("chat.noAvailableModels")}</div>
                              ) : modelsByProvider.map((group, groupIndex) => (
                                <div key={group.provider}>
                                  {modelsByProvider.length > 1 && <div className={styles.modelGroupLabel} data-divided={groupIndex > 0 ? "true" : "false"}>{group.provider}</div>}
                                  {group.options.map((option) => {
                                    const isActive = option.modelId === model?.modelId && option.provider === model?.provider;
                                    return (
                                      <MenuItem key={`${option.provider}:${option.modelId}`} onClick={() => { closeModelMenu(); if (!isActive || isAutoModelSelection) onModelChange(option.provider, option.modelId); }} className={styles.selectableControl} data-selected={isActive ? "true" : "false"} role="menuitemradio" checked={isActive} surface="plain">
                                        {isActive ? <ModelSelectionMark /> : <span className={styles.selectionSpacer} />}
                                        {option.name}
                                      </MenuItem>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </Menu>
                        )}

                        {modelSubmenu === "effort" && onThinkingLevelChange && (
                          <Menu open label={t("chat.effort")} onClose={() => setModelSubmenu(null)} triggerRef={effortRowRef} surface="plain" className={`${styles.modelSubmenu} ${styles.modelSubmenuEffort}`} data-model-submenu="effort">
                            <div className={styles.modelSubmenuTitle}>{t("chat.effort")}</div>
                            <div data-menu-section="reasoning">
                              {effortLevels.length === 0 ? (
                                <div className={styles.modelSubmenuEmpty}>{t("chat.noEffortLevels")}</div>
                              ) : effortLevels.map((level) => {
                                const isActive = (thinkingLevel ?? "auto") === level;
                                const mappedValue = level !== "auto" && thinkingLevelMap ? thinkingLevelMap[level] : undefined;
                                return (
                                  <MenuItem key={level} title={mappedValue && mappedValue !== level ? `${level} → ${mappedValue}` : undefined} onClick={() => { closeModelMenu(); if (!isActive) onThinkingLevelChange(level); }} className={styles.submenuChoice} data-selected={isActive ? "true" : "false"} role="menuitemradio" checked={isActive} surface="plain">
                                    <span>{t(THINKING_LEVEL_LABEL_KEYS[level])}</span>
                                    {level === "max" && <span className={styles.ultraWarning}>{t("chat.ultraUsageWarning")}</span>}
                                    {isActive && <SubmenuSelectionCheck />}
                                  </MenuItem>
                                );
                              })}
                            </div>
                          </Menu>
                        )}

                        {modelSubmenu === "speed" && onFastModeChange && (
                          <Menu open label={t("chat.speed")} onClose={() => setModelSubmenu(null)} triggerRef={speedRowRef} surface="plain" className={`${styles.modelSubmenu} ${styles.modelSubmenuSpeed}`} data-model-submenu="speed">
                            <div className={styles.modelSubmenuTitle}>{t("chat.speed")}</div>
                            {[false, true].map((enabled) => {
                              const isActive = fastModeEnabled === enabled;
                              return (
                                <MenuItem key={String(enabled)} onClick={() => { closeModelMenu(); if (!isActive) onFastModeChange(enabled); }} className={styles.submenuChoice} data-selected={isActive ? "true" : "false"} role="menuitemradio" checked={isActive} surface="plain">
                                  <span>{enabled ? t("chat.speedFast") : t("chat.speedStandard")}</span>
                                  {enabled && <span className={styles.speedDescription}>{t("chat.speedFastDescription")}</span>}
                                  {isActive && <SubmenuSelectionCheck />}
                                </MenuItem>
                              );
                            })}
                          </Menu>
                        )}

                        {modelSubmenu === "advanced" && (onToolPresetChange || onThinkingLevelChange) && (
                          <Menu open label={t("chat.advanced")} onClose={() => setModelSubmenu(null)} triggerRef={advancedRowRef} surface="plain" className={`${styles.modelSubmenu} ${styles.modelSubmenuAdvanced}`} data-model-submenu="advanced">
                            <div className={styles.modelSubmenuTitle}>{t("chat.advanced")}</div>
                            {onThinkingLevelChange && (
                              <div data-menu-section="effort-modes">
                                <div className={styles.modelGroupLabel}>{t("chat.effort")}</div>
                                {(["auto", "off"] as const).map((level) => {
                                  const isActive = (thinkingLevel ?? "auto") === level;
                                  return (
                                    <MenuItem key={level} onClick={() => { closeModelMenu(); if (!isActive) onThinkingLevelChange(level); }} className={styles.submenuChoice} data-selected={isActive ? "true" : "false"} role="menuitemradio" checked={isActive} surface="plain">
                                      <span>{t(THINKING_LEVEL_LABEL_KEYS[level])}</span>
                                      {isActive && <SubmenuSelectionCheck />}
                                    </MenuItem>
                                  );
                                })}
                              </div>
                            )}
                            {onToolPresetChange && (
                              <div data-menu-section="tools" className={styles.advancedTools}>
                                <div className={styles.modelGroupLabel}>{t("chat.toolPreset")}</div>
                                {TOOL_PRESETS.map((level) => {
                                  const preset = TOOL_PRESET_MAP[level];
                                  const isActive = (toolPreset ?? "default") === preset;
                                  return (
                                    <MenuItem key={level} onClick={() => { closeModelMenu(); if (!isActive) onToolPresetChange(preset); }} className={styles.submenuChoice} data-selected={isActive ? "true" : "false"} role="menuitemradio" checked={isActive} surface="plain">
                                      <span className={styles.menuItemValue}>{level}</span>
                                      <span className={styles.menuItemDescription}>{level === "off" ? t("chat.noTools") : level === "default" ? t("chat.builtInTools", { tools: DEFAULT_TOOL_LABEL }) : t("chat.allBuiltInTools", { tools: `${DEFAULT_TOOL_LABEL} + ${FULL_TOOL_ADDITIONS}` })}</span>
                                      {isActive && <SubmenuSelectionCheck />}
                                    </MenuItem>
                                  );
                                })}
                              </div>
                            )}
                          </Menu>
                        )}
                      </div>
                    </ComposerFloatingGeometry>
                    );
                  })()}
                </div>
            )}
    </>
  );
  const toolbarStart = (
    <>
            {attachmentPickerError && <span role="alert">{attachmentPickerError}</span>}
            {commandActionError && <span role="alert">{commandActionError}</span>}
            <ComposerAddMenu
              loading={Boolean(slashCommandsLoading || composerResourcesLoading)}
              onOpen={() => {
                setSlashMenuOpen(false);
                setAtMenuOpen(false);
                setHistoryMenuOpen(false);
                setModelDropdownOpen(false);
                if (onLoadSlashCommands) void Promise.resolve(onLoadSlashCommands()).catch(() => {
                  slashCommandsRequestedRef.current = false;
                });
              }}
              labels={{
                moreCommands: t("composer.moreCommands"),
                loading: t("composer.autocomplete.loading"),
                add: t("composer.add"), images: t("chat.attachImage"), files: t("composer.filesAndFolders"),
                groups: {
                  commands: t("composer.autocomplete.commands"),
                  plugins: t("composer.autocomplete.plugins"),
                  skills: t("composer.autocomplete.skills"),
                  agents: t("composer.autocomplete.agents"),
                },
              }}
              sections={buildComposerAddSections({ commands: availableSlashCommands, skills: composerSkills, plugins: mentionablePlugins, subagents })}
              onAttachImages={() => fileInputRef.current?.click()}
              childrenFor={item => {
                const command = availableSlashCommands.find(command => item.raw === `/${command.name}`);
                return command?.subcommands?.length ? buildSlashSubcommandSections(command, "") : [];
              }}
              onBrowseFiles={cwd ? () => {
                const editor = textareaRef.current;
                if (!editor) return;
                const picker = getAttachmentPicker();
                if (picker) {
                  setAttachmentPickerError(null);
                  void picker().then(paths => {
                    if (textareaRef.current !== editor) return;
                    for (const path of paths) {
                      const at = editor.selectionStart;
                      if (at > 0 && !/\s/.test(editor.value[at - 1])) editor.replaceRange(at, at, " ");
                      editor.replaceRangeWithMention(editor.selectionStart, editor.selectionEnd, {
                        kind: "file", label: path.split(/[\\/]/).at(-1) || path,
                        raw: path.includes(" ") ? `@"${path}"` : `@${path}`, icon: "file",
                      }, true);
                    }
                    requestAnimationFrame(() => editor.focus());
                  }).catch(() => setAttachmentPickerError(t("composer.attachmentPickerError")));
                  return;
                }
                const start = editor.selectionStart;
                const prefix = start > 0 && !/\s/.test(editor.value[start - 1]) ? " @" : "@";
                editor.replaceRange(start, editor.selectionEnd, prefix);
                requestAnimationFrame(() => editor.focus());
                updateAtQuery(editor.value, start + prefix.length);
              } : undefined}
              onSelect={(item) => {
                const editor = textareaRef.current;
                if (!editor) return;
                if (item.kind === "command" && ["/compact", "/copy", "/reload", "/session"].includes(item.raw) && onBuiltinCommand) {
                  if (commandActionPending) return;
                  setCommandActionPending(true);
                  setCommandActionError(null);
                  void onBuiltinCommand(item.raw).then(result => {
                    if (!result.handled) {
                      setPendingAddCommand(item);
                      return;
                    }
                    if (result.error) setCommandActionError(result.error);
                    if (result.action === "openSessionStats") {
                      if (contextUsage) setSessionMenuOpen(true);
                      else setSessionCommandStatus(t("session.noContextUsage"));
                    }
                  }).catch(cause => setCommandActionError(cause instanceof Error ? cause.message : String(cause)))
                    .finally(() => setCommandActionPending(false));
                  return;
                }
                if (item.kind === "command") {
                  setPendingAddCommand(item);
                  return;
                }
                let start = editor.selectionStart;
                let end = editor.selectionEnd;
                if (start > 0 && !/\s/.test(editor.value[start - 1])) {
                  editor.replaceRange(start, start, " ");
                  start++;
                  end++;
                }
                editor.replaceRangeWithMention(start, end, {
                  ...item, label: item.mentionLabel ?? item.label,
                }, true);
                setSlashMenuOpen(false);
                setAtMenuOpen(false);
                requestAnimationFrame(() => editor.focus());
              }}
            />
            {(!isMobile || controlsMenuOpen) && projectTrust && (
              <ApprovalModeSelector
                mode={approvalMode}
                changing={approvalModeChanging}
                error={approvalModeError}
                restricted={projectTrust.requiresTrust && !projectTrust.trusted}
                onChange={onApprovalModeChange}
                onTrust={onProjectTrustClick ?? (() => {})}
              />
            )}
    </>
  );
  const visibleQueuedMessages = debugQueuedMessages ?? queuedMessages;
  const composerStreaming = isStreaming || debugQueuedMessages !== null;
  const toolbarEnd = (
    <>
      {isMobile && !controlsMenuOpen && (
        <button
          type="button"
          title={t("chat.moreControls")}
          aria-label={t("chat.moreControls")}
          aria-expanded={false}
          className={`${styles.stateControl} ${styles.moreControls}`}
          onClick={() => setControlsMenuOpen(true)}
        >
          {t("chat.moreControls")}
        </button>
      )}
      {isMobile && controlsMenuOpen && (
        <button
          type="button"
          title={t("chat.collapseControls")}
          aria-label={t("chat.collapseControls")}
          aria-expanded={true}
          className={`${styles.stateControl} ${styles.collapseControl}`}
          data-state="expanded"
          onClick={() => setControlsMenuOpen(false)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      {isMobile && controlsMenuOpen && modelPill}
      {composerStreaming ? (
        <>
          {canQueueStreamingMessage && (
            <Tooltip content={queueingEnabled ? t("chat.queueMessage") : t("chat.steerMessage")}>
              <button
                type="button"
                onClick={() => {
                  if (editingQueuedMessage) void completeQueuedMessageEdit();
                  else sendQueued(resolveStreamingSubmissionMode(queueingEnabled, false));
                }}
                aria-label={queueingEnabled ? t("chat.queueMessage") : t("chat.steerMessage")}
                className={styles.sendAction}
              >
                <SendArrowIcon />
              </button>
            </Tooltip>
          )}
          <Tooltip content={t("chat.stopAgent")}>
            <button
              type="button"
              onClick={() => {
                if (debugQueuedMessages) {
                  setDebugQueuedMessages((current) => current ? { ...current, paused: true } : current);
                } else {
                  onAbort();
                }
              }}
              aria-label={t("chat.stopAgent")}
              className={`${styles.stateControl} ${styles.stopControl}`}
              data-state="running"
            >
              <StopSquareIcon />
            </button>
          </Tooltip>
        </>
      ) : (
        <Tooltip content={t("chat.send")}>
          <button
            type="submit"
            disabled={!value.trim() && !attachedImages.length}
            aria-label={t("chat.send")}
            className={styles.sendAction}
          >
            <SendArrowIcon />
          </button>
        </Tooltip>
      )}
    </>
  );
  const queuedCount = visibleQueuedMessages?.items.length ?? 0;

  return (
    <>
      <ComposerFrame
      requestPending={requestPending}
      onSubmit={(event) => {
        event.preventDefault();
        if (editingQueuedMessage) void completeQueuedMessageEdit();
        else if (isStreaming) sendQueued(resolveStreamingSubmissionMode(queueingEnabled, false));
        else requestIdleSubmission();
      }}
      fileInputRef={fileInputRef}
      fileInputId={imageInputId}
      onFileInputChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        processImageFiles(files);
        event.target.value = "";
      }}
      modelError={modelError}
      modelScopeWarnings={modelScopeWarnings}
      queue={queuedCount > 0 ? {
        items: visibleQueuedMessages?.items ?? [],
        paused: visibleQueuedMessages?.paused ?? false,
        queueingEnabled,
        onDelete: (id) => {
          if (debugQueuedMessages) setDebugQueuedMessages((current) => current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current);
          else void deleteQueuedMessage(id);
        },
        onEdit: (id) => {
          if (debugQueuedMessages) {
            const item = debugQueuedMessages.items.find((entry) => entry.id === id);
            if (item) {
              setValue(item.text);
              setDebugQueuedMessages((current) => current ? { ...current, items: current.items.filter((entry) => entry.id !== id) } : current);
              requestAnimationFrame(() => textareaRef.current?.focus());
            }
          } else void editQueuedMessage(id);
        },
        onReorder: (ids) => {
          if (debugQueuedMessages) {
            setDebugQueuedMessages((current) => {
              if (!current) return current;
              const byId = new Map(current.items.map((item) => [item.id, item]));
              return { ...current, items: ids.flatMap((id) => byId.get(id) ?? []) };
            });
          } else void onReorderQueuedMessages?.(ids);
        },
        onSendNow: (id) => {
          if (debugQueuedMessages) setDebugQueuedMessages((current) => current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current);
          else void onSendQueuedMessageNow?.(id);
        },
        onQueueingChange: changeQueueingEnabled,
        onResume: () => {
          if (debugQueuedMessages) setDebugQueuedMessages((current) => current ? { ...current, paused: false } : current);
          else void onResumeQueuedMessages?.();
        },
        labels: {
          queuePaused: t("chat.queuePaused"),
          resume: t("chat.queueResume"),
          steer: t("chat.steer"),
          steerAria: t("chat.queueSteerAria"),
          steerTooltip: t("chat.queueSteerTooltip"),
          delete: t("chat.queueDelete"),
          actions: t("chat.queueActions"),
          edit: t("chat.queueEdit"),
          queueOff: t("chat.queueOff"),
          queueOn: t("chat.queueOn"),
          reorder: t("chat.queueReorder"),
          image: t("chat.queueImage"),
        },
      } : null}
      retryStatus={retryInfo ? {
        message: t("chat.retrying", { attempt: retryInfo.attempt, max: retryInfo.maxAttempts }),
        detail: retryInfo.errorMessage,
      } : null}
      successStatus={compactResultText}
      compactError={compactError}
      attachments={attachedImages}
      onRemoveAttachment={removeImage}
      inputOverlay={inputOverlay}
      editor={editor}
      textareaHeight={textareaHeight}
      mode={bashMode ? "bash" : composerStreaming ? "streaming" : "idle"}
      primaryActions={primaryActions}
      statusLine={statusLine}
      toolbarStart={toolbarStart}
      toolbarCenter={isMobile ? contextDonut : null}
      toolbarModelArea={(
        <>
          {!isMobile && contextDonut}
          {!isMobile && modelPill}
        </>
      )}
      toolbarEnd={toolbarEnd}
      dictateLabel={t("chat.dictate")}
      toolbarEndRef={controlsMenuRef}
      isMobile={isMobile}
      />
      {pendingAddCommand && <CommandArgumentsDialog
        command={pendingAddCommand.raw} title={pendingAddCommand.mentionLabel ?? pendingAddCommand.label}
        description={pendingAddCommand.detail}
        onClose={() => setPendingAddCommand(null)}
        onRun={async command => {
          const result = await onBuiltinCommand?.(command);
          if (result?.handled) {
            if (result.error) throw new Error(result.error);
            if (result.prompt) onSend(result.prompt);
          } else {
            onSend(command);
          }
        }}
      />}
      {pausedQueueSubmitOpen ? (
        <PausedQueueSubmitDialog
          count={queuedCount}
          busy={pausedQueueSubmitBusy}
          error={pausedQueueSubmitError}
          title={t("chat.pausedQueueSubmitTitle")}
          description={queuedCount === 1
            ? t("chat.pausedQueueSubmitDescriptionOne")
            : t("chat.pausedQueueSubmitDescription", { count: queuedCount })}
          clearLabel={t("chat.pausedQueueSubmitClear")}
          sendLabel={t("chat.pausedQueueSubmitSend")}
          closeLabel={t("chat.close")}
          onClose={() => { if (!pausedQueueSubmitBusy) setPausedQueueSubmitOpen(false); }}
          onClearQueue={() => void resolvePausedQueueSubmission(true)}
          onSendMessage={() => void resolvePausedQueueSubmission(false)}
        />
      ) : null}
    </>
  );
});

function ModelBoltIcon() {
  return (
    <svg data-composer-icon="model" className={styles.modelIcon} width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9.2 1.5 3.8 8.6h3.8l-.8 5.9 5.4-7.1H8.4z" />
    </svg>
  );
}

const CONTEXT_WARNING_PERCENT = 70;
const CONTEXT_CRITICAL_PERCENT = 90;

function getContextPercent(usage: ContextUsage): number | null {
  if (typeof usage.percent === "number" && Number.isFinite(usage.percent)) return usage.percent;
  if (
    typeof usage.tokens === "number"
    && Number.isFinite(usage.tokens)
    && Number.isFinite(usage.contextWindow)
    && usage.contextWindow > 0
  ) {
    return (usage.tokens / usage.contextWindow) * 100;
  }
  return null;
}

function ContextDonut({
  usage,
  sessionStats,
  open,
  onOpenChange,
  onCompact,
  onAbortCompaction,
  isCompacting,
  compactDisabled,
  triggerRef,
  containerRef,
  t,
}: {
  usage?: ContextUsage | null;
  sessionStats?: SessionStatsInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompact?: () => void;
  onAbortCompaction?: () => void;
  isCompacting?: boolean;
  compactDisabled: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const contextWindow = usage && Number.isFinite(usage.contextWindow) && usage.contextWindow > 0
    ? usage.contextWindow
    : null;
  const tokens = usage && typeof usage.tokens === "number" && Number.isFinite(usage.tokens)
    ? Math.max(0, usage.tokens)
    : null;
  const percent = usage ? getContextPercent(usage) : null;
  const level = percent !== null && percent >= CONTEXT_CRITICAL_PERCENT
    ? "critical"
    : percent !== null && percent >= CONTEXT_WARNING_PERCENT
      ? "warning"
      : "normal";
  const usedLabel = tokens === null ? "?" : formatTokenCount(tokens);
  const limitLabel = contextWindow === null ? "?" : formatTokenCount(contextWindow);
  const percentLabel = percent === null ? "?" : `${percent.toFixed(0)}%`;
  // Codex donut: pathLength 100, so the offset is the unused share.
  const ringPercent = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  const ringOffset = Math.round(100 - ringPercent);
  const remaining = Math.max(0, 100 - Math.round(ringPercent));
  const usedK = tokens === null ? null : Math.round(tokens / 1000);
  const limitK = contextWindow === null ? null : Math.round(contextWindow / 1000);
  const status = level === "critical"
    ? t("chat.contextUsageCritical")
    : level === "warning"
      ? t("chat.contextUsageWarning")
      : null;
  const contextAria = t("composer.contextDonutAria", { percent: percent === null ? "?" : percent.toFixed(0) });
  const contextTooltip = (
    <span className={styles.contextTooltip}>
      <span className={styles.contextTooltipMuted}>{t("chat.contextWindowLabel")}</span>
      <span>
        {percent === null
          ? t("chat.contextUsageSummary", { used: usedLabel, limit: limitLabel, percent: percentLabel })
          : ringPercent >= 100
            ? t("chat.contextUsageFull", { usage: Math.round(ringPercent) })
            : t("chat.contextUsageLeft", { usage: Math.round(ringPercent), remaining })}
      </span>
      {usedK !== null && limitK !== null && (
        <span className={styles.contextTooltipMuted}>{t("chat.contextTokensUsed", { used: usedK, limit: limitK })}</span>
      )}
      {status && <span className={styles.contextTooltipMuted}>{status}</span>}
    </span>
  );
  const metrics = [
    [t("session.input"), (sessionStats?.tokens.input ?? 0).toLocaleString()],
    [t("session.output"), (sessionStats?.tokens.output ?? 0).toLocaleString()],
    [t("session.cacheRead"), (sessionStats?.tokens.cacheRead ?? 0).toLocaleString()],
    [t("session.cacheWrite"), (sessionStats?.tokens.cacheWrite ?? 0).toLocaleString()],
    [t("session.cost"), `$${(sessionStats?.cost ?? 0).toFixed(4)}`],
  ];

  return (
    <div ref={containerRef} className={styles.sessionMenuWrap}>
      <Tooltip content={contextTooltip}>
        <button
          ref={triggerRef}
          type="button"
          aria-live="polite"
          aria-label={contextAria}
          aria-haspopup="menu"
          aria-expanded={open}
          data-context-level={level}
          data-context-available={usage ? "true" : "false"}
          className={`${styles.stateControl} ${styles.contextDonut}`}
          onClick={() => onOpenChange(!open)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={styles.contextRing}>
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="2" fill="none" className={styles.contextRingTrack} />
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" pathLength="100" strokeDasharray="100" strokeDashoffset={ringOffset} opacity={ringPercent === 0 ? 0 : 1} className={styles.contextRingArc} transform="rotate(-90 6 6)" />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <Menu
          open
          label={t("session.menu")}
          onClose={() => onOpenChange(false)}
          triggerRef={triggerRef}
          surface="plain"
          className={`${styles.controlMenu} ${styles.sessionMenu}`}
        >
          <div className={styles.contextMetrics}>
            {metrics.map(([label, value]) => (
              <div key={label} className={styles.contextMetricRow}>
                <span>{label} </span>
                <span>{value}</span>
              </div>
            ))}
          </div>
          {onCompact && (
            <MenuItem
              onClick={() => {
                onOpenChange(false);
                if (isCompacting) onAbortCompaction?.();
                else onCompact();
              }}
              aria-pressed={Boolean(isCompacting)}
              disabled={compactDisabled}
              data-state={isCompacting ? "running" : "idle"}
              surface="plain"
              className={styles.selectableControl}
            >
              {isCompacting ? t("chat.stopCompaction") : t("chat.compact")}
            </MenuItem>
          )}
        </Menu>
      )}
    </div>
  );
}
