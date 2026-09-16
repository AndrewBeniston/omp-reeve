import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Reeve's bridge to OMP's own approval events.
 *
 * A tool approval is not a dialog Reeve can recognise by shape: an extension
 * may ask the same Approve-or-Deny question for its own reasons, and counting
 * that towards an offer to approve automatically would widen permissions on
 * the strength of an unrelated question. OMP knows the difference and says so
 * through `tool_approval_requested` and `tool_approval_resolved`.
 *
 * It emits them only when something has registered a handler, and handlers
 * live in extensions, so Reeve loads one extension of its own. It is written
 * into Reeve's agent directory and passed as an additional extension path,
 * which the SDK merges with discovery — no project file, no global setting,
 * and no change to what a trusted or untrusted project loads.
 */

export interface ApprovalBridgeEvent {
  phase: "requested" | "resolved";
  sessionId: string;
  toolName?: string;
  toolCallId?: string;
  approved?: boolean;
}

type ApprovalBridgeListener = (event: ApprovalBridgeEvent) => void;

/** The two answers OMP offers for a tool approval, in its own order. */
const APPROVAL_SELECT_OPTIONS = ["Approve", "Deny"] as const;

/**
 * The tool call an Approve-or-Deny question probably belongs to.
 *
 * This is a conservative heuristic, not an exact identity. OMP passes no tool
 * call id into `select`, so the question and the approval stay two separate
 * facts, and nothing here proves they are one. The heuristic pairs them only
 * when a single approval is waiting and the options are OMP's own pair. It
 * still cannot tell that pair from an extension asking the same two words
 * while an approval happens to be waiting. Every other case returns null, so
 * the caller offers nothing rather than guess.
 */
export function approvalSelectToolCallId(
  pending: readonly string[],
  options: readonly string[],
): string | null {
  if (pending.length !== 1) return null;
  if (options.length !== APPROVAL_SELECT_OPTIONS.length) return null;
  if (options.some((option, index) => option !== APPROVAL_SELECT_OPTIONS[index])) return null;
  return pending[0];
}

declare global {
  var __reeveApprovalBridge: Map<string, ApprovalBridgeListener> | undefined;
}

/** One registry per process, on `globalThis` so hot-reload cannot split it. */
export function approvalBridgeListeners(): Map<string, ApprovalBridgeListener> {
  if (!globalThis.__reeveApprovalBridge) globalThis.__reeveApprovalBridge = new Map();
  return globalThis.__reeveApprovalBridge;
}

/** Listen for one Session's approvals. Returns the way to stop listening. */
export function registerApprovalBridge(sessionId: string, listener: ApprovalBridgeListener): () => void {
  const listeners = approvalBridgeListeners();
  listeners.set(sessionId, listener);
  return () => {
    if (listeners.get(sessionId) === listener) listeners.delete(sessionId);
  };
}

/**
 * The extension itself, as source.
 *
 * Kept as text rather than a file in the package because it is loaded from
 * disk by OMP at runtime, and the published build ships `.next` and `bin`
 * only. Writing it into the agent directory means one path that exists in
 * development, in the desktop application, and for a global install alike.
 */
export const APPROVAL_BRIDGE_SOURCE = `// Written by Reeve. Forwards OMP's tool approval events to the browser.
// Safe to delete: Reeve rewrites it when a session starts.
export default function reeveApprovalBridge(pi) {
  const forward = (phase) => (event) => {
    const listener = globalThis.__reeveApprovalBridge?.get(event?.sessionId);
    if (!listener) return;
    listener({
      phase,
      sessionId: event.sessionId,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      ...(phase === "resolved" ? { approved: event.approved === true } : {}),
    });
  };
  pi.on("tool_approval_requested", forward("requested"));
  pi.on("tool_approval_resolved", forward("resolved"));
}
`;

export const APPROVAL_BRIDGE_FILENAME = "reeve-approval-bridge.js";

/**
 * The bridge on disk, rewritten only when its text differs, so a session
 * start does not touch the file every time.
 */
export async function ensureApprovalBridgeExtension(agentDir: string): Promise<string> {
  const directory = path.join(agentDir, "reeve");
  const file = path.join(directory, APPROVAL_BRIDGE_FILENAME);
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing === APPROVAL_BRIDGE_SOURCE) return file;
  await mkdir(directory, { recursive: true });
  await writeFile(file, APPROVAL_BRIDGE_SOURCE, "utf8");
  return file;
}
