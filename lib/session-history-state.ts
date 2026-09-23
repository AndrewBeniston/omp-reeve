import type { SessionEntry } from "./types";
import type { SessionHistoryFailure, SessionHistoryResult } from "./session-history";

export interface SessionHistoryState {
  sessionId: string;
  entries: SessionEntry[];
  cursor: string | null;
  exhausted: boolean;
  failure: SessionHistoryFailure["error"] | null;
}

export function createSessionHistoryState(sessionId: string): SessionHistoryState {
  return { sessionId, entries: [], cursor: null, exhausted: false, failure: null };
}

export function sessionHistoryRequest(state: SessionHistoryState): { sessionId: string; cursor: string | null } | null {
  return state.exhausted ? null : { sessionId: state.sessionId, cursor: state.cursor };
}

export function applySessionHistoryResult(
  state: SessionHistoryState,
  result: SessionHistoryResult,
): SessionHistoryState {
  if (state.sessionId !== result.sessionId || state.exhausted) return state;
  if (!result.ok) {
    return result.cursor === state.cursor ? { ...state, failure: result.error } : state;
  }
  if (result.requestedCursor !== state.cursor) return state;

  const existingIds = new Set(state.entries.map((entry) => entry.id));
  return {
    ...state,
    entries: [...result.entries.filter((entry) => !existingIds.has(entry.id)), ...state.entries],
    cursor: result.nextCursor,
    exhausted: result.exhausted,
    failure: null,
  };
}
