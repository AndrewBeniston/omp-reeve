/**
 * The Review context menu, which the desktop shell draws natively.
 *
 * The applications a file can be opened in are resolved by the server and
 * handed over with the request: the main process draws the menu, and knows
 * nothing about what is installed.
 */

import type { ExternalEditorListing } from "./external-editor-registry";

export type ReviewMenuAction =
  | "open-file" | "copy-selection" | "copy-path" | "copy-relative-path" | "copy-diff" | "toggle-wrap"
  /** Open in one external application, named by its target id. */
  | `open-in:${string}`;

export interface ReviewMenuTarget {
  id: string;
  label: string;
  available: boolean;
}

export interface ReviewMenuState {
  hasSelection: boolean;
  targets?: ReviewMenuTarget[];
  preferredTargetId?: string | null;
  /** True while the applications are still being resolved. */
  loadingTargets?: boolean;
}

interface ReviewMenuBridge {
  showReviewMenu?: (state: ReviewMenuState) => Promise<unknown>;
}

/**
 * The applications for one menu, if they arrive in time.
 *
 * A native menu is drawn once, at the moment it pops, so the entries have to
 * be in hand first. The listing gets a short window. Past that the menu opens
 * and says it is still looking, rather than holding the pointer.
 *
 * `null` means the window closed first. A wrapped `null` listing means the
 * server answered with nothing, which the menu reads as no applications.
 */
export async function resolveReviewMenuTargets(
  listing: Promise<ExternalEditorListing | null>,
  waitMs = 150,
): Promise<{ listing: ExternalEditorListing | null } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), waitMs); });
  try {
    return await Promise.race([listing.then((value) => ({ listing: value })), expiry]);
  } finally {
    clearTimeout(timer);
  }
}

export async function showReviewMenu(state: ReviewMenuState): Promise<ReviewMenuAction | null> {
  const bridge = (globalThis as unknown as { ompDesktop?: ReviewMenuBridge }).ompDesktop;
  if (!bridge?.showReviewMenu) return null;
  const action = await bridge.showReviewMenu(state);
  if (typeof action !== "string") return null;
  switch (action) {
    case "open-file": case "copy-selection": case "copy-path": case "copy-relative-path": case "copy-diff": case "toggle-wrap":
      return action;
    default:
      // Only an identifier the menu was given can come back as one.
      return action.startsWith("open-in:") && state.targets?.some((target) => `open-in:${target.id}` === action)
        ? action as ReviewMenuAction
        : null;
  }
}
