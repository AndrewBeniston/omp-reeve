import type { AgentControlReply, TerminalReadValue } from "./types";

/**
 * The window's half of the Terminal read.
 *
 * The window knows which Terminal tabs are open, which one the human looks at,
 * and which shell each one runs. The server knows none of that, which is why
 * the control is a request to the window rather than a read on the server.
 *
 * Kept pure so the choice can be tested without a shell and without a browser.
 */

export interface TerminalTabState {
  tabId: string;
  /** The directory the shell started in. It does not follow a later `cd`. */
  startDir: string;
  /** The shell the desktop process started. Null until it reports one. */
  shell: string | null;
  /** False once the shell exits, or when it never started. */
  live: boolean;
  /** When the Terminal opened, used to pick the most recent one. */
  openedAt: number;
}

/**
 * The Terminal a control reads.
 *
 * A Session with more than one Terminal returns the active one, because that is
 * the shell the human is looking at. With none active, the most recent one is
 * the best answer available.
 */
export function selectSessionTerminal(
  states: readonly TerminalTabState[],
  activeTabId: string | null,
): TerminalTabState | null {
  const live = states.filter((state) => state.live && state.shell !== null);
  if (live.length === 0) return null;
  const active = live.find((state) => state.tabId === activeTabId);
  if (active) return active;
  return live.reduce((newest, state) => (state.openedAt > newest.openedAt ? state : newest));
}

/** The reply the window sends back for the Terminal read control. */
export function terminalReadReply(
  states: readonly TerminalTabState[],
  activeTabId: string | null,
): AgentControlReply<TerminalReadValue> {
  const terminal = selectSessionTerminal(states, activeTabId);
  if (!terminal || terminal.shell === null) return { ok: false, reason: "absent" };
  return { ok: true, value: { attached: true, startDir: terminal.startDir, shell: terminal.shell } };
}
