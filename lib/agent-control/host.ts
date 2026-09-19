import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";

import { type AgentControlChannel, createAgentControlChannel } from "./channel";
import { desktopControlSurfacePresent } from "./build-surface";
import { createTerminalReadControl } from "./controls/terminal-read";
import { isAgentControlToolName } from "./types";

/**
 * The control host: one for each Session, built as one in-process extension
 * factory that Reeve passes when it creates the Session.
 *
 * OMP binds this factory the same way it binds a discovered extension, so a
 * control is an ordinary Session tool. That matters twice. The tool registry is
 * already Session scoped, so a control cannot reach another Session. And the
 * factory can block a call before it runs, with a reason the model reads, which
 * is where the sandbox gate will live.
 *
 * Every later control group registers here. A second registry would give the
 * groups separate routes and separate failure rules.
 */
export function createAgentControlHost(channel: AgentControlChannel): ExtensionFactory {
  return (api: ExtensionAPI) => {
    api.registerTool(createTerminalReadControl(channel));

    // The block path. A control call that must not run is refused before it
    // runs, and the refusal reaches the model as the reason.
    api.on("tool_call", (event) => {
      if (!isAgentControlToolName(event.toolName)) return undefined;
      const refusal = channel.refusal();
      return refusal ? { block: true, reason: refusal } : undefined;
    });
  };
}

/** One Session's control host: its route to the window, and its registration. */
export interface SessionControlHost {
  /** The route from this Session to the window that shows it. */
  channel: AgentControlChannel;
  /** The factories Reeve passes to `createAgentSession`. */
  extensions: ExtensionFactory[];
}

/**
 * Build the control host for one Session, or nothing in the browser build.
 *
 * This is the one decision that answers "does this build register a control".
 * It lives here, beside the registration itself, so a caller cannot register a
 * control and forget the gate.
 */
export function startSessionControlHost(
  env: NodeJS.ProcessEnv = process.env,
): SessionControlHost | null {
  if (!desktopControlSurfacePresent(env)) return null;
  const channel = createAgentControlChannel({ surfacePresent: true });
  return { channel, extensions: [createAgentControlHost(channel)] };
}
