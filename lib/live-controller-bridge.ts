import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { LiveSessionController, type LiveTranscript } from "@oh-my-pi/pi-coding-agent/live/controller";
import type { LivePhase } from "@oh-my-pi/pi-tui/apps/live-visualizer";
import type { AgentSessionLike } from "./omp-types";

export interface LiveControllerSnapshot {
  active: boolean;
  phase: LivePhase | "idle" | "cancelled";
  microphoneLevel: number;
  outputLevel: number;
  transcript?: LiveTranscript;
  muted: boolean;
  delegationActive: boolean;
  error?: { message: string };
}

export type LiveControllerEvent = { type: "state"; state: LiveControllerSnapshot } | { type: "closed" };

export interface LiveControllerLike {
  readonly phase: LivePhase;
  readonly muted: boolean;
  start(): Promise<void>;
  toggleMute(): void;
  stop(): Promise<void>;
}

export interface LiveControllerServices {
  createController(session: AgentSessionLike, callbacks: {
    onPhase(phase: LivePhase): void;
    onLevels(input: number, output: number): void;
    onTranscript(transcript: LiveTranscript | undefined): void;
    onTerminal(error?: Error): void;
  }): LiveControllerLike;
}

const ompLiveControllerServices: LiveControllerServices = {
  createController(session, callbacks) {
    return new LiveSessionController({
      session: session as never,
      callbacks,
      extractAssistantText: message => assistantText(message),
    });
  },
};

function assistantText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n")
    .trim();
}

export class LiveControllerBridge {
  private controller: LiveControllerLike | undefined;
  private listeners = new Set<(event: LiveControllerEvent) => void>();
  private generation = 0;
  private closed = false;
  private phase: LivePhase | "idle" | "cancelled" = "idle";
  private microphoneLevel = 0;
  private outputLevel = 0;
  private transcript: LiveTranscript | undefined;
  private muted = false;
  private delegationActive = false;
  private error: Error | undefined;

  constructor(
    readonly sessionId: string,
    readonly session: AgentSessionLike,
    private readonly services: LiveControllerServices = ompLiveControllerServices,
  ) {}

  get snapshot(): LiveControllerSnapshot {
    return {
      active: Boolean(this.controller && !this.closed),
      phase: this.closed && this.phase !== "cancelled" ? "idle" : this.phase,
      microphoneLevel: this.microphoneLevel,
      outputLevel: this.outputLevel,
      transcript: this.transcript,
      muted: this.muted,
      delegationActive: this.delegationActive,
      error: this.error ? { message: this.error.message } : undefined,
    };
  }

  subscribe(listener: (event: LiveControllerEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: "state", state: this.snapshot });
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.closed || this.controller) return;
    const generation = ++this.generation;
    this.error = undefined;
    this.microphoneLevel = 0;
    this.outputLevel = 0;
    this.transcript = undefined;
    this.muted = false;
    this.delegationActive = false;
    this.phase = "connecting";
    this.publish();

    const controller = this.services.createController(this.session, {
      onPhase: phase => {
        if (generation !== this.generation) return;
        this.phase = phase;
        this.muted = phase === "muted" || controller.muted;
        this.delegationActive = phase === "working";
        this.publish();
      },
      onLevels: (microphoneLevel, outputLevel) => {
        if (generation !== this.generation) return;
        this.microphoneLevel = microphoneLevel;
        this.outputLevel = outputLevel;
        this.publish();
      },
      onTranscript: transcript => {
        if (generation !== this.generation) return;
        this.transcript = transcript;
        this.publish();
      },
      onTerminal: error => {
        if (generation !== this.generation) return;
        if (error) this.error = error;
        this.controller = undefined;
        this.microphoneLevel = 0;
        this.outputLevel = 0;
        this.delegationActive = false;
        this.publish();
      },
    });
    this.controller = controller;
    try {
      await controller.start();
      if (generation !== this.generation) return;
      this.phase = controller.phase;
      this.muted = controller.muted;
      this.delegationActive = this.phase === "working";
      this.publish();
    } catch (cause) {
      if (generation === this.generation) {
        this.error = cause instanceof Error ? cause : new Error(String(cause));
        this.phase = "error";
        this.controller = undefined;
        this.microphoneLevel = 0;
        this.outputLevel = 0;
        this.delegationActive = false;
        this.publish();
      }
      await controller.stop();
    }
  }

  toggleMute(): void {
    const controller = this.controller;
    if (!controller || this.closed) return;
    controller.toggleMute();
    this.muted = controller.muted;
    this.delegationActive = false;
    this.publish();
  }

  async stop(): Promise<void> {
    const controller = this.controller;
    if (!controller) return;
    try {
      await controller.stop();
    } finally {
      if (this.controller === controller) this.controller = undefined;
      this.microphoneLevel = 0;
      this.outputLevel = 0;
      this.delegationActive = false;
      this.publish();
    }
  }

  async cancel(): Promise<void> {
    if (this.closed) return;
    this.generation += 1;
    const controller = this.controller;
    this.controller = undefined;
    this.phase = "cancelled";
    this.microphoneLevel = 0;
    this.outputLevel = 0;
    this.delegationActive = false;
    this.transcript = undefined;
    this.publish();
    await controller?.stop();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.cancel();
    this.closed = true;
    this.phase = "idle";
    this.muted = false;
    this.publish();
    this.emit({ type: "closed" });
    this.listeners.clear();
  }

  private publish(): void {
    this.emit({ type: "state", state: this.snapshot });
  }

  private emit(event: LiveControllerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

declare global {
  var __reeveLiveControllerBridges: Map<string, LiveControllerBridge> | undefined;
  var __reeveLiveControllerShutdownRegistered: boolean | undefined;
}

function liveControllerBridges(): Map<string, LiveControllerBridge> {
  globalThis.__reeveLiveControllerBridges ??= new Map();
  if (!globalThis.__reeveLiveControllerShutdownRegistered) {
    globalThis.__reeveLiveControllerShutdownRegistered = true;
    const shutdown = () => { void shutdownLiveControllerBridges(); };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("exit", shutdown);
  }
  return globalThis.__reeveLiveControllerBridges;
}

export function createLiveControllerBridge(
  sessionId: string,
  session: AgentSessionLike,
  services?: LiveControllerServices,
): LiveControllerBridge {
  return new LiveControllerBridge(sessionId, session, services);
}

export function getLiveControllerBridge(sessionId: string): LiveControllerBridge | undefined {
  return liveControllerBridges().get(sessionId);
}

export function getOrCreateLiveControllerBridge(
  sessionId: string,
  session: AgentSessionLike,
  services?: LiveControllerServices,
): LiveControllerBridge {
  const bridges = liveControllerBridges();
  const existing = bridges.get(sessionId);
  if (existing) return existing;
  const bridge = createLiveControllerBridge(sessionId, session, services);
  bridges.set(sessionId, bridge);
  return bridge;
}

export async function closeLiveControllerSession(sessionId: string): Promise<void> {
  const bridges = liveControllerBridges();
  const bridge = bridges.get(sessionId);
  if (!bridge) return;
  if (bridges.get(sessionId) === bridge) bridges.delete(sessionId);
  await bridge.close();
}

export async function shutdownLiveControllerBridges(): Promise<void> {
  const bridges = liveControllerBridges();
  const active = [...bridges.values()];
  bridges.clear();
  await Promise.all(active.map(bridge => bridge.close()));
}
