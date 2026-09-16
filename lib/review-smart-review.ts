import { shouldStartAutomaticReview, shouldStartAutomaticSecurityReview, type ReviewSettings } from "./review-settings";
import type { ReviewSlashRequest } from "./review-slash-entries";

/**
 * The experimental trigger: re-reviewing inside a review the human started
 * (R17). It is the one trigger that decides for itself, so everything here
 * exists to bound it.
 *
 * It hangs off a review the human asked for, it queues every change whoever
 * made it, it waits for that review's turn to settle instead of talking over
 * it, and it runs a fixed number of times before it stops. Nothing here
 * guesses who wrote a change: a fixed number of follow-ups is what keeps a
 * review of the review's own edits from looping.
 */

/** How many follow-ups one human-started review may produce. */
export const SMART_REVIEW_FOLLOW_UP_LIMIT = 2;

/**
 * How many times one follow-up may ask the composer before it stops.
 *
 * The panel and the composer hold two views of whether the Session is busy,
 * and they can disagree for a moment after a turn ends. A refused ask costs
 * an attempt, never a follow-up, and a fixed number of attempts is what stops
 * the retry from running forever.
 */
export const SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT = 3;

export interface SmartReviewState {
  /** A human-started review this trigger hangs from. */
  armed: boolean;
  /** A change seen since the last review, still waiting for a quiet moment. */
  pendingChange: boolean;
  /** Follow-ups still allowed before this trigger stops by itself. */
  followUpsLeft: number;
  /** Asks still allowed for the current follow-up before the trigger stops. */
  attemptsLeft: number;
  /**
   * What the last review in this run was looking at.
   *
   * A content fingerprint, so "has anything changed" is answered by the
   * changes themselves rather than by guessing who wrote them. Reeve cannot
   * tell the model's edit from the human's or from another tool's, and a rule
   * that assumed it would drop real work.
   */
  lastReviewed: string | null;
}

export const IDLE_SMART_REVIEW: Readonly<SmartReviewState> = {
  armed: false,
  pendingChange: false,
  followUpsLeft: 0,
  attemptsLeft: 0,
  lastReviewed: null,
};

/** Whether either preference is armed on the smart trigger. */
export function smartReviewArmed(settings: Readonly<ReviewSettings>): boolean {
  const code = shouldStartAutomaticReview(settings, { trigger: "smart", withinUserStartedReview: true });
  const security = shouldStartAutomaticSecurityReview(settings, { trigger: "smart", withinUserStartedReview: true });
  return code || security;
}

/**
 * A review the human started, which is the only thing that arms this. An
 * automatic review does not arm it: a trigger that re-armed itself would be
 * the runaway the bound exists to prevent.
 */
export function armSmartReview(
  settings: Readonly<ReviewSettings>,
  reviewed: string | null,
): Readonly<SmartReviewState> {
  return smartReviewArmed(settings)
    ? {
      armed: true,
      pendingChange: false,
      followUpsLeft: SMART_REVIEW_FOLLOW_UP_LIMIT,
      attemptsLeft: SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT,
      lastReviewed: reviewed,
    }
    : IDLE_SMART_REVIEW;
}

/**
 * The Worktree now looks like this.
 *
 * Every change counts, whoever made it and whether or not the Session is
 * working: a change that arrived during the review is queued and waits, it is
 * never dropped. Content that matches what the last review saw is not a
 * change at all, which is what stops a review of nothing.
 */
export function noteSmartReviewChange(
  state: Readonly<SmartReviewState>,
  context: { fingerprint: string },
): Readonly<SmartReviewState> {
  if (!state.armed) return state;
  if (context.fingerprint === state.lastReviewed) return state;
  return state.pendingChange ? state : { ...state, pendingChange: true };
}

/** Everything that has to be true, and known, before a follow-up may start. */
export interface SmartReviewGate {
  /**
   * Whether the owning Session is working. `null` means nobody has said yet,
   * which is not the same as idle: a stream that has not delivered its first
   * frame, or that dropped, would otherwise read as quiet.
   */
  sessionRunning: boolean | null;
  /** The Tab is in front, in a window somebody is looking at. */
  panelVisible: boolean;
  /** The Tab is showing local changes, not a pull request or a fixed commit. */
  scopeReviewable: boolean;
  /** The diff has loaded, so there is something to review. */
  resultReady: boolean;
  /** A review is already on its way; a second would be the duplicate again. */
  requestBusy: boolean;
}

/**
 * Whether a follow-up is due now.
 *
 * Every condition is required, and an unknown run state blocks rather than
 * passes. This is the one trigger nobody asked for at the moment it fires, so
 * it starts only when everything about the moment is known to be right.
 */
export function smartReviewDue(state: Readonly<SmartReviewState>, gate: SmartReviewGate): boolean {
  return state.armed
    && state.pendingChange
    && state.followUpsLeft > 0
    && gate.sessionRunning === false
    && gate.panelVisible
    && gate.scopeReviewable
    && gate.resultReady
    && !gate.requestBusy;
}

/**
 * One follow-up spent, against the content the accepted review is about.
 *
 * Call this only when the review turn started. A follow-up that was composed
 * and refused costs nothing here, because it reviewed nothing. The last
 * follow-up disarms the trigger, so a review that changes files can produce
 * at most a fixed number of further reviews rather than a loop.
 */
export function consumeSmartReview(
  state: Readonly<SmartReviewState>,
  context: { fingerprint: string },
): Readonly<SmartReviewState> {
  const followUpsLeft = Math.max(0, state.followUpsLeft - 1);
  return followUpsLeft === 0
    ? IDLE_SMART_REVIEW
    : {
      armed: true,
      pendingChange: false,
      followUpsLeft,
      attemptsLeft: SMART_REVIEW_DISPATCH_ATTEMPT_LIMIT,
      lastReviewed: context.fingerprint,
    };
}

/**
 * The composer refused this follow-up, so ask again in a moment.
 *
 * The change stays queued and the follow-up allowance stays whole: nothing
 * was reviewed. Only the attempt allowance falls, and its last attempt
 * disarms the trigger rather than asking forever.
 */
export function deferSmartReview(state: Readonly<SmartReviewState>): Readonly<SmartReviewState> {
  if (!state.armed) return state;
  const attemptsLeft = Math.max(0, state.attemptsLeft - 1);
  return attemptsLeft === 0 ? IDLE_SMART_REVIEW : { ...state, attemptsLeft };
}

/** What the panel is looking at, which decides what a follow-up asks about. */
export interface SmartReviewScope {
  kind: string;
  comparisonBranch: string | null;
}

/**
 * The follow-up request. It carries the security pass when that preference is
 * armed, in the same turn, as every other automatic review does.
 */
export function smartReviewRequest(
  settings: Readonly<ReviewSettings>,
  scope: SmartReviewScope,
): ReviewSlashRequest | null {
  if (!smartReviewArmed(settings)) return null;
  const branch = scope.kind === "branch" ? scope.comparisonBranch?.trim() : "";
  return {
    ...(branch ? { mode: "branch" as const, base: branch } : { mode: "uncommitted" as const, base: null }),
    message: "",
    origin: "automatic",
    security: shouldStartAutomaticSecurityReview(settings, { trigger: "smart", withinUserStartedReview: true }),
  };
}
