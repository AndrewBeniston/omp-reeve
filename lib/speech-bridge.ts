import { resolveRoleChain } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { roleCandidatePool } from "@oh-my-pi/pi-coding-agent/config/model-roles";
import type { ModelRegistry, Settings } from "@oh-my-pi/pi-coding-agent";
import {
  downloadSttModel,
  isSttModelCached,
  resolveSttModelSpec,
  shutdownSttClient,
  STTController,
} from "@oh-my-pi/pi-coding-agent/stt";
import { getOmpRuntime, getSettingsForCwd } from "./omp-runtime";

export type SpeechState = "idle" | "starting" | "recording" | "finishing" | "transcribing" | "cancelled" | "failed";
export type SpeechErrorCode = "disabled" | "offline" | "permission-denied" | "model" | "capture" | "transcription";
export type SpeechEvent =
  | { type: "state"; state: SpeechState }
  | { type: "download"; percent: number; label: string }
  | { type: "partial"; text: string }
  | { type: "result"; text: string; submit: boolean }
  | { type: "error"; code: SpeechErrorCode; message: string }
  | { type: "closed" };

interface SpeechEditor {
  insertText(text: string): void;
  setVolatileText(text: string): void;
  clearVolatileText(): void;
  commitVolatileText(text: string): void;
  submit(): void;
  deleteBeforeCursor(count: number): void;
}

interface SpeechController {
  readonly state: "idle" | "recording" | "transcribing";
  toggle(): Promise<void>;
  dispose(): void;
}

interface SpeechContext {
  enabled: boolean;
  modelKey: string;
  local: boolean;
  settings?: Settings;
  registry?: ModelRegistry;
}

export interface SpeechServices {
  context(cwd: string): Promise<SpeechContext>;
  isCached(modelKey: string): Promise<boolean>;
  download(modelKey: string, onProgress: (progress: { percent: number; label: string }) => void, signal: AbortSignal): Promise<void>;
  createController(args: {
    sessionId: string;
    context: SpeechContext;
    editor: SpeechEditor;
    onStateChange(state: "idle" | "recording" | "transcribing"): void;
    onWarning(message: string): void;
  }): SpeechController;
  stopWorker(): Promise<void>;
}

const ompSpeechServices: SpeechServices = {
  async context(cwd) {
    const [{ modelRegistry }, settings] = await Promise.all([getOmpRuntime(), getSettingsForCwd(cwd)]);
    const model = resolveRoleChain("dictation", settings, roleCandidatePool("dictation", settings, modelRegistry))[0]?.model;
    return {
      enabled: settings.get("stt.enabled"),
      modelKey: resolveSttModelSpec(model?.id).key,
      local: !model || model.api === "local-inference",
      settings,
      registry: modelRegistry,
    };
  },
  isCached: isSttModelCached,
  download: (modelKey, onProgress, signal) => downloadSttModel(modelKey, onProgress, { signal }),
  createController({ sessionId, context, editor, onStateChange, onWarning }) {
    if (!context.settings || !context.registry) throw new Error("Speech settings are unavailable");
    const controller = new STTController({
      settings: context.settings,
      registry: context.registry,
      getSessionId: () => sessionId,
    });
    return {
      get state() { return controller.state; },
      toggle: () => controller.toggle(editor, {
        showWarning: onWarning,
        showStatus: () => {},
        onStateChange,
      }),
      dispose: () => controller.dispose(),
    };
  },
  stopWorker: shutdownSttClient,
};

export class SpeechBridge {
  private state: SpeechState = "idle";
  private controller: SpeechController | undefined;
  private listeners = new Set<(event: SpeechEvent) => void>();
  private text = "";
  private volatileText = "";
  private submitRequested = false;
  private closed = false;
  private failed = false;
  private generation = 0;
  private pendingAbort: AbortController | undefined;
  private workerStop: Promise<void> | undefined;

  constructor(
    readonly sessionId: string,
    readonly cwd: string,
    private readonly services: SpeechServices = ompSpeechServices,
  ) {}

  get snapshot(): SpeechState { return this.state; }
  get occupiesSpeechInput(): boolean {
    return this.closed || Boolean(this.workerStop)
      || ["starting", "recording", "finishing", "transcribing"].includes(this.state);
  }
  get unavailableForStart(): boolean { return this.closed || Boolean(this.workerStop); }

  subscribe(listener: (event: SpeechEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: "state", state: this.state });
    return () => this.listeners.delete(listener);
  }

  private emit(event: SpeechEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private setState(state: SpeechState): void {
    this.state = state;
    this.emit({ type: "state", state });
  }

  private fail(code: SpeechErrorCode, message: string): void {
    this.failed = true;
    this.setState("failed");
    this.emit({ type: "error", code, message });
  }

  private editor(generation: number): SpeechEditor {
    return {
      insertText: text => { if (generation === this.generation) { this.text += text; this.emit({ type: "partial", text: this.text }); } },
      setVolatileText: text => { if (generation === this.generation) { this.volatileText = text; this.emit({ type: "partial", text: this.text + text }); } },
      clearVolatileText: () => { if (generation === this.generation) { this.volatileText = ""; this.emit({ type: "partial", text: this.text }); } },
      commitVolatileText: text => { if (generation === this.generation) { this.volatileText = ""; this.text += text; this.emit({ type: "partial", text: this.text }); } },
      submit: () => { if (generation === this.generation) this.submitRequested = true; },
      deleteBeforeCursor: count => { if (generation === this.generation) this.text = this.text.slice(0, -count); },
    };
  }

  async start(): Promise<void> {
    if (this.unavailableForStart || this.controller || this.state === "starting") return;
    const generation = ++this.generation;
    this.text = "";
    this.volatileText = "";
    this.submitRequested = false;
    this.failed = false;
    this.setState("starting");
    let startingController: SpeechController | undefined;
    try {
      const context = await this.services.context(this.cwd);
      if (generation !== this.generation) return;
      if (!context.enabled) {
        this.fail("disabled", "Speech-to-text is disabled in OMP settings.");
        return;
      }
      if (context.local && !(await this.services.isCached(context.modelKey))) {
        if (generation !== this.generation) return;
        const abort = new AbortController();
        this.pendingAbort = abort;
        try {
          await this.services.download(context.modelKey, progress => {
            if (generation === this.generation) this.emit({ type: "download", ...progress });
          }, abort.signal);
        } finally {
          if (this.pendingAbort === abort) this.pendingAbort = undefined;
        }
      }
      if (generation !== this.generation) return;
      startingController = this.services.createController({
        sessionId: this.sessionId,
        context,
        editor: this.editor(generation),
        onStateChange: state => {
          if (generation === this.generation && !(this.failed && state === "idle")) this.setState(state);
        },
        onWarning: message => {
          if (generation !== this.generation) return;
          const code = /permission|denied|not authorized|not permitted/i.test(message)
            ? "permission-denied"
            : this.state === "transcribing" || this.state === "finishing" ? "transcription" : "capture";
          this.fail(code, message);
        },
      });
      this.controller = startingController;
      await startingController.toggle();
      if (generation !== this.generation) {
        startingController.dispose();
        return;
      }
      if (startingController.state !== "recording") {
        if (!this.failed) this.fail("capture", "Microphone capture did not start.");
        startingController.dispose();
        if (this.controller === startingController) this.controller = undefined;
      }
    } catch (error) {
      startingController?.dispose();
      if (this.controller === startingController) this.controller = undefined;
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : String(error);
      this.fail(/offline|network|fetch|ENOTFOUND|ENETUNREACH|ECONNREFUSED/i.test(message) ? "offline" : "model", message);
    }
  }

  async stop(): Promise<void> {
    if (this.state === "starting") return this.cancel();
    const controller = this.controller;
    if (this.closed || controller?.state !== "recording") return;
    const generation = this.generation;
    this.setState("finishing");
    try {
      await controller.toggle();
      if (generation === this.generation && !this.failed) this.emit({ type: "result", text: this.text, submit: this.submitRequested });
    } catch (error) {
      if (generation === this.generation) this.fail("transcription", error instanceof Error ? error.message : String(error));
    } finally {
      controller.dispose();
      if (this.controller === controller) this.controller = undefined;
    }
  }

  async cancel(): Promise<void> {
    if (this.closed) return;
    this.generation++;
    const abort = this.pendingAbort;
    this.pendingAbort = undefined;
    abort?.abort();
    const controller = this.controller;
    controller?.dispose();
    this.controller = undefined;
    this.setState("cancelled");
    if (abort || controller) {
      const workerStop = this.services.stopWorker();
      this.workerStop = workerStop;
      try {
        await workerStop;
      } finally {
        if (this.workerStop === workerStop) this.workerStop = undefined;
      }
    } else if (this.workerStop) {
      await this.workerStop;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.cancel();
    this.closed = true;
    this.emit({ type: "closed" });
    this.listeners.clear();
  }
}

export function createSpeechBridge(sessionId: string, cwd: string, services?: SpeechServices): SpeechBridge {
  return new SpeechBridge(sessionId, cwd, services);
}

declare global {
  var __reeveSpeechBridges: Map<string, SpeechBridge> | undefined;
  var __reeveSpeechShutdownRegistered: boolean | undefined;
}

function speechBridges(): Map<string, SpeechBridge> {
  globalThis.__reeveSpeechBridges ??= new Map();
  if (!globalThis.__reeveSpeechShutdownRegistered) {
    globalThis.__reeveSpeechShutdownRegistered = true;
    const shutdown = () => { void shutdownSpeechBridge(); };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("exit", shutdown);
  }
  return globalThis.__reeveSpeechBridges;
}

export function getSpeechBridge(sessionId: string): SpeechBridge | undefined {
  return speechBridges().get(sessionId);
}

export async function getSpeechAvailability(cwd: string): Promise<{ enabled: boolean; modelKey: string; local: boolean }> {
  const { enabled, modelKey, local } = await ompSpeechServices.context(cwd);
  return { enabled, modelKey, local };
}

export function activeSpeechSessionId(): string | undefined {
  for (const [id, bridge] of speechBridges()) {
    if (bridge.occupiesSpeechInput) return id;
  }
  return undefined;
}

export function getOrCreateSpeechBridge(sessionId: string, cwd: string, services?: SpeechServices): SpeechBridge {
  const bridges = speechBridges();
  const existing = bridges.get(sessionId);
  if (existing) {
    if (existing.cwd !== cwd) throw new Error("Speech session directory changed");
    return existing;
  }
  const bridge = createSpeechBridge(sessionId, cwd, services);
  bridges.set(sessionId, bridge);
  return bridge;
}

export async function closeSpeechSession(sessionId: string): Promise<void> {
  const bridges = speechBridges();
  const bridge = bridges.get(sessionId);
  if (!bridge) return;
  await bridge.close();
  if (bridges.size === 1) await ompSpeechServices.stopWorker();
  if (bridges.get(sessionId) === bridge) bridges.delete(sessionId);
}

export async function shutdownSpeechBridge(): Promise<void> {
  const bridges = speechBridges();
  const active = [...bridges.values()];
  bridges.clear();
  await Promise.all(active.map(bridge => bridge.close()));
  await ompSpeechServices.stopWorker();
}
