/**
 * The code-review preferences (R17), mapped onto what Reeve can do without a
 * hosted service or a credit ledger.
 */

/**
 * What fires a review. `publish` and `push` are acts Reeve performs for the
 * human; `smart` decides for itself, so it is bounded below.
 */
export const REVIEW_TRIGGERS = ["publish", "push", "smart"] as const;
export type ReviewTrigger = (typeof REVIEW_TRIGGERS)[number];

/** The review triggers plus riding on a code review that already started. */
export const SECURITY_REVIEW_TRIGGERS = [...REVIEW_TRIGGERS, "with-code-review"] as const;
export type SecurityReviewTrigger = (typeof SECURITY_REVIEW_TRIGGERS)[number];

/** The four severities the reference offers, worst first. */
export const REVIEW_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

/** Where a requested review lands. The one preference picked per review. */
export const REVIEW_DELIVERIES = ["current-chat", "review-chat"] as const;
export type ReviewDelivery = (typeof REVIEW_DELIVERIES)[number];

export interface ReviewSettings {
  /** Whether Reeve may start a review turn without being asked each time. */
  automaticReview: boolean;
  reviewTrigger: ReviewTrigger;
  /** Keep looking until a pass finds nothing new, within a fixed bound. */
  exhaustiveReview: boolean;
  /**
   * The reference stores this as always versus the repository default. Reeve
   * has no repository policy store, so the faithful reduction is on or off.
   */
  automaticSecurityReview: boolean;
  securityTrigger: SecurityReviewTrigger;
  /** The floor for a review Reeve started on its own. */
  automaticSeverityFloor: ReviewSeverity;
  /** The floor for a review the human asked for. */
  requestedSeverityFloor: ReviewSeverity;
  /** Where a requested review is delivered. */
  delivery: ReviewDelivery;
}

/**
 * Both automatic groups ship off: arming them for the human is not theirs to
 * do. The reference's severity defaults are unrecorded, so both floors start
 * where nothing is withheld.
 */
export const DEFAULT_REVIEW_SETTINGS: Readonly<ReviewSettings> = {
  automaticReview: false,
  reviewTrigger: "publish",
  exhaustiveReview: false,
  automaticSecurityReview: false,
  securityTrigger: "with-code-review",
  automaticSeverityFloor: "low",
  requestedSeverityFloor: "low",
  delivery: "current-chat",
};

/** "Until nothing new appears" is unbounded on its own, so it gets a bound. */
export const EXHAUSTIVE_REVIEW_PASS_LIMIT = 3;

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * One complete set, whatever was stored. A key missing from an older write
 * reads as the wrong default rather than as an error, so every read is here.
 */
export function reviewSettings(stored?: Partial<Record<keyof ReviewSettings, unknown>> | null): Readonly<ReviewSettings> {
  if (!stored) return DEFAULT_REVIEW_SETTINGS;
  return {
    automaticReview: typeof stored.automaticReview === "boolean" ? stored.automaticReview : DEFAULT_REVIEW_SETTINGS.automaticReview,
    reviewTrigger: isOneOf(REVIEW_TRIGGERS, stored.reviewTrigger) ? stored.reviewTrigger : DEFAULT_REVIEW_SETTINGS.reviewTrigger,
    exhaustiveReview: typeof stored.exhaustiveReview === "boolean" ? stored.exhaustiveReview : DEFAULT_REVIEW_SETTINGS.exhaustiveReview,
    automaticSecurityReview: typeof stored.automaticSecurityReview === "boolean" ? stored.automaticSecurityReview : DEFAULT_REVIEW_SETTINGS.automaticSecurityReview,
    securityTrigger: isOneOf(SECURITY_REVIEW_TRIGGERS, stored.securityTrigger) ? stored.securityTrigger : DEFAULT_REVIEW_SETTINGS.securityTrigger,
    automaticSeverityFloor: isOneOf(REVIEW_SEVERITIES, stored.automaticSeverityFloor) ? stored.automaticSeverityFloor : DEFAULT_REVIEW_SETTINGS.automaticSeverityFloor,
    requestedSeverityFloor: isOneOf(REVIEW_SEVERITIES, stored.requestedSeverityFloor) ? stored.requestedSeverityFloor : DEFAULT_REVIEW_SETTINGS.requestedSeverityFloor,
    delivery: isOneOf(REVIEW_DELIVERIES, stored.delivery) ? stored.delivery : DEFAULT_REVIEW_SETTINGS.delivery,
  };
}

export interface AutomaticReviewEvent {
  trigger: ReviewTrigger;
  /** True only while a review the human started is still running. */
  withinUserStartedReview: boolean;
}

/**
 * The smart trigger is confined to a review already under way, which is what
 * stops it waking a Session.
 */
export function shouldStartAutomaticReview(
  settings: Readonly<ReviewSettings>,
  event: AutomaticReviewEvent,
): boolean {
  if (!settings.automaticReview) return false;
  if (settings.reviewTrigger !== event.trigger) return false;
  return event.trigger !== "smart" || event.withinUserStartedReview;
}

export interface AutomaticSecurityReviewEvent extends Omit<AutomaticReviewEvent, "trigger"> {
  trigger: SecurityReviewTrigger;
}

/** `with-code-review` inherits the action that started the review it rides on. */
export function shouldStartAutomaticSecurityReview(
  settings: Readonly<ReviewSettings>,
  event: AutomaticSecurityReviewEvent,
): boolean {
  if (!settings.automaticSecurityReview) return false;
  if (settings.securityTrigger !== event.trigger) return false;
  return event.trigger !== "smart" || event.withinUserStartedReview;
}

/**
 * The floor a review reports against, by who started it.
 *
 * Advisory, and instruction-only: the reference's floor shapes what its
 * hosted reviewer posts, and in Reeve the model is the reviewer, so the floor
 * travels in the prompt. Nothing filters the answer afterwards — it stays the
 * ordinary Markdown the model wrote.
 */
export function severityFloorFor(
  settings: Readonly<ReviewSettings>,
  origin: "automatic" | "requested",
): ReviewSeverity {
  return origin === "automatic" ? settings.automaticSeverityFloor : settings.requestedSeverityFloor;
}
