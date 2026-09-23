const STORAGE_VERSION = 1;
const STORAGE_PREFIX = `reeve:transcript-scroll-offset:v${STORAGE_VERSION}:`;

type OffsetStorage = Pick<Storage, "getItem" | "setItem">;

export function readTranscriptOffset(storage: OffsetStorage, sessionId: string | null): number | null {
  if (!sessionId) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${sessionId}`);
    if (!raw) return null;
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== "object") return null;
    const { version, distanceFromEnd } = record as Record<string, unknown>;
    return version === STORAGE_VERSION && typeof distanceFromEnd === "number"
      && Number.isFinite(distanceFromEnd) && distanceFromEnd >= 0
      ? distanceFromEnd : null;
  } catch {
    return null;
  }
}

export function writeTranscriptOffset(storage: OffsetStorage, sessionId: string | null, distanceFromEnd: number): void {
  if (!sessionId || !Number.isFinite(distanceFromEnd) || distanceFromEnd < 0) return;
  try {
    storage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify({
      version: STORAGE_VERSION,
      distanceFromEnd,
    }));
  } catch {
    // Reading a Session must still work when browser storage is unavailable.
  }
}
