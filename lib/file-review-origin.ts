import type { ReviewOwner } from "./review-owner";
import type { ReviewScope } from "./review-git";
import type { ReviewSelection } from "./review-selection";

/**
 * The Review a file Tab was opened from.
 *
 * A file Tab is addressed by its path, and a path says nothing about which
 * Review asked for it, at which line, or against what. This is that context,
 * and it lives on the Tab: held anywhere else it cannot survive the Tab being
 * reopened at another line, and two Review Tabs on one file would silently
 * take each other's.
 *
 * Browser-safe, and shared by the panel that fills it in and the Tab that
 * answers, so neither has to import the other.
 */
export interface FileReviewOrigin {
  /** The Review Tab this file was opened from. Its owner is read from there. */
  tabId: string;
  /** The path as the patch names it, relative to the repository root. */
  relativePath: string;
  /**
   * The revision the panel was displaying, and advisory only.
   *
   * A revision is a hash of one read's patch text, so a panel ignoring
   * whitespace, or a repository with clean filters configured, produces a
   * digest no other read can reproduce. The view re-reads the current one
   * rather than pinning this, and uses this only to notice that it changed.
   */
  revision?: string;
  /** The line the human was reading, one-based. */
  line?: number;
}

/** A file Tab's identity: per Review Tab when it came from one, per path otherwise. */
export function fileTabId(filePath: string, origin?: FileReviewOrigin | null): string {
  return origin ? `file:${origin.tabId}:${filePath}` : `file:${filePath}`;
}

/**
 * What the Review Tab is comparing, as the contents route names it.
 *
 * Null when this review has no readable scope — a pull request, or a last turn
 * with no Session. The view then says its change cannot be marked rather than
 * reading the working file as though it were one side of a comparison.
 */
export function reviewScopeFromSelection(selection: ReviewSelection | undefined, owner: ReviewOwner): ReviewScope | null {
  if (selection?.pullRequestView?.kind === "selected") return null;
  const kind = selection?.kind ?? "uncommitted";
  if (kind === "branch") return selection?.comparisonBranch ? { kind, base: selection.comparisonBranch } : null;
  if (kind === "commit") return selection?.commit ? { kind, revision: selection.commit } : null;
  if (kind === "lastTurn") return owner.sessionId ? { kind, sessionId: owner.sessionId } : null;
  return { kind };
}
