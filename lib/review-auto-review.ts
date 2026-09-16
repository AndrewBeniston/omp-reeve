import {
  shouldStartAutomaticReview,
  shouldStartAutomaticSecurityReview,
  type ReviewSettings,
} from "./review-settings";
import type { ReviewSlashRequest } from "./review-slash-entries";

/**
 * What follows an act Reeve performed on the human's behalf (R17).
 *
 * Review 13 owns the preferences and the composition; this owns only the two
 * moments they are consulted, which are the two acts Reeve takes itself: a
 * push, and a pull request opened from Review. Both preferences ship off, so
 * nothing here fires until the human arms it.
 *
 * The security preference has a fourth trigger, riding on a code review
 * rather than on an act, so it is resolved against whether a code review is
 * actually starting rather than against the act alone.
 */
export type ReviewPerformedAct = "push" | "publish";

export interface AutomaticReviewDecision {
  code: boolean;
  security: boolean;
}

export function automaticReviewsFor(
  settings: Readonly<ReviewSettings>,
  act: ReviewPerformedAct,
  context: { withinUserStartedReview: boolean } = { withinUserStartedReview: false },
): AutomaticReviewDecision {
  const { withinUserStartedReview } = context;
  const code = shouldStartAutomaticReview(settings, { trigger: act, withinUserStartedReview });
  const security = settings.securityTrigger === "with-code-review"
    ? code && shouldStartAutomaticSecurityReview(settings, { trigger: "with-code-review", withinUserStartedReview })
    : shouldStartAutomaticSecurityReview(settings, { trigger: act, withinUserStartedReview });
  return { code, security };
}

/** What the panel is looking at, which decides what an automatic review asks about. */
export interface AutomaticReviewScope {
  /** The Review Tab's current scope. */
  kind: string;
  /** The comparison branch, when the Tab is scoped to one. */
  comparisonBranch: string | null;
  /** The base a branch was just published into, which pins a publish review. */
  publishedBase?: string | null;
}

/**
 * The one request that follows a push or a publish, or nothing.
 *
 * One request either way. The security pass rides on the same turn rather
 * than starting a second one, which is what its default trigger means, and it
 * carries the security flag even when it fires on a trigger of its own, so an
 * armed security preference is never reported as a review that did not
 * include it.
 *
 * A published branch is reviewed against what it was published into, because
 * that is the change that was just published. A push is reviewed the way the
 * panel is scoped, which is what the human is looking at.
 */
export function automaticReviewRequest(
  settings: Readonly<ReviewSettings>,
  act: ReviewPerformedAct,
  scope: AutomaticReviewScope,
  context: { withinUserStartedReview: boolean } = { withinUserStartedReview: false },
): ReviewSlashRequest | null {
  const decision = automaticReviewsFor(settings, act, context);
  if (!decision.code && !decision.security) return null;
  const pinned = scope.publishedBase?.trim();
  const branch = pinned || (scope.kind === "branch" ? scope.comparisonBranch?.trim() : "");
  return {
    ...(branch ? { mode: "branch" as const, base: branch } : { mode: "uncommitted" as const, base: null }),
    message: "",
    origin: "automatic",
    security: decision.security,
  };
}
