"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendAgentCommand } from "@/lib/agent-client";
import type { GoalCommandResult } from "@/lib/omp-types";
import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import type { GoalModeState } from "@oh-my-pi/pi-coding-agent/goals/state";

export interface GoalClientState {
  status: "loading" | "ready" | "error" | "stale";
  goal: Goal | null;
  modeState: GoalModeState | null;
  error: string | null;
}

export interface GoalUpdateEvent {
  type: "goal_updated";
  goal: Goal | null;
  state?: GoalModeState;
}

const INITIAL_STATE: GoalClientState = {
  status: "loading",
  goal: null,
  modeState: null,
  error: null,
};
const EMPTY_STATE: GoalClientState = { ...INITIAL_STATE, status: "ready" };

function isOlderGoal(incoming: Goal, last: Goal, source: "read" | "event"): boolean {
  if (incoming.createdAt !== last.createdAt) return incoming.createdAt < last.createdAt;
  if (incoming.id !== last.id) return source === "event" && incoming.updatedAt <= last.updatedAt;
  return source === "event" ? incoming.updatedAt <= last.updatedAt : incoming.updatedAt < last.updatedAt;
}

export function useGoalState(sessionId: string | null) {
  const [state, setState] = useState<GoalClientState>(sessionId ? INITIAL_STATE : EMPTY_STATE);
  const sessionRef = useRef(sessionId);
  const eventRevisionRef = useRef(0);
  const readIdRef = useRef(0);
  const lastGoalRef = useRef<Goal | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const readId = ++readIdRef.current;
    const eventRevision = eventRevisionRef.current;
    setState((current) => current.status === "error" ? { ...current, status: "loading", error: null } : current);
    try {
      const result = await sendAgentCommand<GoalCommandResult>(sessionId, { type: "goal", op: "get" });
      if (sessionRef.current !== sessionId || readIdRef.current !== readId || eventRevisionRef.current !== eventRevision) return;
      if (result.goal && lastGoalRef.current && isOlderGoal(result.goal, lastGoalRef.current, "read")) return;
      if (result.goal) lastGoalRef.current = result.goal;
      setState({ status: "ready", goal: result.goal, modeState: result.state, error: null });
    } catch (error) {
      if (sessionRef.current !== sessionId || readIdRef.current !== readId || eventRevisionRef.current !== eventRevision) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((current) => ({
        ...current,
        status: current.status === "ready" || current.status === "stale" ? "stale" : "error",
        error: message,
      }));
    }
  }, [sessionId]);

  const onEvent = useCallback((event: GoalUpdateEvent) => {
    if (!sessionId || sessionRef.current !== sessionId) return;
    if (!event.goal) {
      void refresh();
      return;
    }
    if (event.goal && lastGoalRef.current && isOlderGoal(event.goal, lastGoalRef.current, "event")) return;
    eventRevisionRef.current += 1;
    if (event.goal) lastGoalRef.current = event.goal;
    const goal = event.goal?.status === "dropped" ? null : event.goal;
    setState({ status: "ready", goal, modeState: goal ? event.state ?? null : null, error: null });
  }, [refresh, sessionId]);

  const markStale = useCallback(() => {
    setState((current) => current.status === "ready" || current.status === "stale"
      ? { ...current, status: "stale" }
      : current);
  }, []);

  useEffect(() => {
    sessionRef.current = sessionId;
    lastGoalRef.current = null;
    eventRevisionRef.current = 0;
    readIdRef.current += 1;
    setState(sessionId ? INITIAL_STATE : EMPTY_STATE);
    void refresh();
    return () => { sessionRef.current = null; readIdRef.current += 1; };
  }, [sessionId, refresh]);

  return { ...state, refresh, retry: refresh, onEvent, markStale };
}
