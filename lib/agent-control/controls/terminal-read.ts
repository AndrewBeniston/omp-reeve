import { type } from "@oh-my-pi/omptype";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";

import type { AgentControlChannel } from "../channel";
import {
  type AgentControlReason,
  type AgentControlReply,
  AGENT_CONTROL_PREFIX,
  type TerminalReadValue,
} from "../types";

/**
 * The first control: the agent reads the Terminal the human sees.
 *
 * The agent already runs its own commands, and those run in its own shell, not
 * in the Terminal tab beside the chat. Without this control the agent cannot
 * answer a question about the shell on screen, and it has to ask the human to
 * copy the text across.
 *
 * It returns the start directory, the shell and the attached state. The start
 * directory is the directory the shell started in, because that is the only
 * directory the window records. It returns no shell identifier, because no
 * control accepts one. It sends no input, so it declares the read tier and
 * needs no approval.
 *
 * The retained output buffer is a separate ticket. This control reads what the
 * window already knows about its own Terminal.
 */

export const TERMINAL_READ_CONTROL = "terminal_read";
export const TERMINAL_READ_TOOL_NAME = `${AGENT_CONTROL_PREFIX}read_terminal`;

/**
 * The instruction text for this control, which counts against the control
 * instruction budget. It names every value the control can return, so the
 * model never guesses one.
 */
export const TERMINAL_READ_DESCRIPTION =
  "Read the Terminal of this Reeve Session. Returns startDir, shell and attached=true when the window that shows it has a Terminal open. "
  + "startDir is where the shell started. Returns attached=false with reason=absent when no Terminal is open, "
  + "reason=no_window when no window shows this Session, and reason=unavailable in a build without the Terminal surface. "
  + "It sends no input and names no shell.";

const parameters = type({
  "session?": type("string").describe("This Session's id. Another Session's id returns reason=unavailable."),
});

interface TerminalReadDetails {
  attached: boolean;
  reason?: AgentControlReason;
}

/**
 * The reply value, or null when the window sent a shape this control cannot
 * read.
 *
 * The value crosses the browser boundary, so nothing here trusts it. A bad
 * shape becomes a named reason, because a thrown error would invite the model
 * to retry a call that cannot succeed.
 */
function readTerminalValue(value: unknown): TerminalReadValue | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const startDir = record.startDir;
  const shell = record.shell;
  if (typeof startDir !== "string" || typeof shell !== "string") return null;
  return { attached: true, startDir, shell };
}

/** Turn the reply into the text the model reads, and the details the UI keeps. */
function renderTerminalRead(reply: AgentControlReply): {
  text: string;
  details: TerminalReadDetails;
} {
  if (!reply.ok) {
    return {
      text: `attached=false reason=${reply.reason}`,
      details: { attached: false, reason: reply.reason },
    };
  }
  const value = readTerminalValue(reply.value);
  if (!value) {
    return {
      text: "attached=false reason=unavailable",
      details: { attached: false, reason: "unavailable" },
    };
  }
  return {
    text: `attached=true startDir=${value.startDir} shell=${value.shell}`,
    details: { attached: true },
  };
}

export function createTerminalReadControl(
  channel: AgentControlChannel,
): ToolDefinition<typeof parameters, TerminalReadDetails> {
  return {
    name: TERMINAL_READ_TOOL_NAME,
    label: "Read Terminal",
    description: TERMINAL_READ_DESCRIPTION,
    parameters,
    // Eager, so the control is in the Session tool schema from the first turn.
    loadMode: "essential",
    // A read of the window. It changes nothing, so no approval interrupts it.
    approval: "read",
    async execute(_toolCallId, params) {
      const reply = await channel.call(TERMINAL_READ_CONTROL, {
        session: params.session,
      });
      const rendered = renderTerminalRead(reply);
      return {
        content: [{ type: "text", text: rendered.text }],
        details: rendered.details,
      };
    },
  };
}
