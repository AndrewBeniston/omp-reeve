/**
 * Transcript auto-follow rules.
 *
 * The transcript stays pinned to the newest content while the reader sits at
 * the end of the list. The rules below decide when that pin drops and when it
 * returns. They stay pure so a test can drive them without a browser.
 */

/** The transcript counts as "at the end" inside this band. DESIGN.md section 7.4. */
export const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 48;

/** Codex keeps one pixel below the active turn while its response area grows. */
export const ACTIVE_TURN_BOTTOM_DISTANCE_PX = 1;

/** Codex uses a zero-bounce, half-second spring for the response area. */
export const ACTIVE_TURN_SPACER_DURATION_MS = 500;

const ACTIVE_TURN_RESPONSE_HEIGHT_RATIO = 2 / 3;
const ACTIVE_TURN_MIN_REMAINING_HEIGHT_PX = 240;

/** Calculate Codex's reserved response area from the usable transcript height. */
export function getActiveTurnResponseSpacerHeight(transcriptHeightPx: number): number {
  const usableHeight = Math.max(0, transcriptHeightPx);
  return Math.max(0, Math.min(
    usableHeight * ACTIVE_TURN_RESPONSE_HEIGHT_RATIO,
    usableHeight - ACTIVE_TURN_MIN_REMAINING_HEIGHT_PX,
  ));
}

export function consumeActiveTurnSpacerHeight({
  currentHeight,
  targetHeight,
  placementScrollTop,
  currentScrollTop,
}: {
  currentHeight: number;
  targetHeight: number;
  placementScrollTop: number;
  currentScrollTop: number;
}): number {
  const consumed = Math.max(0, placementScrollTop - currentScrollTop);
  return Math.max(0, Math.min(currentHeight, targetHeight - consumed));
}

export function shouldFollowStreamingTail({
  pinned,
  activeTurnHeld,
}: {
  pinned: boolean;
  activeTurnHeld: boolean;
}): boolean {
  return pinned && !activeTurnHeld;
}

/**
 * Sub-pixel scroll positions and rounding move scrollTop by a fraction, so a
 * lift smaller than this does not count as an upward scroll.
 */
export const UPWARD_SCROLL_TOLERANCE_PX = 1;

export interface TranscriptScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface FollowStateInput {
  /** The pin state before this scroll event. */
  pinned: boolean;
  /** The scrollTop of the previous event, or null for the first event. */
  previousScrollTop: number | null;
  metrics: TranscriptScrollMetrics;
  /** True when a wheel, pointer, touch, or scroll key acted a moment ago. */
  userScrollIntent: boolean;
}

export interface FollowScrollEventInput extends Omit<FollowStateInput, "userScrollIntent"> {
  now: number;
  ignoreProgrammaticScrollUntil: number;
  userScrollIntentUntil: number;
}

/** Return the pixel gap between the viewport bottom and the transcript end. */
export function distanceFromBottom(metrics: TranscriptScrollMetrics): number {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
}

/** Report whether the reader sits inside the auto-follow band. */
export function isNearBottom(metrics: TranscriptScrollMetrics): boolean {
  return distanceFromBottom(metrics) <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX;
}

function movedUp(previousScrollTop: number | null, scrollTop: number): boolean {
  return previousScrollTop !== null
    && scrollTop < previousScrollTop - UPWARD_SCROLL_TOLERANCE_PX;
}

/**
 * Decide the next pin state for one scroll event.
 *
 * An upward move drops the pin only after wheel, pointer, touch, or keyboard
 * intent. Layout changes can move the viewport by a few pixels while streamed
 * content grows, and those changes must not alternate the pin state.
 */
export function nextPinnedState({
  pinned,
  previousScrollTop,
  metrics,
  userScrollIntent,
}: FollowStateInput): boolean {
  if (userScrollIntent && movedUp(previousScrollTop, metrics.scrollTop)) return false;
  if (isNearBottom(metrics)) return true;
  if (userScrollIntent) return false;
  return pinned;
}

export function nextPinnedStateForScrollEvent({
  pinned,
  previousScrollTop,
  metrics,
  now,
  ignoreProgrammaticScrollUntil,
  userScrollIntentUntil,
}: FollowScrollEventInput): boolean {
  const userScrollIntent = now <= userScrollIntentUntil;
  if (userScrollIntent && movedUp(previousScrollTop, metrics.scrollTop)) return false;
  if (now < ignoreProgrammaticScrollUntil) return pinned;
  return nextPinnedState({ pinned, previousScrollTop, metrics, userScrollIntent });
}

/** Replace a smooth scroll with an instant one when the reader asks for reduced motion. */
export function resolveScrollBehavior(
  preferred: ScrollBehavior,
  prefersReducedMotion: boolean,
): ScrollBehavior {
  return prefersReducedMotion ? "instant" : preferred;
}

/** Report whether the reader asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Show the new-message control only while a detached transcript keeps streaming. */
export function shouldOfferNewMessages({
  pinned,
  streaming,
}: { pinned: boolean; streaming: boolean }): boolean {
  return streaming && !pinned;
}
