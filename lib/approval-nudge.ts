import type { ApprovalMode } from "./approval-mode";

/**
 * The offer to stop approving every command by hand (R19), over the middle
 * approval mode Reeve already ships. It counts, offers, and records a
 * decision; it sends no model turn and writes no setting.
 */

/** How many manual approvals it takes. The reference ships three. */
export const APPROVAL_NUDGE_THRESHOLD = 3;

/** The mode accepting the offer writes. */
export const APPROVAL_NUDGE_MODE: ApprovalMode = "write";

export interface ApprovalNudgeState {
  /** Manual approvals counted per Session. */
  counts: Readonly<Record<string, number>>;
  /** Declined for good, everywhere: one refusal is the whole answer. */
  dismissed: boolean;
}

export const EMPTY_APPROVAL_NUDGE_STATE: Readonly<ApprovalNudgeState> = { counts: {}, dismissed: false };

/** One complete state, whatever was stored, including nothing at all. */
export function approvalNudgeState(stored?: unknown): Readonly<ApprovalNudgeState> {
  if (!stored || typeof stored !== "object") return EMPTY_APPROVAL_NUDGE_STATE;
  const source = stored as Partial<ApprovalNudgeState>;
  const counts: Record<string, number> = {};
  if (source.counts && typeof source.counts === "object") {
    for (const [sessionId, count] of Object.entries(source.counts)) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) counts[sessionId] = Math.floor(count);
    }
  }
  return { counts, dismissed: source.dismissed === true };
}

/** One more approval the human granted by hand. */
export function recordManualApproval(state: Readonly<ApprovalNudgeState>, sessionId: string): Readonly<ApprovalNudgeState> {
  if (state.dismissed || !sessionId) return state;
  return { ...state, counts: { ...state.counts, [sessionId]: (state.counts[sessionId] ?? 0) + 1 } };
}

export interface ApprovalNudgeContext {
  sessionId: string | null;
  /** The mode in force. The offer only makes sense from the asking mode. */
  approvalMode: ApprovalMode | null;
  /** The offer sits beside a pending request, not on its own. */
  hasPendingApproval: boolean;
}

/**
 * Narrow on purpose: a declined offer never returns, another mode has nothing
 * to be offered, and an offer with nothing pending is an interruption.
 */
export function approvalNudgeVisible(state: Readonly<ApprovalNudgeState>, context: ApprovalNudgeContext): boolean {
  if (state.dismissed) return false;
  if (!context.sessionId || !context.hasPendingApproval) return false;
  if (context.approvalMode !== "always-ask") return false;
  return (state.counts[context.sessionId] ?? 0) >= APPROVAL_NUDGE_THRESHOLD;
}

/** Accepted. The caller writes the setting; this clears the count. */
export function acceptApprovalNudge(
  state: Readonly<ApprovalNudgeState>,
  sessionId: string,
): { state: Readonly<ApprovalNudgeState>; mode: ApprovalMode } {
  return { state: clearApprovalNudge(state, sessionId), mode: APPROVAL_NUDGE_MODE };
}

/** The human declined. Permanent, and everywhere. */
export function dismissApprovalNudge(): Readonly<ApprovalNudgeState> {
  return { counts: {}, dismissed: true };
}

/** The offer is off screen for this Session, and its count starts again. */
export function clearApprovalNudge(state: Readonly<ApprovalNudgeState>, sessionId: string): Readonly<ApprovalNudgeState> {
  if (!(sessionId in state.counts)) return state;
  const counts = { ...state.counts };
  delete counts[sessionId];
  return { ...state, counts };
}

export const APPROVAL_NUDGE_STORAGE_KEY = "reeve-approval-nudge";


type NudgeStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): NudgeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** A decline that did not survive a restart would be an offer that returns. */
export function readApprovalNudgeState(store: NudgeStorage | null = browserStorage()): Readonly<ApprovalNudgeState> {
  if (!store) return EMPTY_APPROVAL_NUDGE_STATE;
  try {
    const raw = store.getItem(APPROVAL_NUDGE_STORAGE_KEY);
    return approvalNudgeState(raw ? JSON.parse(raw) as unknown : null);
  } catch {
    return EMPTY_APPROVAL_NUDGE_STATE;
  }
}

export function writeApprovalNudgeState(
  state: Readonly<ApprovalNudgeState>,
  store: NudgeStorage | null = browserStorage(),
): Readonly<ApprovalNudgeState> {
  try {
    store?.setItem(APPROVAL_NUDGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage denied must not turn a decline into an error the human sees.
  }
  return state;
}
