import { serviceTierFamily } from "@oh-my-pi/pi-ai";
import {
  applyResolvedSystemPromptInputs,
  createAgentSession,
  type CreateAgentSessionOptions,
  discoverSessionExtensionPaths,
  getAgentDir,
  initTheme,
  SessionManager,
  Theme,
} from "@oh-my-pi/pi-coding-agent";
import type { ConfiguredThinkingLevel } from "@oh-my-pi/pi-coding-agent/thinking";
import { buildAvailableSlashCommands } from "@oh-my-pi/pi-coding-agent/slash-commands/available-commands";
import { BUILTIN_SLASH_COMMAND_DEFS } from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";
import { executeAcpBuiltinSlashCommand, type AcpBuiltinSlashCommandResult } from "@oh-my-pi/pi-coding-agent/slash-commands/acp-builtins";
import { discoverCustomToolPaths } from "@oh-my-pi/pi-coding-agent/extensibility/custom-tools";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { readPlanFile } from "@oh-my-pi/pi-coding-agent/plan-mode/plan-files";
import {
  readRpcSubagentTranscript,
  RpcSubagentRegistry,
} from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-subagents";
import { KeybindingsManager as TuiKeybindingsManager, TUI_KEYBINDINGS } from "@oh-my-pi/pi-tui";
import { randomUUID } from "crypto";
import { existsSync, realpathSync, writeFileSync } from "fs";
import { resolve } from "path";
import { validateAgentImages } from "./image-attachments";
import { invalidateModelsCache } from "./models-cache";
import { resolveVisibleModels, selectInitialModelScope } from "./model-scope";
import { cacheSessionPath, invalidateSessionListCache } from "./session-reader";
import { untrustedProjectSessionOptions } from "./project-trust";
import { resolveSessionSystemPrompts } from "./session-system-prompt";
import { readDefaultModelRole } from "./model-roles";
import { getOmpRuntime, getSettingsForCwd } from "./omp-runtime";
import { PRESET_FULL } from "./tool-presets";
import { persistExplicitStartupPreferences } from "./startup-preferences";
import { QueuedMessageEditor, type RemovedQueuedMessage, type QueueAgent } from "./queued-message-editor";
import type { QueuedMessageDraft, QueuedMessageSnapshot } from "./queued-message-types";
import { CollaborationAdapter } from "./collaboration-adapter";
import type { ApprovalMode } from "./approval-mode";
import type { SlashCommandInfo } from "./omp-types";
import type { AgentSessionLike, ExtensionUiContextLike, ToolInfo } from "./omp-types";
import type {
  ExtensionAskDialogResult,
  ExtensionUiRequest,
  ExtensionUiResponse,
  ExtensionWidgetItem,
  SessionInfo,
  SessionMessageEntry,
  SubagentSnapshot,
} from "./types";
import { createHeadlessCustomUiTui, DEFAULT_CUSTOM_UI_COLUMNS } from "./custom-ui-terminal";

// ============================================================================
// Types
// ============================================================================

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;

type SessionEventChannel = {
  sessionId: string;
  listeners: Set<EventListener>;
  attachedWrappers: number;
};

type PendingUiResponse = {
  resolve: (response: ExtensionUiResponse) => void;
  cancel: () => void;
};

type CustomUiComponent = {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
  dispose?: () => void;
  invalidate?: () => void;
};

type ActiveCustomUi = {
  component: CustomUiComponent;
  width: number;
  resolve: (value: unknown) => void;
  settled: boolean;
};

type ExtensionUiRequestBody = Record<string, unknown> & {
  method: ExtensionUiRequest["method"];
  timeout?: number;
  expiresAt?: number;
};

type ExtensionBindingOptions = {
  forceEmptySystemPrompt?: boolean;
};

const RUNNING_STATE_EVENT_TYPES = new Set([
  "agent_start",
  "agent_end",
  "agent_settled",
  "auto_compaction_start",
  "auto_compaction_end",
  "compaction_start",
  "compaction_end",
]);

const IDLE_RESET_EVENT_TYPES = new Set([
  "agent_end",
  "agent_settled",
  "auto_compaction_end",
  "compaction_end",
]);

const MAX_SUBAGENT_HISTORY = 128;
const MAX_QUEUED_MESSAGE_UNDOS = 32;

const HANDOFF_ALLOWED_COMMAND_TYPES: Record<string, true> = {
  abort: true,
  extension_ui_input: true,
  extension_ui_response: true,
  get_commands: true,
  get_last_assistant_text: true,
  get_session_stats: true,
  get_state: true,
  get_subagent_messages: true,
  get_subagents: true,
  get_tools: true,
};

type ForkBranchEntry = {
  id?: string;
  type?: string;
  message?: { role?: string };
};

export function resolveForkEntryId(
  entries: readonly ForkBranchEntry[],
  requestedEntryId?: unknown,
): string | undefined {
  if (typeof requestedEntryId === "string" && requestedEntryId.length > 0) return requestedEntryId;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "message" && entry.message?.role === "user" && entry.id) return entry.id;
  }
  return undefined;
}

export interface RpcSessionStartOptions {
  toolNames?: string[];
  initialModel?: { provider: string; modelId: string };
  thinkingLevel?: ConfiguredThinkingLevel;
}

const CODING_TOOL_NAMES: Record<string, true> = Object.fromEntries(
  PRESET_FULL.map((name) => [name, true]),
);

// Extensions require a complete Theme, while the web UI applies its own styling.
class PlainTextTheme extends Theme {
  constructor() {
    super(
      { thinkingXhigh: "" } as ConstructorParameters<typeof Theme>[0],
      {} as ConstructorParameters<typeof Theme>[1],
      "truecolor",
      "unicode",
      {},
    );
  }

  override fg(...[, text]: Parameters<Theme["fg"]>): string { return text; }
  override bg(...[, text]: Parameters<Theme["bg"]>): string { return text; }
  override bold(text: string): string { return text; }
  override italic(text: string): string { return text; }
  override underline(text: string): string { return text; }
  override inverse(text: string): string { return text; }
  override strikethrough(text: string): string { return text; }
  override getFgAnsi(): string { return ""; }
  override getBgAnsi(): string { return ""; }
  override getThinkingBorderColor(): (text: string) => string {
    return (text) => text;
  }
  override getBashModeBorderColor(): (text: string) => string { return (text) => text; }
}

const PLAIN_TEXT_THEME = new PlainTextTheme();
const CUSTOM_UI_KEYBINDINGS = new TuiKeybindingsManager(TUI_KEYBINDINGS);

function fastModeState(session: AgentSessionLike, model = session.model) {
  const fastModeAvailable = Boolean(
    model && serviceTierFamily(model),
  );
  return {
    fastModeAvailable,
    fastModeEnabled: fastModeAvailable && session.isFastModeEnabled(),
  };
}

function withExtensionTools(session: AgentSessionLike, toolNames: string[]): string[] {
  if (toolNames.length === 0) return [];

  const extensionToolNames = session
    .getAllToolNames()
    .filter((name) => CODING_TOOL_NAMES[name] !== true);

  return [...new Set([...toolNames, ...extensionToolNames])];
}

/** Tool descriptors for the browser's tool picker. */
function listTools(session: AgentSessionLike): ToolInfo[] {
  return session.getAllToolNames().map((name) => ({
    name,
    description: session.getToolByName(name)?.description ?? "",
  }));
}

type AvailableCommandsSession = Parameters<typeof buildAvailableSlashCommands>[0];

function appendSlashCommand(
  commands: SlashCommandInfo[],
  seenNames: Set<string>,
  command: SlashCommandInfo,
): void {
  const name = command.name.trim();
  if (!name || seenNames.has(name)) return;
  seenNames.add(name);
  commands.push({ ...command, name });
}

function defaultSlashCommandIcon(source: SlashCommandInfo["source"]): string {
  if (source === "skill") return "skill";
  if (source === "extension") return "extension";
  if (source === "mcp_prompt") return "mcp";
  if (source === "prompt" || source === "custom" || source === "file") return "prompt";
  return "action";
}

function slashCommandIcon(command: SlashCommandInfo): string {
  if (command.icon) return command.icon;
  if (command.source === "builtin") {
    const builtin = BUILTIN_SLASH_COMMAND_DEFS.find((definition) => (
      definition.name === command.name || definition.aliases?.includes(command.name)
    ));
    if (builtin?.icon) return builtin.icon;
  }
  return defaultSlashCommandIcon(command.source);
}

/** Browser-native builtins with no shared SDK handler; advertised with their canonical registry metadata. */
const BROWSER_NATIVE_SLASH_COMMANDS = ["fork", "collab"] as const;

/**
 * Keep the browser palette aligned with omp's own command registry and
 * discovery pipeline. Shared text/ACP builtins and every discovered
 * extension/custom/MCP/file/skill command come from the SDK discovery;
 * browser-native /fork is added explicitly from the canonical builtin registry
 * because it has no shared SDK handler yet. /handoff gained one in omp 18, so
 * it now arrives through discovery like every other shared builtin.
 */
export async function getAvailableSlashCommands(session: AgentSessionLike): Promise<SlashCommandInfo[]> {
  const commands: SlashCommandInfo[] = [];
  const seenNames = new Set<string>();

  const discovered = await buildAvailableSlashCommands(session as unknown as AvailableCommandsSession);
  for (const command of discovered) {
    const browserCommand = command as SlashCommandInfo;
    appendSlashCommand(commands, seenNames, {
      ...browserCommand,
      icon: slashCommandIcon(browserCommand),
    });
  }

  for (const name of BROWSER_NATIVE_SLASH_COMMANDS) {
    const builtin = BUILTIN_SLASH_COMMAND_DEFS.find((def) => def.name === name);
    if (!builtin) continue;
    const hint = builtin.inlineHint;
    appendSlashCommand(commands, seenNames, {
      name: builtin.name,
      aliases: builtin.aliases,
      description: builtin.description,
      icon: builtin.icon ?? "action",
      source: "builtin",
      ...(hint ? { input: { hint } } : {}),
      ...(builtin.subcommands ? { subcommands: builtin.subcommands } : {}),
    });
  }

  // Prompt templates are a separate SDK resource from custom commands and
  // file-based commands, so retain them explicitly in the browser contract.
  for (const template of session.promptTemplates) {
    appendSlashCommand(commands, seenNames, {
      name: template.name,
      description: template.description,
      icon: "prompt",
      source: "prompt",
      ...(template.source ? { path: template.source } : {}),
    });
  }

  return commands;
}

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private readonly sessionEventChannels: SessionEventChannel[];
  private pendingUiResponses = new Map<string, PendingUiResponse>();
  private pendingUiRequests = new Map<string, AgentEvent>();
  private activeCustomUis = new Map<string, ActiveCustomUi>();
  private extensionStatuses = new Map<string, string>();
  private extensionWidgets = new Map<string, ExtensionWidgetItem>();
  private promptRunning = false;
  // Set while the handoff RPC is in flight so state polls and the running-set
  // stay honest during the long oneshot generation + session transition.
  private handoffRunning = false;
  private extensionsBound = false;
  private extensionBindingPromise: Promise<void> | null = null;
  private extensionBindingError: unknown = null;
  private forceEmptySystemPrompt = false;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeSessionName: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private readonly subagents: RpcSubagentRegistry;
  // The SDK registry removes terminal entries after emitting their lifecycle frame.
  // Keep a bounded per-session copy so state requests can still expose history.
  private readonly subagentHistory = new Map<string, SubagentSnapshot>();
  private readonly queuedMessageEditor: QueuedMessageEditor;
  private readonly collaboration: CollaborationAdapter;
  private readonly queuedMessageEdits = new Map<string, RemovedQueuedMessage>();
  private readonly deletedQueuedMessages = new Map<string, RemovedQueuedMessage>();
  private queuePaused = false;
  private _alive = true;

  constructor(
    public readonly inner: AgentSessionLike,
    eventBus: ConstructorParameters<typeof RpcSubagentRegistry>[0],
    eventSessionIds: readonly string[] = [],
  ) {
    this.sessionEventChannels = [...new Set(eventSessionIds)].map(acquireSessionEventChannel);
    this.queuedMessageEditor = new QueuedMessageEditor(this.inner.agent as QueueAgent);
    this.collaboration = new CollaborationAdapter({
      session: this.inner,
      eventBus,
      onChange: (collaboration) => {
        if (!this._alive) return;
        this.emit({ type: "collab_status", collaboration });
        this.resetIdleTimer();
      },
      onNotice: (message, type) => {
        if (!this._alive) return;
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "notify",
          message,
          notifyType: type,
        } as ExtensionUiRequest as AgentEvent);
      },
      onQueueChange: () => {
        if (this._alive) this.emitQueueUpdate();
      },
    });
    try {
      this.subagents = new RpcSubagentRegistry(eventBus, (frame) => {
        const event = frame as unknown as AgentEvent;
        this.rememberSubagentFrame(event);
        this.emit(event);
        this.resetIdleTimer();
        notifyRunningChange();
      });
    } catch (error) {
      for (const channel of this.sessionEventChannels) releaseSessionEventChannel(channel);
      throw error;
    }
    this.subagents.setSubscriptionLevel("progress");
  }

  private rememberSubagentSnapshot(snapshot: SubagentSnapshot): void {
    this.subagentHistory.set(snapshot.id, snapshot);
    if (this.subagentHistory.size <= MAX_SUBAGENT_HISTORY) return;
    const removable = [...this.subagentHistory.values()]
      .filter((entry) => entry.status !== "pending" && entry.status !== "running")
      .sort((left, right) => left.lastUpdate - right.lastUpdate);
    while (this.subagentHistory.size > MAX_SUBAGENT_HISTORY && removable.length > 0) {
      const oldest = removable.shift();
      if (oldest) this.subagentHistory.delete(oldest.id);
    }
  }

  private rememberSubagentFrame(event: AgentEvent): void {
    if (event.type === "subagent_progress") {
      const payload = event.payload as { progress?: { id?: string } } | undefined;
      const id = payload?.progress?.id;
      if (!id) return;
      const live = this.subagents.getSubagents().find((entry) => entry.id === id);
      if (live) this.rememberSubagentSnapshot(live as unknown as SubagentSnapshot);
      return;
    }
    if (event.type !== "subagent_lifecycle") return;
    const payload = event.payload as {
      id?: string;
      index?: number;
      agent?: string;
      agentSource?: "bundled" | "user" | "project";
      description?: string;
      status?: "started" | "completed" | "failed" | "aborted";
      sessionFile?: string;
      parentToolCallId?: string;
    } | undefined;
    if (!payload?.id || !payload.status) return;
    const live = this.subagents.getSubagents().find((entry) => entry.id === payload.id);
    if (payload.status === "started") {
      if (live) this.rememberSubagentSnapshot(live as unknown as SubagentSnapshot);
      return;
    }
    const previous = (live as unknown as SubagentSnapshot | undefined) ?? this.subagentHistory.get(payload.id);
    const terminalStatus: SubagentSnapshot["status"] = payload.status === "failed"
      ? "failed"
      : payload.status === "aborted"
        ? "aborted"
        : "completed";
    this.rememberSubagentSnapshot({
      id: payload.id,
      index: payload.index ?? previous?.index ?? 0,
      agent: payload.agent ?? previous?.agent ?? payload.id,
      agentSource: payload.agentSource ?? previous?.agentSource ?? "bundled",
      description: payload.description ?? previous?.description,
      status: terminalStatus,
      task: previous?.task,
      assignment: previous?.assignment,
      sessionFile: payload.sessionFile ?? previous?.sessionFile,
      lastUpdate: Date.now(),
      parentToolCallId: payload.parentToolCallId ?? previous?.parentToolCallId,
      progress: previous?.progress
        ? { ...previous.progress, status: terminalStatus }
        : undefined,
    });
  }

  private getSubagentSnapshots(): SubagentSnapshot[] {
    for (const live of this.subagents.getSubagents()) {
      const snapshot = live as unknown as SubagentSnapshot;
      this.rememberSubagentSnapshot(snapshot);
    }
    const snapshots = new Map(this.subagentHistory);
    for (const live of this.subagents.getSubagents()) {
      const snapshot = live as unknown as SubagentSnapshot;
      snapshots.set(snapshot.id, snapshot);
    }
    return [...snapshots.values()].sort((left, right) => {
      const leftActive = left.status === "pending" || left.status === "running";
      const rightActive = right.status === "pending" || right.status === "running";
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      if (leftActive) return left.index - right.index || left.id.localeCompare(right.id);
      return right.lastUpdate - left.lastUpdate || left.id.localeCompare(right.id);
    });
  }

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  get cwd(): string {
    return this.inner.sessionManager.getCwd();
  }

  isAlive(): boolean {
    return this._alive;
  }

  isRunning(): boolean {
    return this._alive && (
      this.promptRunning
      || this.handoffRunning
      || this.inner.isStreaming
      || this.inner.isCompacting
      || this.inner.isBashRunning
      || this.subagents.getSubagents().length > 0
    );
  }
  bindToolUiContext(setter: (uiContext: ExtensionUiContextLike, hasUI: boolean) => void): void {
    setter(this.createExtensionUiContext(), true);
  }


  start(): void {
    this.syncPlanModeFromSession();
    this.unsubscribeSessionName = this.inner.sessionManager.onSessionNameChanged?.(() => {
      invalidateSessionListCache();
      this.emit({
        type: "session_name_changed",
        name: this.inner.sessionManager.getSessionName(),
      });
    }) ?? null;
    this.unsubscribe = this.inner.subscribe((event: AgentEvent) => {
      if (event.type === "agent_end") {
        invalidateSessionListCache();
      }
      if (IDLE_RESET_EVENT_TYPES.has(event.type)) this.resetIdleTimer();
      this.emit(event);
      if (event.type === "message_start" || event.type === "agent_end" || event.type === "agent_settled") {
        this.emitQueueUpdate();
      }
      if (RUNNING_STATE_EVENT_TYPES.has(event.type)) notifyRunningChange();
    });
    this.resetIdleTimer();
    notifyRunningChange();
  }

  setForceEmptySystemPrompt(force: boolean): void {
    this.forceEmptySystemPrompt = force;
    this.applyForcedEmptySystemPrompt();
  }

  beginExtensionBinding(options: ExtensionBindingOptions = {}): void {
    void this.ensureExtensionsBound(options).catch((err) => {
      console.error("[reeve] failed to dispatch session_start to extensions:", err instanceof Error ? err.message : err);
    });
  }

  async waitUntilReady(): Promise<void> {
    await this.waitForExtensionsBound();
  }

  private ensureExtensionsBound(options: ExtensionBindingOptions = {}): Promise<void> {
    if (options.forceEmptySystemPrompt) this.forceEmptySystemPrompt = true;
    if (this.extensionsBound) {
      this.applyForcedEmptySystemPrompt();
      return Promise.resolve();
    }
    if (this.extensionBindingPromise) return this.extensionBindingPromise;

    this.extensionBindingError = null;
    this.extensionBindingPromise = (async () => {
      if (!this._alive) return;
      // omp wires extensions the same way for every non-interactive host; reuse
      // its shared initializer so Reeve sessions expose exactly the action set
      // `omp --mode rpc` does, then layer our browser-backed UI context on top.
      await initializeExtensions(this.inner as never, {
        uiContext: this.createExtensionUiContext() as never,
        reportSendError: (action, error) => this.emit({
          type: "extension_error",
          extensionPath: action,
          event: "send",
          error: error.message,
        }),
        reportRuntimeError: (error) => this.emit({
          type: "extension_error",
          extensionPath: error.extensionPath,
          event: error.event,
          error: error.error,
        }),
        onShutdown: () => this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "notify",
          notifyType: "warning",
          message: "Extension requested shutdown, but shutdown is not supported in Reeve.",
        } as ExtensionUiRequest as AgentEvent),
      });
      this.extensionsBound = true;
      this.applyForcedEmptySystemPrompt();
      console.log(`[reeve] session_start dispatched to extensions for session ${this.inner.sessionId}`);
    })().catch((err) => {
      this.extensionBindingError = err;
      throw err;
    });

    return this.extensionBindingPromise;
  }

  private async waitForExtensionsBound(): Promise<void> {
    try {
      if (this.extensionBindingPromise) await this.extensionBindingPromise;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    if (this.extensionBindingError) {
      throw this.extensionBindingError instanceof Error
        ? this.extensionBindingError
        : new Error(String(this.extensionBindingError));
    }
  }

  private shouldWaitForExtensions(type: string): boolean {
    return type === "prompt"
      || type === "steer"
      || type === "follow_up"
      || type === "handoff"
      || type === "get_commands"
      || type === "execute_slash_command";
  }

  private queueSnapshot(): QueuedMessageSnapshot {
    const snapshot = this.queuedMessageEditor.snapshot(this.queuePaused);
    if (snapshot.items.length === 0) this.queuePaused = false;
    return { ...snapshot, paused: this.queuePaused };
  }

  private emitQueueUpdate(): QueuedMessageSnapshot {
    const snapshot = this.queueSnapshot();
    this.emit({ type: "queue_update", queuedMessages: snapshot });
    return snapshot;
  }

  private queueDraft(editToken: string, removed: RemovedQueuedMessage): QueuedMessageDraft {
    const draft = this.queuedMessageEditor.draft(removed);
    return {
      editToken,
      id: removed.id,
      kind: removed.kind,
      text: draft.text,
      images: draft.images,
    };
  }

  private async sendQueueItemNow(id: string): Promise<QueuedMessageSnapshot> {
    if (!this.queuePaused || this.inner.isStreaming) {
      if (!this.queuedMessageEditor.moveToSteering(id)) throw new Error("Queued message not found");
      return this.emitQueueUpdate();
    }

    const removed = this.queuedMessageEditor.remove(id);
    if (!removed) throw new Error("Queued message not found");
    const draft = this.queuedMessageEditor.draft(removed);
    this.queuePaused = false;
    try {
      await this.inner.steer(draft.text, draft.images?.length ? draft.images : undefined);
      this.queuedMessageEditor.adoptNewest("steer", removed.id);
      return this.emitQueueUpdate();
    } catch (error) {
      this.queuedMessageEditor.restore(removed);
      this.queuePaused = true;
      this.emitQueueUpdate();
      throw error;
    }
  }

  private async completeQueueEdit(
    editToken: string,
    message: string,
    images?: Array<{ type: "image"; data: string; mimeType: string }>,
  ): Promise<QueuedMessageSnapshot> {
    const removed = this.queuedMessageEdits.get(editToken);
    if (!removed) throw new Error("The queued message edit expired");
    this.queuedMessageEdits.delete(editToken);
    try {
      if (this.inner.isStreaming) {
        this.inner.maybeStartTitleGeneration(message);
        await this.inner.prompt(message, {
          streamingBehavior: removed.kind,
          ...(images?.length ? { images } : {}),
          userInitiated: true,
        });
      } else if (removed.kind === "steer") {
        await this.inner.steer(message, images);
      } else {
        await this.inner.followUp(message, images);
      }
      if (this.queuedMessageEditor.adoptNewest(removed.kind, removed.id)) {
        this.queuedMessageEditor.place(removed.id, removed.tokenIndex, removed.kind);
      }
      return this.emitQueueUpdate();
    } catch (error) {
      this.queuedMessageEditor.restore(removed);
      this.emitQueueUpdate();
      throw error;
    }
  }

  private async withFinalRunningNotification<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      this.resetIdleTimer();
      notifyRunningChange();
    }
  }

  private async shutdownAfterCommittedFork(newSessionId: string): Promise<void> {
    try {
      await this.shutdown();
    } catch (error) {
      // The forked session is already persisted. Cleanup failures must not
      // hide its id from the browser and strand the committed transition.
      console.error(
        `[reeve] fork created session ${newSessionId}, but wrapper shutdown failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private applyForcedEmptySystemPrompt(): void {
    if (this.forceEmptySystemPrompt && this.inner.agent.state) {
      this.inner.agent.state.systemPrompt = [];
    }
  }
  private syncPlanModeFromSession(): void {
    let state = this.inner.getPlanModeState?.();
    if (!state) {
      const entries = this.inner.sessionManager.getEntries() as Array<{
        type?: string;
        mode?: string;
        data?: Record<string, unknown>;
      }>;
      let persistedMode: (typeof entries)[number] | undefined;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index]?.type !== "mode_change") continue;
        persistedMode = entries[index];
        break;
      }
      const planFilePath = persistedMode?.data?.planFilePath;
      if (persistedMode?.mode === "plan" && typeof planFilePath === "string" && planFilePath.length > 0) {
        state = {
          enabled: true,
          planFilePath,
          workflow: persistedMode.data?.workflow === "sequential" ? "sequential" : "parallel",
          reentry: true,
        };
        this.inner.setPlanModeState?.(state);
      }
    }

    if (state?.enabled) {
      this.inner.setPlanProposalHandler?.((title) => this.handlePlanProposal(title));
    }
  }

  private async handlePlanProposal(title: string): Promise<{
    content: Array<{ type: "text"; text: string }>;
    details?: unknown;
  }> {
    const state = this.inner.getPlanModeState?.();
    if (!state?.enabled || !this.inner.preparePlanForReview) {
      throw new Error("Plan mode is not active.");
    }

    const review = await this.inner.preparePlanForReview(title);
    const planFilePath = review.details?.planFilePath;
    const resolvedTitle = review.details?.title;
    if (!planFilePath || !resolvedTitle) {
      throw new Error("The proposed plan could not be resolved.");
    }

    const planContent = await readPlanFile(planFilePath, {
      cwd: this.cwd,
      localProtocolOptions: {
        getArtifactsDir: () => this.inner.sessionManager.getArtifactsDir(),
        getSessionId: () => this.inner.sessionManager.getSessionId(),
      },
    });
    if (!planContent?.trim()) {
      throw new Error(`Plan file not found at ${planFilePath}`);
    }

    const responseValue = await this.requestExtensionUi(
      { method: "plan_review", title: resolvedTitle, planFilePath, planContent },
      JSON.stringify({ action: "refine" }),
      (response) => "value" in response ? response.value : JSON.stringify({ action: "refine" }),
    );
    let choice: { action?: unknown; feedback?: unknown } = {};
    try {
      choice = JSON.parse(responseValue) as { action?: unknown; feedback?: unknown };
    } catch {
      // Treat malformed or stale browser responses as a request to keep planning.
    }

    const details = { planFilePath, title: resolvedTitle, planExists: true };
    if (choice.action === "approve") {
      this.inner.setPlanReferencePath?.(planFilePath);
      this.inner.setPlanProposalHandler?.(null);
      this.inner.setPlanModeState?.(undefined);
      this.inner.sessionManager.appendModeChange("none");
      return {
        content: [{
          type: "text",
          text: `Plan approved at ${planFilePath}. Plan mode exited; proceed with the implementation.`,
        }],
        details,
      };
    }

    if (state.planFilePath !== planFilePath) {
      this.inner.setPlanModeState?.({ ...state, planFilePath });
      this.inner.sessionManager.appendModeChange("plan", { planFilePath });
    }
    const feedback = typeof choice.feedback === "string" ? choice.feedback.trim() : "";
    return {
      content: [{
        type: "text",
        text: [
          "Plan refinement requested.",
          feedback ? `User feedback:\n${feedback}` : "",
          `Update the plan file, then write ${resolvedTitle} to xd://propose again when ready.`,
        ].filter(Boolean).join("\n\n"),
      }],
      details,
    };
  }


  private emit(event: AgentEvent): void {
    const delivered = new Set<EventListener>();
    for (const listener of this.listeners) {
      delivered.add(listener);
      listener(event);
    }
    for (const channel of this.sessionEventChannels) {
      for (const listener of channel.listeners) {
        if (delivered.has(listener)) continue;
        delivered.add(listener);
        listener(event);
      }
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.isRunning() || this.collaboration.isActive()) {
        this.resetIdleTimer();
        return;
      }
      void this.shutdown().catch((error) => {
        console.error("[pi-web] failed to shut down idle session:", error instanceof Error ? error.message : error);
      });
    }, 10 * 60 * 1000);
  }

  private persistBashOnlySession(): void {
    const manager = this.inner.sessionManager;
    const sessionFile = manager.getSessionFile();
    if (!sessionFile || existsSync(sessionFile)) return;

    const header = manager.getHeader();
    if (!header) return;

    const content = [header, ...manager.getEntries()]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n";
    writeFileSync(sessionFile, content, { encoding: "utf8", flag: "wx" });

    // omp normally delays the first flush until an assistant message exists.
    // A leading shell command has no assistant message, so mark this SDK
    // manager as flushed after writing its own generated entries.
    (manager as unknown as { flushed: boolean }).flushed = true;
    cacheSessionPath(this.inner.sessionId, sessionFile);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    for (const event of this.pendingUiRequests.values()) listener(event);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    this.resetIdleTimer();
    const type = command.type as string;
    if (this.shouldWaitForExtensions(type)) await this.waitForExtensionsBound();
    if (this.handoffRunning && HANDOFF_ALLOWED_COMMAND_TYPES[type] !== true) {
      throw new Error("Cannot modify the session while a handoff is in progress");
    }
    if (type === "prompt" || type === "steer" || type === "follow_up") {
      this.syncPlanModeFromSession();
    }

    if (type === "prompt" || type === "steer" || type === "follow_up") {
      const imageError = validateAgentImages(command.images);
      if (imageError) throw new Error(imageError);
    }

    switch (type) {
      case "prompt": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot send a prompt while a shell command is running");
        }
        // Fire and forget — events come via subscribe
        const promptImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        const streamingBehavior = command.streamingBehavior as "steer" | "followUp" | undefined;
        if (!streamingBehavior) this.queuePaused = false;
        this.promptRunning = true;
        notifyRunningChange();
        this.inner.maybeStartTitleGeneration(command.message as string);
        this.inner.prompt(command.message as string, {
          ...(promptImages?.length ? { images: promptImages } : {}),
          ...(streamingBehavior ? { streamingBehavior } : {}),
          userInitiated: true,
        }).then(() => {
          this.promptRunning = false;
          this.resetIdleTimer();
          if (streamingBehavior) this.emitQueueUpdate();
          if (!streamingBehavior) this.emit({ type: "prompt_done" });
          notifyRunningChange();
        }).catch((error) => {
          this.promptRunning = false;
          this.resetIdleTimer();
          invalidateSessionListCache();
          this.emit({
            type: "prompt_error",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          if (!streamingBehavior) this.emit({ type: "prompt_done" });
          notifyRunningChange();
        });
        return null;
      }

      case "abort":
        this.queuedMessageEditor.parkAllAsFollowUp();
        await this.withFinalRunningNotification(() => this.inner.abort({ reason: "Interrupted by user" }));
        this.queuePaused = this.queueSnapshot().items.length > 0;
        this.emitQueueUpdate();
        return null;

      case "get_state": {
        const model = this.inner.model;
        const contextUsage = this.inner.getContextUsage();
        return {
          sessionId: this.inner.sessionId,
          sessionFile: this.inner.sessionFile ?? "",
          isStreaming: this.inner.isStreaming,
          isPromptRunning: this.promptRunning,
          isBashRunning: this.inner.isBashRunning,
          isCompacting: this.inner.isCompacting,
          isHandoffRunning: this.handoffRunning,
          autoCompactionEnabled: this.inner.autoCompactionEnabled,
          autoRetryEnabled: this.inner.autoRetryEnabled,
          approvalMode: this.inner.settings.get("tools.approvalMode"),
          model: model ? { id: model.id, provider: model.provider } : undefined,
          messageCount: 0,
          pendingMessageCount: this.inner.queuedMessageCount,
          queuedMessages: this.queueSnapshot(),
          contextUsage: contextUsage
            ? { percent: contextUsage.percent, contextWindow: contextUsage.contextWindow, tokens: contextUsage.tokens }
            : null,
          systemPrompt: [this.inner.agent.state?.systemPrompt ?? ""].flat().join("\n"),
          thinkingLevel: this.inner.configuredThinkingLevel() ?? this.inner.agent.state?.thinkingLevel ?? "off",
          ...fastModeState(this.inner, model),
          extensionStatuses: this.getExtensionStatuses(),
          extensionWidgets: this.getExtensionWidgets(),
          subagents: this.getSubagentSnapshots(),
          collaboration: this.collaboration.snapshot(),
        };
      }
      case "get_subagents":
        return { subagents: this.getSubagentSnapshots() };

      case "get_subagent_messages": {
        const selector = command as {
          subagentId?: string;
          sessionFile?: string;
          fromByte?: number;
        };
        const transcriptFile = this.subagents.resolveSessionFile(selector);
        return readRpcSubagentTranscript(transcriptFile, selector.fromByte);
      }


      case "set_model": {
        const { provider, modelId, role } = command as { provider: string; modelId: string; role?: string };
        // modelRegistry.find() takes (provider, modelId) as two arguments — passing a
        // pre-joined "provider/modelId" selector leaves modelId undefined and throws
        // inside the SDK before we ever get a chance to report "model not found".
        let model = this.inner.modelRegistry.find(provider, modelId);
        if (!model) {
          await this.inner.modelRegistry.refresh("offline");
          model = this.inner.modelRegistry.find(provider, modelId);
        }
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        // omp records the role a model change came from, so the transcript and
        // the `/model` carousel agree on which role is currently driving.
        await this.inner.setModel(model, role);
        invalidateModelsCache();
        invalidateSessionListCache();
        return {
          id: model.id,
          provider: model.provider,
          ...(role ? { role } : {}),
          ...fastModeState(this.inner, model),
        };
      }

      case "set_role_model": {
        const role = command.role as string;
        const model = this.inner.resolveRoleModel(role);
        if (!model) throw new Error(`No model configured for role "${role}"`);
        await this.inner.setModel(model, role);
        invalidateModelsCache();
        invalidateSessionListCache();
        return { id: model.id, provider: model.provider, role, ...fastModeState(this.inner, model) };
      }

      case "fork": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot fork while a shell command is running");
        }
        const sessionManager = this.inner.sessionManager;
        const entryId = resolveForkEntryId(
          sessionManager.getBranch() as ForkBranchEntry[],
          command.entryId,
        );
        if (!entryId) throw new Error("No user message to fork from yet");
        const currentSessionFile = this.inner.sessionFile;

        if (!currentSessionFile) return { cancelled: true };

        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");

        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile: string;

        if (!entry.parentId) {
          // Fork before the first message: create an empty session linked to this one
          const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
          await newManager.newSession({ parentSession: currentSessionFile });
          await newManager.ensureOnDisk();
          newSessionFile = newManager.getSessionFile() as string;
        } else {
          // Fork after some history: copy path up to (but not including) the fork point
          const sourceManager = await SessionManager.open(currentSessionFile, sessionDir);
          const forkedPath = sourceManager.createBranchedSession(entry.parentId);
          if (!forkedPath) throw new Error("Failed to create forked session");
          newSessionFile = forkedPath;
        }

        const newSessionId = (await SessionManager.open(newSessionFile, sessionDir)).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        invalidateSessionListCache();
        await this.shutdownAfterCommittedFork(newSessionId);
        return { cancelled: false, newSessionId };
      }

      case "handoff": {
        // omp 18 made handoff in-place: it summarizes the conversation into a
        // handoff document and commits that as this session's compaction entry
        // instead of minting a replacement session. It still rewrites history
        // behind a oneshot model call, so it must not run while a prompt is
        // streaming or any other work owns the session.
        if (this.handoffRunning || this.promptRunning || this.inner.isStreaming || this.inner.isCompacting || this.inner.isBashRunning) {
          throw new Error("Cannot hand off while the session is busy");
        }
        const customInstructions = command.customInstructions as string | undefined;
        this.handoffRunning = true;
        notifyRunningChange();
        try {
          // No result means the handoff was cancelled; the session is untouched.
          const result = await this.inner.handoff(customInstructions);
          if (!result) return { cancelled: true };
          // The session id and file are unchanged, so only the cached listing
          // (modified time, token counts) has gone stale.
          invalidateSessionListCache();
          return { cancelled: false };
        } finally {
          this.handoffRunning = false;
          notifyRunningChange();
        }
      }

      case "navigate_tree": {
        if (this.inner.isBashRunning) {
          throw new Error("Cannot navigate while a shell command is running");
        }
        const result = await this.inner.navigateTree(command.targetId as string, {});
        return { cancelled: result.cancelled };
      }

      case "set_thinking_level": {
        const level = command.level as string;
        this.inner.setThinkingLevel(level);
        // setThinkingLevel clamps xhigh→high for models where supportsXhigh()===false.
        // If the model has DeepSeek thinking compat (reasoningEffortMap maps xhigh→max),
        // force the state back so the compat layer can use it correctly.
        if (level === "xhigh" && (this.inner.model as { compat?: { thinkingFormat?: string } } | null)?.compat?.thinkingFormat === "deepseek" && this.inner.agent?.state) {
          this.inner.agent.state.thinkingLevel = "xhigh";
        }
        invalidateSessionListCache();
        return null;
      }

      case "set_fast_mode": {
        const supported = this.inner.setFastMode(command.enabled === true);
        invalidateSessionListCache();
        return {
          supported,
          enabled: supported && this.inner.isFastModeEnabled(),
        };
      }

      case "cycle_thinking_level": {
        const level = this.inner.cycleThinkingLevel();
        invalidateSessionListCache();
        return level === undefined
          ? { supported: false }
          : { supported: true, level };
      }

      case "compact": {
        try {
          return await this.withFinalRunningNotification(() =>
            this.inner.compact(command.customInstructions as string | undefined)
          );
        } finally {
          invalidateSessionListCache();
        }
      }

      case "set_session_name": {
        const name = (command.name as string | undefined)?.trim();
        if (!name) throw new Error("Session name cannot be empty");
        await this.inner.sessionManager.setSessionName(name, "user");
        invalidateSessionListCache();
        return null;
      }

      case "get_session_stats": {
        return {
          ...this.inner.getSessionStats(),
          sessionName: this.inner.sessionManager.getSessionName(),
        };
      }

      case "get_last_assistant_text": {
        return { text: this.inner.getLastAssistantText() ?? "" };
      }

      case "set_auto_compaction": {
        this.inner.setAutoCompactionEnabled(command.enabled as boolean);
        return null;
      }

      case "clear_queue": {
        // Full clear only: omp has no single-item dequeue, and clear+requeue
        // races against the agent loop pulling messages mid-flight.
        const cleared = this.inner.clearQueue();
        const toText = (message: unknown): string =>
          typeof message === "string" ? message : String((message as { text?: string })?.text ?? "");
        this.queuePaused = false;
        this.emitQueueUpdate();
        return { steering: cleared.steering.map(toText), followUp: cleared.followUp.map(toText) };
      }

      case "resolve_paused_queue_submission": {
        if (command.clearQueue) this.inner.clearQueue();
        this.queuePaused = false;
        return this.emitQueueUpdate();
      }

      case "delete_queue_item": {
        const removed = this.queuedMessageEditor.remove(command.id as string);
        if (!removed) throw new Error("Queued message not found");
        const undoToken = randomUUID();
        this.deletedQueuedMessages.set(undoToken, removed);
        if (this.deletedQueuedMessages.size > MAX_QUEUED_MESSAGE_UNDOS) {
          const oldest = this.deletedQueuedMessages.keys().next().value;
          if (oldest) this.deletedQueuedMessages.delete(oldest);
        }
        return { undoToken, queuedMessages: this.emitQueueUpdate() };
      }

      case "undo_delete_queue_item": {
        const undoToken = command.undoToken as string;
        const removed = this.deletedQueuedMessages.get(undoToken);
        if (!removed) throw new Error("The queued message undo expired");
        this.deletedQueuedMessages.delete(undoToken);
        this.queuedMessageEditor.restore(removed);
        return this.emitQueueUpdate();
      }

      case "begin_queue_edit": {
        const removed = this.queuedMessageEditor.remove(command.id as string);
        if (!removed) throw new Error("Queued message not found");
        const editToken = randomUUID();
        this.queuedMessageEdits.set(editToken, removed);
        return { ...this.queueDraft(editToken, removed), queuedMessages: this.emitQueueUpdate() };
      }

      case "cancel_queue_edit": {
        const editToken = command.editToken as string;
        const removed = this.queuedMessageEdits.get(editToken);
        if (!removed) throw new Error("The queued message edit expired");
        this.queuedMessageEdits.delete(editToken);
        this.queuedMessageEditor.restore(removed);
        return this.emitQueueUpdate();
      }

      case "complete_queue_edit": {
        const editImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        return this.completeQueueEdit(
          command.editToken as string,
          command.message as string,
          editImages?.length ? editImages : undefined,
        );
      }

      case "reorder_queue_items": {
        this.queuedMessageEditor.reorder(command.ids as string[]);
        return this.emitQueueUpdate();
      }

      case "send_queue_item_now":
        return this.sendQueueItemNow(command.id as string);

      case "resume_queue": {
        const first = this.queueSnapshot().items[0];
        if (!first) return this.emitQueueUpdate();
        return this.sendQueueItemNow(first.id);
      }

      case "steer": {
        const steerImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.steer(command.message as string, steerImages?.length ? steerImages : undefined);
        return this.emitQueueUpdate();
      }

      case "follow_up": {
        const followImages = command.images as Array<{ type: "image"; data: string; mimeType: string }> | undefined;
        await this.inner.followUp(command.message as string, followImages?.length ? followImages : undefined);
        return this.emitQueueUpdate();
      }

      case "get_tools": {
        const active = new Set<string>(this.inner.getActiveToolNames());
        return listTools(this.inner).map((t) => ({
          name: t.name,
          description: t.description,
          active: active.has(t.name),
        }));
      }

      case "get_commands": {
        return { commands: await getAvailableSlashCommands(this.inner) };
      }
      case "collab": {
        return this.collaboration.execute(typeof command.args === "string" ? command.args : "");
      }
      case "execute_slash_command": {
        const output: string[] = [];
        const result: AcpBuiltinSlashCommandResult = await executeAcpBuiltinSlashCommand(command.message as string, {
          session: this.inner as never,
          sessionManager: this.inner.sessionManager,
          settings: this.inner.settings,
          cwd: this.cwd,
          output: (text) => {
            output.push(text);
          },
          refreshCommands: () => {},
          reloadPlugins: async () => {
            await this.waitForExtensionsBound();
            this.extensionStatuses.clear();
            this.extensionWidgets.clear();
            await this.inner.reload();
            await this.inner.refreshSkills?.();
            this.applyForcedEmptySystemPrompt();
            invalidateModelsCache();
          },
        });
        if (result === false) return { handled: false, output };
        return {
          handled: true,
          output,
          ...("prompt" in result ? { prompt: result.prompt } : {}),
        };
      }


      case "set_tools": {
        const toolNames = command.toolNames as string[];
        this.setForceEmptySystemPrompt(toolNames.length === 0);
        await this.inner.setActiveToolsByName(withExtensionTools(this.inner, toolNames));
        this.applyForcedEmptySystemPrompt();
        return null;
      }

      case "reload": {
        await this.waitForExtensionsBound();
        this.extensionStatuses.clear();
        this.extensionWidgets.clear();
        await this.inner.reload();
        await this.inner.refreshSkills?.();
        this.applyForcedEmptySystemPrompt();
        invalidateModelsCache();
        return { success: true };
      }

      case "abort_compaction": {
        this.inner.abortCompaction();
        return null;
      }

      case "extension_ui_response": {
        this.resolveExtensionUiResponse(command as ExtensionUiResponse);
        return null;
      }

      case "extension_ui_input": {
        this.handleExtensionUiInput(command.id as string, command.data as string);
        return null;
      }

      case "set_auto_retry": {
        this.inner.setAutoRetryEnabled(command.enabled as boolean);
        return null;
      }

      case "bash": {
        if (this.promptRunning || this.inner.isStreaming || this.inner.isCompacting || this.inner.isBashRunning) {
          throw new Error("Cannot run a shell command while the session is busy");
        }
        const execution = this.inner.executeBash(
          command.command as string,
          undefined,
          { excludeFromContext: command.excludeFromContext as boolean | undefined },
        );
        notifyRunningChange();
        try {
          const result = await execution;
          this.persistBashOnlySession();
          return result;
        } finally {
          this.resetIdleTimer();
          invalidateSessionListCache();
          notifyRunningChange();
        }
      }

      case "abort_bash": {
        this.inner.abortBash();
        return null;
      }

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    void this.collaboration.stop("session closed");
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.inner.isBashRunning) this.inner.abortBash();
    this.unsubscribe?.();
    this.unsubscribeSessionName?.();
    for (const channel of this.sessionEventChannels) releaseSessionEventChannel(channel);
    this.subagents.dispose();
    this.subagentHistory.clear();
    this.queuedMessageEdits.clear();
    this.deletedQueuedMessages.clear();
    for (const pending of this.pendingUiResponses.values()) pending.cancel();
    for (const id of Array.from(this.activeCustomUis.keys())) this.closeCustomUi(id, undefined);
    this.pendingUiResponses.clear();
    this.pendingUiRequests.clear();
    try {
      void this.inner.dispose?.();
    } finally {
      try {
        this.onDestroyCallback?.();
      } finally {
        notifyRunningChange();
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    if (!this._alive) return;

    this.shutdownPromise = (async () => {
      try {
        await this.collaboration.stop("session closed");
        try {
          await this.waitForExtensionsBound();
        } catch (error) {
          console.error(
            "[pi-web] extension binding failed before session shutdown:",
            error instanceof Error ? error.message : error,
          );
        }
        await this.inner.extensionRunner?.emit?.({ type: "session_shutdown", reason: "quit" });
      } finally {
        this.destroy();
      }
    })();
    return this.shutdownPromise;
  }

  private resolveExtensionUiResponse(response: ExtensionUiResponse): void {
    const pending = this.pendingUiResponses.get(response.id);
    if (!pending) return;
    pending.resolve(response);
  }

  private getExtensionStatuses(): Array<{ key: string; text: string }> {
    return Array.from(this.extensionStatuses, ([key, text]) => ({ key, text }));
  }

  private getExtensionWidgets(): ExtensionWidgetItem[] {
    return Array.from(this.extensionWidgets.values());
  }

  private getCustomUiWidth(options: unknown): number {
    if (!options || typeof options !== "object") return DEFAULT_CUSTOM_UI_COLUMNS;
    const overlayOptions = (options as { overlayOptions?: unknown }).overlayOptions;
    const resolved = typeof overlayOptions === "function" ? overlayOptions() : overlayOptions;
    if (!resolved || typeof resolved !== "object") return DEFAULT_CUSTOM_UI_COLUMNS;
    const width = (resolved as { width?: unknown }).width;
    return typeof width === "number" && Number.isFinite(width)
      ? Math.max(40, Math.min(140, Math.round(width)))
      : 92;
  }

  private emitCustomUiRender(id: string, custom: ActiveCustomUi): void {
    let lines: string[];
    try {
      lines = custom.component.render(custom.width);
    } catch (error) {
      lines = [`Extension custom UI render failed: ${error instanceof Error ? error.message : String(error)}`];
    }
    const event = {
      type: "extension_ui_request",
      id,
      method: "custom",
      lines,
    } as ExtensionUiRequest as AgentEvent;
    this.pendingUiRequests.set(id, event);
    this.emit(event);
  }

  private closeCustomUi(id: string, value: unknown): void {
    const custom = this.activeCustomUis.get(id);
    if (!custom || custom.settled) return;
    custom.settled = true;
    this.activeCustomUis.delete(id);
    this.pendingUiRequests.delete(id);
    try {
      custom.component.dispose?.();
    } catch {
      // Ignore dispose errors from extension UI components.
    }
    this.emit({
      type: "extension_ui_request",
      id,
      method: "custom",
      lines: [],
      closed: true,
    } as ExtensionUiRequest as AgentEvent);
    custom.resolve(value);
  }

  private handleExtensionUiInput(id: string, data: string): void {
    const custom = this.activeCustomUis.get(id);
    if (!custom || typeof data !== "string") return;
    try {
      custom.component.handleInput?.(data);
      if (this.activeCustomUis.has(id)) this.emitCustomUiRender(id, custom);
    } catch (error) {
      this.closeCustomUi(id, undefined);
      this.emit({
        type: "extension_error",
        extensionPath: `custom-ui:${id}`,
        event: "custom_ui_input",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private requestExtensionCustomUi<T>(
    factory: unknown,
    options?: unknown,
  ): Promise<T> {
    if (typeof factory !== "function") return Promise.resolve(undefined as T);

    const id = randomUUID();
    const width = this.getCustomUiWidth(options);

    return new Promise<T>((resolve) => {
      let completed = false;
      const tui = createHeadlessCustomUiTui(
        () => {
          const custom = this.activeCustomUis.get(id);
          if (custom) this.emitCustomUiRender(id, custom);
        },
        width,
      );
      const finish = (value: T) => {
        if (completed) return;
        completed = true;
        resolve(value);
      };
      const done = (value: T) => {
        if (this.activeCustomUis.has(id)) {
          this.closeCustomUi(id, value);
        } else {
          finish(value);
        }
      };

      Promise.resolve()
        .then(() => factory(tui, PLAIN_TEXT_THEME, CUSTOM_UI_KEYBINDINGS, done))
        .then((component) => {
          if (completed) {
            try {
              (component as CustomUiComponent | undefined)?.dispose?.();
            } catch {
              // Ignore dispose errors from a component completed before mounting.
            }
            return;
          }
          if (!component || typeof component !== "object" || typeof (component as CustomUiComponent).render !== "function") {
            finish(undefined as T);
            return;
          }
          const custom: ActiveCustomUi = {
            component: component as CustomUiComponent,
            width,
            resolve: (value) => finish(value as T),
            settled: false,
          };
          this.activeCustomUis.set(id, custom);
          this.emitCustomUiRender(id, custom);
        })
        .catch((error) => {
          if (completed) return;
          this.emit({
            type: "extension_error",
            extensionPath: `custom-ui:${id}`,
            event: "custom_ui",
            error: error instanceof Error ? error.message : String(error),
          });
          finish(undefined as T);
        });
    });
  }

  private requestExtensionUi<T>(
    request: ExtensionUiRequestBody,
    defaultValue: T,
    parseResponse: (response: ExtensionUiResponse) => T,
    timeout?: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.resolve(defaultValue);

    const id = randomUUID();
    const fullRequest = {
      type: "extension_ui_request",
      id,
      ...request,
      ...(timeout ? { timeout, expiresAt: Date.now() + timeout } : {}),
    };

    return new Promise((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
        this.pendingUiRequests.delete(id);
        this.pendingUiResponses.delete(id);
      };
      const settle = (value: T) => {
        cleanup();
        resolve(value);
      };
      const onAbort = () => settle(defaultValue);

      if (timeout) timeoutId = setTimeout(() => settle(defaultValue), timeout);
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pendingUiRequests.set(id, fullRequest as AgentEvent);
      this.pendingUiResponses.set(id, {
        resolve: (response) => settle(parseResponse(response)),
        cancel: () => settle(defaultValue),
      });
      this.emit(fullRequest as AgentEvent);
    });
  }

  private createExtensionUiContext(): ExtensionUiContextLike {
    return {
      timeoutStartsOnPresentation: false,
      askDialog: (questions, opts) => this.requestExtensionUi(
        { method: "ask", questions, ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => {
          if (!("value" in response)) return undefined;
          try {
            return JSON.parse(response.value) as ExtensionAskDialogResult;
          } catch {
            return undefined;
          }
        },
        opts?.timeout,
        opts?.signal,
      ),
      select: (title, options, opts) => this.requestExtensionUi(
        { method: "select", title, options, ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        opts?.timeout,
        opts?.signal,
      ),
      confirm: (title, message, opts) => this.requestExtensionUi(
        { method: "confirm", title, message, ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        false,
        (response) => "confirmed" in response ? response.confirmed : false,
        opts?.timeout,
        opts?.signal,
      ),
      input: (title, placeholder, opts) => this.requestExtensionUi(
        { method: "input", title, ...(placeholder !== undefined ? { placeholder } : {}), ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        opts?.timeout,
        opts?.signal,
      ),
      editor: (title, prefill, opts) => this.requestExtensionUi(
        { method: "editor", title, ...(prefill !== undefined ? { prefill } : {}), ...(opts?.timeout ? { timeout: opts.timeout } : {}) },
        undefined,
        (response) => "value" in response ? response.value : undefined,
        opts?.timeout,
        opts?.signal,
      ),
      notify: (message, type) => {
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "notify",
          message,
          notifyType: type,
        } as ExtensionUiRequest as AgentEvent);
      },
      onTerminalInput: () => () => {},
      setStatus: (key, text) => {
        if (text === undefined) this.extensionStatuses.delete(key);
        else this.extensionStatuses.set(key, text);
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setStatus",
          statusKey: key,
          statusText: text,
        } as ExtensionUiRequest as AgentEvent);
      },
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: (key, content, options) => {
        if (content !== undefined && !Array.isArray(content)) return;
        if (content === undefined) {
          this.extensionWidgets.delete(key);
        } else {
          this.extensionWidgets.set(key, {
            key,
            lines: content,
            placement: options?.placement ?? "aboveEditor",
          });
        }
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setWidget",
          widgetKey: key,
          widgetLines: content,
          widgetPlacement: options?.placement,
        } as ExtensionUiRequest as AgentEvent);
      },
      setFooter: () => {},
      setHeader: () => {},
      setTitle: (title) => {
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setTitle",
          title,
        } as ExtensionUiRequest as AgentEvent);
      },
      custom: <T = unknown>(factory: unknown, options?: unknown) => this.requestExtensionCustomUi<T>(factory, options),
      pasteToEditor: (text) => {
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "set_editor_text",
          text,
        } as ExtensionUiRequest as AgentEvent);
      },
      setEditorText: (text) => {
        this.emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "set_editor_text",
          text,
        } as ExtensionUiRequest as AgentEvent);
      },
      getEditorText: () => "",
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      get theme() { return PLAIN_TEXT_THEME; },
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: "Theme switching is not supported in the Reeve extension interface yet" }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
    };
  }
}

// ============================================================================
// Session registry
// ============================================================================

declare global {
  var __ompSessions: Map<string, AgentSessionWrapper> | undefined;
  var __ompStartLocks: Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
  var __ompSessionEventChannels: Map<string, SessionEventChannel> | undefined;
  var __ompStartingSessionCwds: Map<string, number> | undefined;
  var __ompRunningListeners: Set<(ids: string[]) => void> | undefined;
}

function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__ompSessions) {
    globalThis.__ompSessions = new Map();
    const cleanup = () => globalThis.__ompSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__ompSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__ompStartLocks) globalThis.__ompStartLocks = new Map();
  return globalThis.__ompStartLocks;
}

function getSessionEventChannels(): Map<string, SessionEventChannel> {
  if (!globalThis.__ompSessionEventChannels) globalThis.__ompSessionEventChannels = new Map();
  return globalThis.__ompSessionEventChannels;
}

function getSessionEventChannel(sessionId: string): SessionEventChannel {
  const channels = getSessionEventChannels();
  let channel = channels.get(sessionId);
  if (!channel) {
    channel = { sessionId, listeners: new Set(), attachedWrappers: 0 };
    channels.set(sessionId, channel);
  }
  return channel;
}

function acquireSessionEventChannel(sessionId: string): SessionEventChannel {
  const channel = getSessionEventChannel(sessionId);
  channel.attachedWrappers += 1;
  return channel;
}

function pruneSessionEventChannel(channel: SessionEventChannel): void {
  if (channel.attachedWrappers === 0 && channel.listeners.size === 0) {
    const channels = getSessionEventChannels();
    if (channels.get(channel.sessionId) === channel) channels.delete(channel.sessionId);
  }
}

function releaseSessionEventChannel(channel: SessionEventChannel): void {
  channel.attachedWrappers -= 1;
  pruneSessionEventChannel(channel);
}

export function subscribeRpcSessionEvents(sessionId: string, listener: EventListener): () => void {
  const channel = getSessionEventChannel(sessionId);
  channel.listeners.add(listener);
  return () => {
    channel.listeners.delete(listener);
    pruneSessionEventChannel(channel);
  };
}

function normalizeRpcCwd(cwd: string): string {
  const resolvedCwd = resolve(cwd);
  try {
    return realpathSync(resolvedCwd);
  } catch {
    return resolvedCwd;
  }
}

function getStartingSessionCwds(): Map<string, number> {
  if (!globalThis.__ompStartingSessionCwds) globalThis.__ompStartingSessionCwds = new Map();
  return globalThis.__ompStartingSessionCwds;
}

function trackStartingSession(cwd: string): () => void {
  const startingCwds = getStartingSessionCwds();
  const key = normalizeRpcCwd(cwd);
  startingCwds.set(key, (startingCwds.get(key) ?? 0) + 1);
  return () => {
    const remaining = (startingCwds.get(key) ?? 1) - 1;
    if (remaining > 0) startingCwds.set(key, remaining);
    else startingCwds.delete(key);
  };
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function applyApprovalModeToRpcSessions(mode: ApprovalMode): void {
  for (const session of getRegistry().values()) {
    if (!session.isAlive()) continue;
    session.inner.settings.override("tools.approvalMode", mode);
  }
}

function runtimeMessageText(entry: SessionMessageEntry): string {
  if (entry.message.role === "bashExecution") return "";
  const content = entry.message.content;
  if (typeof content === "string") return content;
  return content
    .map((block) => block.type === "text" ? block.text : "")
    .filter(Boolean)
    .join(" ");
}

function runtimeMessageActivityMs(entry: SessionMessageEntry): number | undefined {
  if (entry.message.role !== "user" && entry.message.role !== "assistant") return undefined;
  if (typeof entry.message.timestamp === "number") return entry.message.timestamp;
  const timestamp = new Date(entry.timestamp).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

/**
 * Return live sessions that should be visible in the session list. Pi delays
 * the first JSONL flush until an assistant message exists, so an accepted new
 * prompt must temporarily be described from its in-memory SessionManager.
 */
export function getRpcSessionInfos(): SessionInfo[] {
  const sessions: SessionInfo[] = [];
  for (const session of getRegistry().values()) {
    if (!session.isAlive()) continue;

    const manager = session.inner.sessionManager;
    const header = manager.getHeader();
    const entries = manager.getEntries() as unknown as Array<
      { type: string; timestamp: string } | SessionMessageEntry
    >;
    const messages = entries.filter((entry): entry is SessionMessageEntry => entry.type === "message");
    const firstUserMessage = messages.find((entry) => entry.message.role === "user");
    const sessionFile = manager.getSessionFile() ?? session.sessionFile;
    const persisted = Boolean(sessionFile && existsSync(sessionFile));

    // An ensure_session call creates an idle, empty runtime while the composer
    // loads commands. Do not leak it into history before a prompt is accepted.
    if (!persisted && (!session.isRunning() || !firstUserMessage)) continue;

    const created = header?.timestamp
      ?? entries[0]?.timestamp
      ?? new Date().toISOString();
    const headerTimestamp = new Date(created).getTime();
    let lastActivityMs = Number.isNaN(headerTimestamp) ? Date.now() : headerTimestamp;
    for (const message of messages) {
      const activityMs = runtimeMessageActivityMs(message);
      if (activityMs !== undefined) lastActivityMs = Math.max(lastActivityMs, activityMs);
    }

    sessions.push({
      path: sessionFile ?? "",
      id: header?.id ?? session.sessionId,
      cwd: header?.cwd ?? session.cwd,
      name: manager.getSessionName(),
      created,
      modified: new Date(lastActivityMs).toISOString(),
      messageCount: messages.length,
      firstMessage: firstUserMessage ? runtimeMessageText(firstUserMessage) || "(no messages)" : "(no messages)",
      transient: !persisted,
    });
  }
  return sessions;
}

export function hasBusyRpcSessionForCwd(cwd: string): boolean {
  const targetCwd = normalizeRpcCwd(cwd);
  if (getStartingSessionCwds().has(targetCwd)) return true;
  return Array.from(getRegistry().values()).some(
    (session) => normalizeRpcCwd(session.cwd) === targetCwd && session.isRunning(),
  );
}

export async function destroyRpcSessionsForCwd(cwd: string): Promise<number> {
  const targetCwd = normalizeRpcCwd(cwd);
  const sessions = Array.from(getRegistry().values()).filter(
    (session) => normalizeRpcCwd(session.cwd) === targetCwd,
  );
  await Promise.all(sessions.map((session) => session.shutdown()));
  return sessions.length;
}

export function getRunningRpcSessionIds(): string[] {
  const ids = new Set<string>();
  for (const [sessionId, session] of getRegistry()) {
    if (session.isRunning()) ids.add(session.sessionId || sessionId);
  }
  return [...ids];
}

// ----------------------------------------------------------------------------
// Running-status broadcaster
//
// Pushes the current set of running session ids to subscribers whenever any
// session's running state may have changed. This lets the sidebar receive live
// updates over SSE instead of polling. Listeners live on globalThis so they
// survive Next.js hot-reload.
// ----------------------------------------------------------------------------

function getRunningListeners(): Set<(ids: string[]) => void> {
  if (!globalThis.__ompRunningListeners) globalThis.__ompRunningListeners = new Set();
  return globalThis.__ompRunningListeners;
}

/** Subscribe to running-session-id changes. Returns an unsubscribe function. */
export function subscribeRunningSessions(listener: (ids: string[]) => void): () => void {
  const listeners = getRunningListeners();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let lastRunningSnapshot = "";

/**
 * Recompute the running-session-id set and, if it changed since the last
 * notification, broadcast it to subscribers.
 */
export function notifyRunningChange(): void {
  const listeners = getRunningListeners();
  if (listeners.size === 0) {
    // A future subscriber receives its own initial snapshot. Clear this one so
    // its first state transition cannot match stale state from an old listener.
    lastRunningSnapshot = "";
    return;
  }
  const ids = getRunningRpcSessionIds();
  const snapshot = JSON.stringify([...ids].sort());
  if (snapshot === lastRunningSnapshot) return;
  lastRunningSnapshot = snapshot;
  for (const listener of listeners) {
    try { listener(ids); } catch { /* ignore listener errors */ }
  }
}

/**
 * Get or create an AgentSession for the given session.
 * For new sessions (sessionFile === ""), omp generates its own id.
 * New sessions resolve enabledModels before construction so the initial model,
 * thinking pin, and SDK scopedModels share one settings snapshot.
 * Pass options.toolNames to pre-configure active tools (empty = all disabled).
 */
export async function startRpcSession(
  sessionId: string,
  sessionFile: string,
  cwd: string | undefined,
  options: RpcSessionStartOptions = {},
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const { toolNames, initialModel, thinkingLevel } = options;
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return { session: existing, realSessionId: sessionId };

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    // Some extensions access the SDK's global theme even outside the terminal UI.
    await initTheme(false);
    const agentDir = getAgentDir();
    const sessionManager = sessionFile
      ? await SessionManager.open(sessionFile, undefined)
      : (() => {
        if (!cwd) throw new Error("cwd is required for a new session");
        return SessionManager.create(cwd, undefined);
      })();
    const sessionCwd = sessionManager.getCwd();
    const finishStartingSession = trackStartingSession(sessionCwd);

    try {
      const runtime = await getOmpRuntime();
      const settings = await getSettingsForCwd(sessionCwd);

      // Determine which tools to pass based on requested toolNames.
      let toolsOption: string[] | undefined;
      if (toolNames !== undefined) {
        // toolNames === [] -> "all off" (an empty allow-list disables every tool).
        // Otherwise DO NOT pass a builtin-only allow-list: passing CODING_TOOL_NAMES
        // set allowedToolNames to coding builtins only, which filtered every
        // extension/package-provided tool (e.g. subagents, web access) out of the
        // tool registry — so they were unavailable in Reeve sessions even though the
        // `omp` CLI keeps them. Leaving the allow-list unset lets the SDK register all
        // tools (and activate extension tools); we narrow the ACTIVE set below.
        toolsOption = toolNames.length === 0 ? [] : undefined;
      }

      // Gate untrusted project code so opening a repository in a browser tab does
      // not run its `.omp/extensions`, `.omp/tools`, or `.mcp.json` servers (see
      // lib/project-trust.ts). Discovery still runs — only project-local entries
      // are dropped, so user-level extensions keep working.
      const [extensionPaths, customToolPaths] = await Promise.all([
        discoverSessionExtensionPaths({}, sessionCwd, settings),
        discoverCustomToolPaths([], sessionCwd),
      ]);
      const untrusted = untrustedProjectSessionOptions(sessionCwd, agentDir, { extensionPaths, customToolPaths });

      // `SYSTEM.md` / `APPEND_SYSTEM.md`, resolved against this session's cwd the
      // way the CLI resolves them against its own (lib/session-system-prompt.ts).
      const systemPrompts = await resolveSessionSystemPrompts(sessionCwd);

      const { modelRegistry } = runtime;
      const scope = await resolveVisibleModels(modelRegistry, settings.get("enabledModels"), settings);
      const defaultRole = readDefaultModelRole(settings);
      const hasExistingMessages = sessionManager.buildSessionContext().messages.length > 0;
      const scopedThinkingLevel = thinkingLevel === "auto" ? undefined : thinkingLevel;
      const initial = hasExistingMessages
        ? { scopedModels: [...scope.scopedModels], model: undefined, thinkingLevel: undefined }
        : selectInitialModelScope(scope, {
          ...(initialModel ? { requestedModel: initialModel } : {}),
          ...(defaultRole ? { defaultModel: defaultRole } : {}),
          ...(scopedThinkingLevel ? { thinkingLevel: scopedThinkingLevel } : {}),
        });
      const sessionOptions: CreateAgentSessionOptions = {
        cwd: sessionCwd,
        agentDir,
        settings,
        sessionManager,
        modelRegistry,
        hasUI: true,
        ...(initial.model ? { model: initial.model } : {}),
        ...(thinkingLevel === "auto"
          ? { thinkingLevel }
          : initial.thinkingLevel
            ? { thinkingLevel: initial.thinkingLevel }
            : {}),
        ...(initial.scopedModels.length > 0 ? { scopedModels: initial.scopedModels } : {}),
        ...(toolsOption !== undefined ? { toolNames: toolsOption, restrictToolNames: true } : {}),
        ...(untrusted ?? {}),
      };
      // omp's own applier, so a prompt file goes through the same templates the
      // CLI renders it with instead of overwriting the whole system prompt.
      applyResolvedSystemPromptInputs(sessionOptions, systemPrompts.systemPrompt, systemPrompts.appendPrompt);
      const { session: inner, eventBus, setToolUIContext } = await createAgentSession(sessionOptions);

      const persistedPreferences = await persistExplicitStartupPreferences(
        runtime.settings,
        {
          ...(initialModel ? { model: initialModel } : {}),
          ...(thinkingLevel ? { thinkingLevel } : {}),
        },
        {
          ...(inner.model
            ? { model: { provider: inner.model.provider, modelId: inner.model.id } }
            : {}),
          thinkingLevel: inner.configuredThinkingLevel() ?? inner.thinkingLevel ?? "off",
          supportsThinking: Boolean(inner.model?.reasoning),
        },
      );
      if (persistedPreferences.modelDefaultChanged) invalidateModelsCache();

      const session = inner as unknown as AgentSessionLike;

      // If specific tool names were requested (non-empty), set the active tools to the
      // requested builtin coding tools PLUS all extension/package tools, so installed
      // extensions stay usable in Reeve just like in the `omp` CLI.
      if (toolNames && toolNames.length > 0) {
        await session.setActiveToolsByName(withExtensionTools(session, toolNames));
      }

      const realSessionId = inner.sessionId as string;
      const wrapper = new AgentSessionWrapper(session, eventBus, [sessionId, realSessionId]);
      wrapper.bindToolUiContext(
        setToolUIContext as unknown as (uiContext: ExtensionUiContextLike, hasUI: boolean) => void,
      );
      // When all tools are disabled, clear the system prompt entirely.
      // omp's buildSystemPrompt always produces a non-empty prompt even with no
      // tools; keep this forced after extension discovery and reloads as well.
      if (toolNames?.length === 0) {
        wrapper.setForceEmptySystemPrompt(true);
      }
      wrapper.start();

      const realSessionFile = inner.sessionFile as string | undefined;
      if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

      wrapper.onDestroy(() => registry.delete(realSessionId));
      registry.set(realSessionId, wrapper);
      wrapper.beginExtensionBinding({ forceEmptySystemPrompt: toolNames?.length === 0 });

      return { session: wrapper, realSessionId };
    } finally {
      finishStartingSession();
    }
  })().finally(() => {
    locks.delete(sessionId);
  });

  locks.set(sessionId, starting);
  return starting;
}
