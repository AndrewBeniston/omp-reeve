import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";

import type { AgentControlChannel } from "./channel";
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
