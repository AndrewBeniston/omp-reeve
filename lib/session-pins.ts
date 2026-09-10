import {
  loadPinnedSessionIds,
  toggleSessionPin,
} from "@oh-my-pi/pi-coding-agent/session/session-pins";

export { loadPinnedSessionIds };

export async function setSessionPinned(
  id: string,
  pinned: boolean,
  agentDir?: string,
): Promise<void> {
  const ids = await loadPinnedSessionIds(agentDir);
  if (ids.has(id) !== pinned) await toggleSessionPin(id, agentDir);
}
