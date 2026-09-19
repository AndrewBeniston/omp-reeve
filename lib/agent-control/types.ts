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

/** The named reason, or `unavailable` when a window answered with something else. */
export function readAgentControlReason(value: unknown): AgentControlReason {
  return typeof value === "string" && value in REASONS ? REASONS[value] : "unavailable";
}

/** A control result: a value, or one named reason. Never a thrown error. */
export type AgentControlReply<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; reason: AgentControlReason };

/** The request the server puts on the Session event stream. */
export interface AgentControlRequestEvent {
  type: "agent_control_request";
  id: string;
  sessionId: string;
  control: string;
  params: Record<string, unknown>;
}

/** The reply the window posts back as a Session command. */
export interface AgentControlResponseCommand {
  type: "agent_control_response";
  id: string;
  ok: boolean;
  value?: unknown;
  reason?: string;
}

/** What the Terminal read control returns. It carries no shell identifier. */
export type TerminalReadValue =
  | { attached: true; cwd: string; shell: string }
  | { attached: false };
