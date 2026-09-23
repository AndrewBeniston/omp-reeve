/** Transcript spacer and motion rules. The follow reducer lives in lib/transcript-follow.ts. */
import type { TurnPhase } from "@/lib/transcript/turn-folder";
import type { TranscriptRow } from "./transcript-rows";

/** The latest active Turn supplies the reducer phase. Saved Turns are idle. */
export function followPhaseFromRows(rows: readonly TranscriptRow[]): TurnPhase {
  const lastTurn = rows.findLast((row) => row.kind !== "message");
  return lastTurn && !lastTurn.settled ? lastTurn.phase : "idle";
}

/** Codex keeps one pixel below the active turn while its response area grows. */
export const ACTIVE_TURN_BOTTOM_DISTANCE_PX = 1;

/** Codex uses a zero-bounce, half-second spring for the response area. */
export const ACTIVE_TURN_SPACER_DURATION_MS = 500;
export const ACTIVE_TURN_PLACEMENT_THRESHOLD_PX = 300;

export function shouldPlaceLatestTurnAtEnd(distancePx: number, spacerHeightPx: number): boolean {
  return distancePx - spacerHeightPx <= ACTIVE_TURN_PLACEMENT_THRESHOLD_PX;
}

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

export function shouldMoveFollowTail(scrollToEndInstantly: boolean, activeTurnHeld: boolean): boolean {
  return scrollToEndInstantly && !activeTurnHeld;
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
