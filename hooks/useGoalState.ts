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

export type GoalAction = "pause" | "resume" | "drop" | "budget";

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
  const pendingActionRef = useRef<GoalAction | null>(null);
  const actionIdRef = useRef(0);
  const [pendingAction, setPendingAction] = useState<GoalAction | null>(null);
  const [actionError, setActionError] = useState<{ action: GoalAction; message: string } | null>(null);

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

  const runAction = useCallback(async (action: GoalAction, interrupt = false, budget?: number | null): Promise<boolean> => {
    if (!sessionId || sessionRef.current !== sessionId || pendingActionRef.current) return false;
    const actionId = ++actionIdRef.current;
    pendingActionRef.current = action;
    setPendingAction(action);
    setActionError(null);
    try {
      if (interrupt && (action === "pause" || action === "drop")) {
        await sendAgentCommand(sessionId, {
          type: "abort",
          goalReason: action === "drop" ? "internal" : "interrupted",
        });
      }
      const command = action === "budget"
        ? { type: "goal", op: "set_budget", tokenBudget: budget }
        : { type: "goal", op: action === "pause" && interrupt ? "get" : action };
      const result = await sendAgentCommand<GoalCommandResult>(sessionId, command);
      if (sessionRef.current !== sessionId) return false;
      readIdRef.current += 1;
      eventRevisionRef.current += 1;
      if (result.goal && lastGoalRef.current && isOlderGoal(result.goal, lastGoalRef.current, "read")) return true;
      if (result.goal) lastGoalRef.current = result.goal;
      setState({
        status: "ready",
        goal: result.goal?.status === "dropped" ? null : result.goal,
        modeState: result.goal?.status === "dropped" ? null : result.state,
        error: null,
      });
      return true;
    } catch (error) {
      if (sessionRef.current === sessionId) {
        setActionError({ action, message: error instanceof Error ? error.message : String(error) });
      }
      return false;
    } finally {
      if (actionIdRef.current === actionId) {
        pendingActionRef.current = null;
        if (sessionRef.current === sessionId) setPendingAction(null);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    sessionRef.current = sessionId;
    lastGoalRef.current = null;
    eventRevisionRef.current = 0;
    readIdRef.current += 1;
    pendingActionRef.current = null;
    actionIdRef.current += 1;
    setPendingAction(null);
    setActionError(null);
    setState(sessionId ? INITIAL_STATE : EMPTY_STATE);
    void refresh();
    return () => { sessionRef.current = null; readIdRef.current += 1; };
  }, [sessionId, refresh]);

  return {
    ...state, refresh, retry: refresh, onEvent, markStale,
    pendingAction, actionError,
    pause: (interrupt = false) => runAction("pause", interrupt),
    resume: () => runAction("resume"),
    clear: (interrupt = false) => runAction("drop", interrupt),
    setBudget: (budget: number | null) => runAction("budget", false, budget),
  };
}
