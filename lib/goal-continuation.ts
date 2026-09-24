export interface GoalContinuationBrowserState {
  hasText: boolean;
  hasAttachments: boolean;
}

export function isGoalContinuationBrowserReady(
  state: GoalContinuationBrowserState,
  surfaceActive: boolean,
): boolean {
  return surfaceActive && !state.hasText && !state.hasAttachments;
}

export interface GoalContinuationSession {
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly hasPostPromptWork: boolean;
  readonly isBashRunning?: boolean;
  readonly queuedMessageCount?: number;
  readonly settings: { get(key: "goal.continuationModes"): unknown };
  readonly goalRuntime: { buildContinuationPrompt(): string | undefined };
  getGoalModeState(): { enabled: boolean; goal?: { status: string } } | undefined;
  getPlanModeState?(): { enabled: boolean } | undefined;
  promptCustomMessage(message: {
    customType: string;
    content: string;
    display: boolean;
  }): Promise<boolean>;
}

export interface GoalContinuationOptions {
  delayMs?: number;
  isPromptRunning?: () => boolean;
  onPromptError?: (error: unknown) => void;
}

export interface GoalContinuationEvent {
  type: string;
  messages?: readonly unknown[];
  message?: { role?: string; synthetic?: boolean };
  state?: { enabled: boolean; goal?: { status: string } };
}

function canonicalize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item, seen)]),
  );
}

function digest(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16)}`;
}

/** Model-visible work from one settled Turn. Stable across message timestamps. */
export function goalContinuationActivity(messages: readonly unknown[]): string {
  const records: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const entry = message as { role?: unknown; content?: unknown; toolName?: unknown; isError?: unknown };
    if (entry.role === "assistant" && Array.isArray(entry.content)) {
      for (const block of entry.content) {
        if (!block || typeof block !== "object") continue;
        const toolCall = block as { type?: unknown; name?: unknown; arguments?: unknown };
        if (toolCall.type === "toolCall") {
          records.push(digest(["call", toolCall.name, toolCall.arguments]));
        }
      }
    } else if (entry.role === "toolResult") {
      records.push(digest(["result", entry.toolName, entry.content, entry.isError === true]));
    }
  }
  return records.join(":");
}

/** Coordinates one hidden Goal continuation for one OMP Session. */
export class GoalContinuationCoordinator {
  private readonly delayMs: number;
  private readonly isPromptRunning: () => boolean;
  private readonly onPromptError: (error: unknown) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private browserReady = false;
  private submittedContinuation = false;
  private suppressNext = false;
  private previousActivity: string | undefined;
  private disposed = false;

  constructor(
    private readonly session: GoalContinuationSession,
    options: GoalContinuationOptions = {},
  ) {
    this.delayMs = options.delayMs ?? 800;
    this.isPromptRunning = options.isPromptRunning ?? (() => false);
    this.onPromptError = options.onPromptError ?? (() => {});
  }

  get pending(): boolean {
    return this.timer !== null || this.submittedContinuation;
  }

  setBrowserReady(ready: boolean): void {
    if (this.disposed) return;
    this.browserReady = ready;
    if (ready) this.schedule();
    else this.cancel();
  }

  observe(event: GoalContinuationEvent): void {
    if (this.disposed) return;
    if (event.type === "agent_start") {
      this.clearTimer();
      return;
    }
    if (event.type === "message_start") {
      const message = event.message;
      if (message?.role === "user" && message.synthetic !== true) this.resetSuppression();
      return;
    }
    if (event.type === "goal_updated") {
      if (!this.hasActiveGoal()) {
        this.cancel();
        this.resetSuppression();
      } else {
        this.schedule();
      }
      return;
    }
    if (event.type === "agent_end") {
      if (this.submittedContinuation) {
        this.submittedContinuation = false;
        const activity = goalContinuationActivity(event.messages ?? []);
        this.suppressNext = activity.length === 0 || activity === this.previousActivity;
        this.previousActivity = activity;
      } else {
        this.resetSuppression();
      }
      this.schedule();
      return;
    }
    if (event.type === "agent_settled") this.schedule();
  }

  schedule(): void {
    if (this.disposed || this.pending || !this.canRemainPending()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire();
    }, this.delayMs);
  }

  cancel(): void {
    this.clearTimer();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.resetSuppression();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private hasActiveGoal(): boolean {
    const state = this.session.getGoalModeState();
    return state?.enabled === true && state.goal?.status === "active";
  }

  private isBusy(): boolean {
    return this.isPromptRunning()
      || this.session.isStreaming
      || this.session.isCompacting
      || this.session.hasPostPromptWork
      || this.session.isBashRunning === true
      || (this.session.queuedMessageCount ?? 0) > 0;
  }

  private canRemainPending(): boolean {
    if (!this.browserReady || !this.hasActiveGoal() || this.suppressNext) return false;
    if (this.session.getPlanModeState?.()?.enabled) return false;
    const modes = this.session.settings.get("goal.continuationModes");
    return Array.isArray(modes) && modes.includes("interactive");
  }

  private resetSuppression(): void {
    this.suppressNext = false;
    this.previousActivity = undefined;
  }

  private fire(): void {
    if (this.disposed || !this.canRemainPending()) return;
    if (this.isBusy()) {
      this.schedule();
      return;
    }
    const prompt = this.session.goalRuntime.buildContinuationPrompt();
    if (!prompt) return;
    this.submittedContinuation = true;
    void this.session.promptCustomMessage({
      customType: "goal-continuation",
      content: prompt,
      display: false,
    }).then((accepted) => {
      if (!accepted && this.submittedContinuation) this.submittedContinuation = false;
    }).catch((error) => {
      if (this.submittedContinuation) this.submittedContinuation = false;
      this.onPromptError(error);
    });
  }
}
