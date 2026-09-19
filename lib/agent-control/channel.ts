import { randomUUID } from "crypto";

import {
  type AgentControlReply,
  type AgentControlRequestEvent,
  readAgentControlReason,
} from "./types";

/**
 * The request and reply channel between one control host and the window that
 * shows its Session.
 *
 * There is one channel for each Session, and it uses the Session event stream
 * that already carries every other server-to-window request. The server emits
 * the request as an event, the window answers with an ordinary Session
 * command, and the pending call resolves. Reeve adds no second transport,
 * because a second one would need its own reconnect, its own authentication
 * and its own failure rules.
 *
 * Every expected failure resolves to a named reason. Nothing here throws at the
 * model.
 */

/** How long a control waits for the window. The value is a maintainer decision. */
export const AGENT_CONTROL_REPLY_TIMEOUT_MS = 5000;

type Emitter = (event: AgentControlRequestEvent) => void;

export interface AgentControlChannelOptions {
  /**
   * Whether this build has the desktop control surface at all. The browser
   * build registers no control, so a channel there answers `unavailable`
   * without emitting anything.
   */
  surfacePresent: boolean;
  /** The reply bound. Tests shorten it; nothing else sets it. */
  timeoutMs?: number;
}

export interface AgentControlCallParams {
  /** The Session the caller named. A foreign value is refused. */
  session?: string | undefined;
  [key: string]: unknown;
}

export class AgentControlChannel {
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, (reply: AgentControlReply) => void>();
  private emit: Emitter | null = null;
  private sessionId: string | null = null;
  private closed = false;

  constructor(private readonly options: AgentControlChannelOptions) {
    this.timeoutMs = options.timeoutMs ?? AGENT_CONTROL_REPLY_TIMEOUT_MS;
  }

  /**
   * Name the Session this host belongs to.
   *
   * The host is built before `createAgentSession` returns, so the real Session
   * id arrives afterwards. A control runs later still, so the binding is always
   * in place by the time one is called.
   */
  bindSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /** Send requests through the Session event stream of this Session. */
  attachEmitter(emit: Emitter): void {
    this.emit = emit;
  }

  /**
   * Why a control call must not run, or null while the host is open.
   *
   * The host ends with its Session. A tool call that arrives after that is
   * blocked before it runs, and the reason reaches the model. The later sandbox
   * gate adds its own rules here.
   */
  refusal(): string | null {
    if (this.closed) return "The Reeve control host for this Session is closed.";
    return null;
  }

  /** Call one control on the window that shows this Session. */
  async call<T>(control: string, params: AgentControlCallParams = {}): Promise<AgentControlReply<T>> {
    if (!this.options.surfacePresent || this.closed) return { ok: false, reason: "unavailable" };

    // A control acts on its own Session only. A named foreign Session changes
    // nothing: the request is never emitted, so no window ever sees it.
    const named = params.session;
    if (typeof named === "string" && named.length > 0 && named !== this.sessionId) {
      return { ok: false, reason: "unavailable" };
    }

    const emit = this.emit;
    const sessionId = this.sessionId;
    if (!emit || !sessionId) return { ok: false, reason: "no_window" };

    const id = randomUUID();
    const rest: Record<string, unknown> = { ...params };
    delete rest.session;
    return await new Promise<AgentControlReply<T>>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, reason: "no_window" });
      }, this.timeoutMs);

      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(reply as AgentControlReply<T>);
      });

      emit({ type: "agent_control_request", id, sessionId, control, params: rest });
    });
  }

  /** A window answered. An unknown id is a reply to a call that already ended. */
  resolve(response: Record<string, unknown>): void {
    const id = typeof response.id === "string" ? response.id : "";
    const settle = this.pending.get(id);
    if (!settle) return;
    settle(
      response.ok === true
        ? { ok: true, value: response.value }
        : { ok: false, reason: readAgentControlReason(response.reason) },
    );
  }

  /**
   * End the host with its Session.
   *
   * Every waiting call is answered rather than left hanging, because a tool
   * call that never returns holds the agent turn open.
   */
  close(): void {
    this.closed = true;
    this.emit = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const settle of waiting) settle({ ok: false, reason: "unavailable" });
  }
}

export function createAgentControlChannel(options: AgentControlChannelOptions): AgentControlChannel {
  return new AgentControlChannel(options);
}
