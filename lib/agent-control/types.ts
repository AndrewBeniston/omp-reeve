/**
 * The shared vocabulary of the agent control host.
 *
 * A control is a Reeve application capability that the agent calls as a tool:
 * reading the Terminal the human sees, and later opening a Tab or a Review. A
 * control is not an OMP capability. OMP owns Sessions, models and tools; Reeve
 * owns the window, and only Reeve can answer a question about it.
 */

/** Every control tool name starts with this, because OMP has no tool namespace. */
export const AGENT_CONTROL_PREFIX = "reeve_";

/** True when a tool name belongs to the control host. */
export function isAgentControlToolName(name: string): boolean {
  return name.startsWith(AGENT_CONTROL_PREFIX);
}

/**
 * Why a control produced no result.
 *
 * These three are the whole list, decided once so that a later control group
 * invents no fourth one. Each is a value the agent reads, never an error:
 * an error would make the model retry a call that cannot succeed.
 *
 * - `no_window`: no window shows this Session, so nothing could answer.
 * - `unavailable`: this build has no such surface, or the call named another
 *   Session.
 * - `absent`: the window shows this Session, and the surface is not open in it.
 */
export type AgentControlReason = "no_window" | "unavailable" | "absent";

const REASONS: Record<string, AgentControlReason> = {
  no_window: "no_window",
  unavailable: "unavailable",
  absent: "absent",
};

/**
 * The named reason, or `unavailable` when a window answered with something
 * else.
 *
 * The check reads an own key only. A window is a browser, so `constructor`
 * and every other inherited key arrives as an ordinary string here.
 */
export function readAgentControlReason(value: unknown): AgentControlReason {
  return typeof value === "string" && Object.hasOwn(REASONS, value)
    ? REASONS[value]
    : "unavailable";
}

/** A control result: a value, or one named reason. Never a thrown error. */
export type AgentControlReply<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; reason: AgentControlReason };

/**
 * What carries a control request to the window and brings the reply back.
 *
 * The Session wrapper is the only implementation. It already owns the pending
 * map and the replay for an extension UI request, so a control reuses both.
 * The interface keeps this module free of a dependency on the wrapper.
 */
export interface AgentControlRequestHost {
  requestAgentControl<T>(
    control: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<AgentControlReply<T>>;
}

/** The request the server puts on the Session event stream. */
export interface AgentControlRequestEvent {
  type: "agent_control_request";
  id: string;
  sessionId: string;
  control: string;
  params: Record<string, unknown>;
}

/**
 * What the Terminal read control returns. It carries no shell identifier,
 * because no control accepts one. A Session with no Terminal produces the
 * `absent` reason instead of a value.
 */
export interface TerminalReadValue {
  attached: true;
  cwd: string;
  shell: string;
}
