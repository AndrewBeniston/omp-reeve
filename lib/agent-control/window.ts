import { terminalReadReply, type TerminalTabState } from "./terminal-snapshot";
import { TERMINAL_READ_CONTROL } from "./controls/terminal-read";
import type { AgentControlReply, AgentControlRequestEvent } from "./types";

/**
 * The window's answer to one control request.
 *
 * The server holds the control host, and the window holds the surfaces the
 * host asks about. This function is the whole of the window's side: it takes
 * what the window knows and returns the reply, so the answer can be tested
 * without a browser and without a shell.
 *
 * A window with no Terminal surface stays silent, and this returns null. More
 * than one window can show the same Session, and the first answer wins. A
 * plain browser tab owns no shell, so an answer from it would hide the real
 * Terminal of a desktop window beside it.
 *
 * A control name this window does not serve answers `unavailable`. A window
 * that stayed silent instead would cost the host its full wait and then report
 * `no_window`, which is a different and untrue statement.
 */
export function answerAgentControlRequest(
  request: AgentControlRequestEvent,
  terminals: readonly TerminalTabState[],
  activeTerminalTabId: string | null,
  terminalSurfacePresent: boolean,
): AgentControlReply | null {
  if (request.control === TERMINAL_READ_CONTROL) {
    if (!terminalSurfacePresent) return null;
    return terminalReadReply(terminals, activeTerminalTabId);
  }
  return { ok: false, reason: "unavailable" };
}
