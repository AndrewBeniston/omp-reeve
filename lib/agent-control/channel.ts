import type { AgentControlReply, AgentControlRequestHost } from "./types";

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
 * The Session wrapper owns the pending request map, because it already owns
 * the same map for an extension UI request. A late listener therefore gets the
 * replay the wrapper already gives, and this channel holds no second copy.
 *
 * Every expected failure resolves to a named reason. Nothing here throws at the
 * model.
 */

/** How long a control waits for the window. The value is a maintainer decision. */
export const AGENT_CONTROL_REPLY_TIMEOUT_MS = 5000;

export interface AgentControlChannelOptions {
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
  private host: AgentControlRequestHost | null = null;
  private sessionId: string | null = null;
  private closed = false;

  constructor(options: AgentControlChannelOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? AGENT_CONTROL_REPLY_TIMEOUT_MS;
  }

  /**
   * Name the Session this host belongs to, and the wrapper that carries its
   * requests.
   *
   * The host is built before `createAgentSession` returns, so the real Session
   * id arrives afterwards. A control runs later still, so the binding is always
   * in place by the time one is called.
   */
  attachHost(host: AgentControlRequestHost, sessionId: string): void {
    this.host = host;
    this.sessionId = sessionId;
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
    if (this.closed) return { ok: false, reason: "unavailable" };

    // A control acts on its own Session only. A named foreign Session changes
    // nothing: the request is never emitted, so no window ever sees it.
    const named = params.session;
    if (typeof named === "string" && named.length > 0 && named !== this.sessionId) {
      return { ok: false, reason: "unavailable" };
    }

    const host = this.host;
    if (!host) return { ok: false, reason: "no_window" };

    const rest: Record<string, unknown> = { ...params };
    delete rest.session;
    return await host.requestAgentControl<T>(control, rest, this.timeoutMs);
  }

  /**
   * End the host with its Session.
   *
   * The wrapper answers every waiting call when it ends, because a tool call
   * that never returns holds the agent turn open. This channel only stops
   * taking new calls.
   */
  close(): void {
    this.closed = true;
    this.host = null;
  }
}

export function createAgentControlChannel(options: AgentControlChannelOptions = {}): AgentControlChannel {
  return new AgentControlChannel(options);
}
