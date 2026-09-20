/**
 * Which findings the human has put away.
 *
 * Dismissing a finding hides it from the diff. The turn it was written in stays
 * in the Session transcript untouched, so nothing here is a copy of the words:
 * a record holds an identifier and a moment, and the body is read from the
 * transcript again on every visit.
 *
 * Each owner has its own key, exactly as the comments do, so one Session can
 * never read what another put away.
 */
const PREFIX = "omp-review-findings:";

export interface ReviewFindingView {
  /** The finding's stable identifier: its Session entry and directive. */
  id: string;
  dismissedAt: string;
}

export function readReviewFindingViews(ownerKey: string): ReviewFindingView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + ownerKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReviewFindingView);
  } catch {
    return [];
  }
}

export function writeReviewFindingViews(ownerKey: string, views: readonly ReviewFindingView[]): void {
  if (typeof window === "undefined") return;
  try {
    if (views.length === 0) window.localStorage.removeItem(PREFIX + ownerKey);
    else window.localStorage.setItem(PREFIX + ownerKey, JSON.stringify(views));
  } catch {
    // Storage denied or full: the finding stays on screen for this visit.
  }
}

/**
 * Change one owner's records, or refuse.
 *
 * The change is applied to what storage holds at this moment and only while the
 * owner it was started for is still the owner, which is the rule the comments
 * follow. Null means nothing was written.
 */
export function mutateReviewFindingViews(
  ownerKey: string,
  currentOwnerKey: string,
  apply: (current: ReviewFindingView[]) => ReviewFindingView[],
): ReviewFindingView[] | null {
  if (ownerKey !== currentOwnerKey) return null;
  const next = apply(readReviewFindingViews(ownerKey));
  writeReviewFindingViews(ownerKey, next);
  return next;
}

export function dismissReviewFinding(
  views: readonly ReviewFindingView[],
  id: string,
  dismissedAt: string,
): ReviewFindingView[] {
  if (views.some((view) => view.id === id)) return [...views];
  return [...views, { id, dismissedAt }];
}

/** Undismissing is the whole of the reversal: the record is the only dismissal. */
export function restoreReviewFinding(views: readonly ReviewFindingView[], id: string): ReviewFindingView[] {
  return views.filter((view) => view.id !== id);
}

export function isReviewFindingDismissed(views: readonly ReviewFindingView[], id: string): boolean {
  return views.some((view) => view.id === id);
}

function isReviewFindingView(value: unknown): value is ReviewFindingView {
  if (typeof value !== "object" || value === null) return false;
  const view = value as Record<string, unknown>;
  return typeof view.id === "string" && view.id !== "" && typeof view.dismissedAt === "string";
}
