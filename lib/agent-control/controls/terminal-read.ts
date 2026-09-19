import { type } from "@oh-my-pi/omptype";
import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";

import type { AgentControlChannel } from "../channel";
import { type AgentControlReply, AGENT_CONTROL_PREFIX, type TerminalReadValue } from "../types";

/**
 * The first control: the agent reads the Terminal the human sees.
 *
 * The agent already runs its own commands, and those run in its own shell, not
 * in the Terminal tab beside the chat. Without this control the agent cannot
 * answer a question about the shell on screen, and it has to ask the human to
 * copy the text across.
 *
 * It returns the working directory, the shell and the attached state. It
 * returns no shell identifier, because no control accepts one. It sends no
 * input, so it declares the read tier and needs no approval.
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
  "Read the Terminal of this Reeve Session. Returns cwd, shell and attached=true when the window that shows this Session has a Terminal open. "
  + "Returns attached=false with reason=absent when this Session shows no Terminal, reason=no_window when no window shows it, "
  + "and reason=unavailable in a build without the Terminal surface. It returns no shell identifier and sends no input.";

const parameters = type({
  "session?": type("string").describe("This Session's id. Another Session's id returns reason=unavailable."),
});

interface TerminalReadDetails {
  attached: boolean;
  reason?: string;
}

/** Turn the reply into the text the model reads, and the details the UI keeps. */
function renderTerminalRead(reply: AgentControlReply<TerminalReadValue>): {
  text: string;
  details: TerminalReadDetails;
} {
  if (!reply.ok) {
    return {
      text: `attached=false reason=${reply.reason}`,
      details: { attached: false, reason: reply.reason },
    };
  }
  return {
    text: `attached=true cwd=${reply.value.cwd} shell=${reply.value.shell}`,
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
      const reply = await channel.call<TerminalReadValue>(TERMINAL_READ_CONTROL, {
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
