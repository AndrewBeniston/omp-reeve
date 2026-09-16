import { sanitizeReviewSelection } from "./review-selection";
import { reviewTabIdFor, type ReviewOwner } from "./review-owner";
import type { ReviewSelection } from "./review-selection";

/**
 * What Reeve remembers about a Review Tab.
 *
 * Free of any node import, like the Browser tab store: the renderer imports
 * this, and the registry that writes it to disk is server-only. Putting the
 * two together pulls the OMP SDK into the client bundle.
 *
 * The whole owner is stored, because the record is what a later request is
 * authorized against.
 */
export interface StoredReviewTab {
  tabId: string;
  owner: ReviewOwner;
  /** What was being reviewed: scope, comparison, file, display preferences. */
  selection: ReviewSelection | null;
  /**
   * This Tab was the one on screen, in an open panel, when it was saved.
   *
   * Panel width is remembered by the browser; whether the panel was open is
   * not, so a restored Tab used to come back hidden behind a closed panel. A
   * Tab saved while the panel was shut, or while another Tab was in front,
   * records `false` and comes back without revealing anything.
   */
  active: boolean;
}

function storedOwner(value: unknown): ReviewOwner | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const projectRoot = typeof record.projectRoot === "string" ? record.projectRoot.trim() : "";
  const worktreePath = typeof record.worktreePath === "string" ? record.worktreePath.trim() : "";
  if (!projectRoot || !worktreePath) return null;
  const sessionId = typeof record.sessionId === "string" && record.sessionId.trim() ? record.sessionId.trim() : null;
  return { projectRoot, worktreePath, sessionId };
}

/**
 * Read back a stored Tab, discarding anything that is not one.
 *
 * The file is on disk and can be edited or truncated, so nothing from it
 * reaches the Tab model unchecked. A record whose id does not match its own
 * owner is dropped rather than repaired: the id is how a request finds its
 * binding, and a binding that disagrees with itself cannot authorize anything.
 */
export function fromStoredReviewTab(value: unknown): StoredReviewTab | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const tabId = typeof record.tabId === "string" ? record.tabId.trim() : "";
  const owner = storedOwner(record.owner);
  if (!tabId || !owner) return null;
  if (tabId !== reviewTabIdFor(owner)) return null;
  return { tabId, owner, selection: sanitizeReviewSelection(record.selection), active: record.active === true };
}

export function fromStoredReviewTabs(stored: unknown): StoredReviewTab[] {
  if (!Array.isArray(stored)) return [];
  const tabs: StoredReviewTab[] = [];
  for (const entry of stored) {
    const tab = fromStoredReviewTab(entry);
    if (tab && !tabs.some((existing) => existing.tabId === tab.tabId)) tabs.push(tab);
  }
  return tabs;
}
