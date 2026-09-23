/** A Turn's phase is supplied by the shared transcript folder. */
export type FollowTurnPhase = "idle" | "prework" | "final-answer";

export type FollowMode = "static" | "prework_watch" | "prework_follow" | "user_follow";

export const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 24;
export const USER_SCROLL_INTENT_DURATION_MS = 1000;
const SCROLL_MOVEMENT_TOLERANCE_PX = 1;

export interface FollowScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface TranscriptFollowState {
  mode: FollowMode;
  phase: FollowTurnPhase;
  previousScrollTop: number;
  preworkOverflowed: boolean;
}

export interface TranscriptFollowInput {
  /** The phase comes from the shared Turn, never from a raw OMP event. */
  turn: { phase: FollowTurnPhase };
  metrics: FollowScrollMetrics;
  /** Height of the current Turn's prework, excluding earlier Turns. */
  preworkContentHeight: number;
  spacerHeight: number;
  working: boolean;
  /** Use the same clock for now and userIntent.at. */
  now: number;
  event: "phase" | "content" | "scroll" | "button";
  userIntent?: { direction: "away" | "toward"; at: number };
}

export function createTranscriptFollowState(metrics: FollowScrollMetrics): TranscriptFollowState {
  const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return {
    mode: distance <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX ? "user_follow" : "static",
    phase: "idle",
    previousScrollTop: metrics.scrollTop,
    preworkOverflowed: false,
  };
}

export function reduceTranscriptFollow(state: TranscriptFollowState, input: TranscriptFollowInput): {
  state: TranscriptFollowState;
  scrollToEndInstantly: boolean;
  button: { visible: boolean; workingDots: boolean };
} {
  const phase = input.turn.phase;
  let mode = state.mode;
  if (phase !== state.phase) {
    if (phase === "prework") {
      if (mode === "static") mode = "prework_watch";
      else if (mode === "user_follow") mode = "prework_follow";
    } else if (phase === "final-answer" && state.phase === "prework") {
      mode = mode === "prework_follow" ? "user_follow" : "static";
    } else if (phase === "idle" && mode !== "user_follow") {
      mode = "static";
    }
  }
  const preworkOverflowed = phase === "prework"
    && input.preworkContentHeight > input.metrics.clientHeight;
  if (mode === "prework_watch" && preworkOverflowed
    && (state.phase !== "prework" || !state.preworkOverflowed)) {
    mode = "prework_follow";
  }
  if (input.event === "button") {
    mode = phase === "prework" ? "prework_follow" : "user_follow";
  }
  const intent = input.userIntent;
  const distance = input.metrics.scrollHeight - input.metrics.scrollTop - input.metrics.clientHeight;
  if (input.event === "scroll" && intent
    && input.now >= intent.at && input.now - intent.at <= USER_SCROLL_INTENT_DURATION_MS) {
    if (intent.direction === "away"
      && input.metrics.scrollTop < state.previousScrollTop - SCROLL_MOVEMENT_TOLERANCE_PX) {
      if (mode === "prework_follow") mode = "prework_watch";
      else if (mode === "user_follow") mode = phase === "prework" ? "prework_watch" : "static";
    } else if (intent.direction === "toward"
      && input.metrics.scrollTop > state.previousScrollTop + SCROLL_MOVEMENT_TOLERANCE_PX
      && distance <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX) {
      mode = phase === "prework" ? "prework_follow" : "user_follow";
    }
  }
  const visible = distance > Math.max(0, input.spacerHeight) + AUTO_FOLLOW_BOTTOM_THRESHOLD_PX;
  return {
    button: { visible, workingDots: visible && input.working },
    scrollToEndInstantly: input.event === "content"
      && (mode === "user_follow" || (mode === "prework_follow" && phase === "prework")),
    state: {
      mode,
      phase,
      previousScrollTop: input.metrics.scrollTop,
      preworkOverflowed,
    },
  };
}
