import type { SessionEntry } from "./types";
import { sessionBranchEntries } from "./session-reader";

interface HistoryCursor {
  version: 1;
  sessionId: string;
  leafId: string | null;
  beforeId: string;
}

export interface SessionHistoryPage {
  ok: true;
  sessionId: string;
  requestedCursor: string | null;
  entries: SessionEntry[];
  nextCursor: string | null;
  exhausted: boolean;
}

export interface SessionHistoryFailure {
  ok: false;
  sessionId: string;
  cursor: string | null;
  error: {
    code: "invalid_cursor" | "cursor_session_mismatch" | "cursor_not_found" | "leaf_not_found" | "session_not_found" | "read_failed" | "forbidden";
    message: string;
    retryable: boolean;
  };
}

export type SessionHistoryResult = SessionHistoryPage | SessionHistoryFailure;

export function sessionHistoryFailure(
  sessionId: string,
  cursor: string | null,
  code: SessionHistoryFailure["error"]["code"],
  message: string,
  retryable = false,
): SessionHistoryFailure {
  return { ok: false, sessionId, cursor, error: { code, message, retryable } };
}

function parseCursor(value: string): HistoryCursor | null {
  if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) return null;
    const candidate = decoded as Record<string, unknown>;
    if (
      candidate.version !== 1
      || typeof candidate.sessionId !== "string"
      || !(candidate.leafId === null || typeof candidate.leafId === "string")
      || typeof candidate.beforeId !== "string"
      || !candidate.sessionId
      || !candidate.beforeId
    ) return null;
    return candidate as unknown as HistoryCursor;
  } catch {
    return null;
  }
}

export function readSessionHistoryPage({
  sessionId,
  entries,
  leafId,
  cursor,
  pageSize = 50,
}: {
  sessionId: string;
  entries: SessionEntry[];
  leafId: string | null;
  cursor: string | null;
  pageSize?: number;
}): SessionHistoryResult {
  const parsed = cursor === null ? null : parseCursor(cursor);
  if (cursor !== null && !parsed) {
    return sessionHistoryFailure(sessionId, cursor, "invalid_cursor", "Invalid history cursor");
  }
  if (parsed && parsed.sessionId !== sessionId) {
    return sessionHistoryFailure(sessionId, cursor, "cursor_session_mismatch", "The history cursor belongs to another Session");
  }

  const selectedLeafId = parsed ? parsed.leafId : leafId;
  if (selectedLeafId !== null && !entries.some((entry) => entry.id === selectedLeafId)) {
    return sessionHistoryFailure(sessionId, cursor, "leaf_not_found", "Session branch not found");
  }
  const path = sessionBranchEntries(entries, selectedLeafId);
  const beforeIndex = parsed ? path.findIndex((entry) => entry.id === parsed.beforeId) : path.length;
  if (beforeIndex < 0) {
    return sessionHistoryFailure(sessionId, cursor, "cursor_not_found", "History cursor no longer exists");
  }

  const start = Math.max(0, beforeIndex - pageSize);
  const page = path.slice(start, beforeIndex);
  const exhausted = start === 0;
  const nextCursor = exhausted ? null : Buffer.from(JSON.stringify({
    version: 1,
    sessionId,
    leafId: selectedLeafId,
    beforeId: page[0].id,
  } satisfies HistoryCursor)).toString("base64url");
  return { ok: true, sessionId, requestedCursor: cursor, entries: page, nextCursor, exhausted };
}
