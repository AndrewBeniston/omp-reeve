import type { TurnSpanStatus } from "./review-turn-store";

/**
 * When a prompt begins and ends, as Reeve sees it.
 *
 * Three facts from the SDK shape this. A prompt is not a model turn, so
 * `turn_start` and `turn_end` are too fine. The prompt's own promise resolves
 * when the turn it dispatched has unwound, which covers the tools that turn
 * awaited but not a steer or follow-up queued during it: `#endInFlight` drains
 * those from a promise nobody awaits. And `agent_end` is held back until the
 * in-flight count reaches zero and re-emitted with `isTerminal: false` when a
 * continuation will follow.
 *
 * So a span closes only when both are true: the prompt promise has settled,
 * and an `agent_end` has arrived that was not marked as continuing. Either
 * may come first. `agent_settled` plays no part — the installed SDK never
 * raises it.
 */
export type TurnLifecycleEvent =
  | { type: "prompt_started"; promptId: string }
  | { type: "continuation" }
  | { type: "abort_requested" }
  | { type: "agent_started" }
  | { type: "agent_ended"; terminal: boolean }
  /**
   * Carries the prompt it belongs to. The promise that raises it is held by
   * the run that dispatched it, and can settle long after that run stopped
   * being the open one.
   */
  | { type: "prompt_settled"; failed?: boolean; promptId?: string }
  | { type: "settle_timeout" };

/**
 * What the run executed, which is what attribution is built from.
 *
 * These carry no lifecycle meaning: a tool neither opens nor closes a span,
 * and the state machine passes them through untouched. They are recorded
 * beside the span instead, by the recorder.
 */
export type TurnToolEvent =
  | { type: "tool_started"; toolCallId: string; toolName: string; args: unknown }
  /** The result is what `edit` reports its files became; see review-turn-attribution. */
  | { type: "tool_ended"; toolCallId: string; toolName: string; result?: unknown; isError?: boolean };

export interface TurnLifecycleState {
  promptId: string | null;
  aborting: boolean;
  started: boolean;
  /** A run is executing right now, so nothing is waiting on anything. */
  running: boolean;
  terminal: boolean;
  settled: { failed: boolean } | null;
}

export const IDLE_TURN_LIFECYCLE: TurnLifecycleState = {
  promptId: null,
  aborting: false,
  started: false,
  running: false,
  terminal: false,
  settled: null,
};

export interface TurnLifecycleClose {
  promptId: string;
  status: TurnSpanStatus;
  /**
   * False when the workspace may still be under the run's hand. The span is
   * recorded without an after state rather than holding up a tree that is
   * still being written as though the prompt had finished.
   */
  capture: boolean;
}

export interface TurnLifecycleDecision {
  state: TurnLifecycleState;
  open?: { promptId: string };
  close?: TurnLifecycleClose;
}

function settledClose(state: TurnLifecycleState): TurnLifecycleClose | undefined {
  if (!state.promptId || !state.settled || !state.terminal) return undefined;
  const status: TurnSpanStatus = state.aborting ? "interrupted" : state.settled.failed ? "failed" : "completed";
  return { promptId: state.promptId, status, capture: true };
}

export function stepTurnLifecycle(state: TurnLifecycleState, event: TurnLifecycleEvent): TurnLifecycleDecision {
  switch (event.type) {
    case "prompt_started": {
      // A prompt that starts while one is open ends it. Its end state is only
      // trustworthy if that prompt had already settled and stopped.
      const close: TurnLifecycleClose | undefined = state.promptId
        ? { promptId: state.promptId, status: "superseded", capture: Boolean(state.settled && state.terminal) }
        : undefined;
      return {
        state: { ...IDLE_TURN_LIFECYCLE, promptId: event.promptId },
        open: { promptId: event.promptId },
        ...(close ? { close } : {}),
      };
    }
    case "continuation":
      // A steer or follow-up joins the run already going: no new baseline, and
      // no end for the span it joined.
      return { state };
    case "abort_requested":
      if (!state.promptId) return { state };
      return { state: { ...state, aborting: true } };
    case "agent_started":
      if (!state.promptId) return { state };
      // A run that is starting has not ended, whatever the last end said. An
      // end left standing here would let the next settle close a span over a
      // workspace the session is still writing.
      return { state: { ...state, started: true, running: true, terminal: false } };
    case "agent_ended": {
      if (!state.promptId) return { state };
      // A non-terminal end means the SDK has a continuation to run.
      const next = { ...state, running: false, terminal: event.terminal };
      const close = settledClose(next);
      return close ? { state: IDLE_TURN_LIFECYCLE, close } : { state: next };
    }
    case "prompt_settled": {
      if (!state.promptId) return { state };
      // A settle belonging to a prompt this session has moved past says
      // nothing about the one that is open now.
      if (event.promptId && event.promptId !== state.promptId) return { state };
      const next = { ...state, settled: { failed: event.failed === true } };
      // A prompt that failed before any run started has nothing to wait for.
      if (next.settled.failed && !next.started) {
        return { state: IDLE_TURN_LIFECYCLE, close: { promptId: state.promptId, status: "failed", capture: true } };
      }
      const close = settledClose(next);
      return close ? { state: IDLE_TURN_LIFECYCLE, close } : { state: next };
    }
    case "settle_timeout": {
      if (!state.promptId) return { state };
      // The run never reported a terminal end. Whatever it is doing, its
      // workspace is not a finished state, and must not be recorded as one.
      return {
        state: IDLE_TURN_LIFECYCLE,
        close: { promptId: state.promptId, status: "interrupted", capture: false },
      };
    }
  }
}

/**
 * Whether a prompt is stuck waiting for the half of its ending that has not
 * arrived.
 *
 * Only then does a timeout mean anything. While a run is executing there is
 * nothing to wait for, however long it takes, and a prompt that has reported
 * neither half has not begun to end.
 */
export function isAwaitingSettle(state: TurnLifecycleState): boolean {
  if (!state.promptId || state.running) return false;
  return state.settled !== null || state.terminal;
}
