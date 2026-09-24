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
  continuationPending: boolean;
  error: string | null;
}

export interface GoalUpdateEvent {
  type: "goal_updated";
  goal: Goal | null;
  state?: GoalModeState;
}

export type GoalAction = "pause" | "resume" | "drop" | "budget" | "objective";

const INITIAL_STATE: GoalClientState = {
  status: "loading",
  goal: null,
  modeState: null,
  continuationPending: false,
  error: null,
};
const EMPTY_STATE: GoalClientState = { ...INITIAL_STATE, status: "ready" };

async function readGoalState(sessionId: string): Promise<GoalCommandResult & { continuationPending: boolean }> {
  const res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({})) as {
    goalState?: GoalModeState | null;
    data?: GoalCommandResult;
    goal?: GoalCommandResult["goal"];
    state?: { goalContinuationPending?: boolean };
    error?: string;
  };
  if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
  return {
    goal: body.goal ?? body.data?.goal ?? body.goalState?.goal ?? null,
    state: body.goalState ?? body.data?.state ?? null,
    continuationPending: body.state?.goalContinuationPending === true,
  };
}

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
  const actionErrorRef = useRef<{ action: GoalAction; message: string } | null>(null);
  const actionIdRef = useRef(0);
  const [pendingAction, setPendingAction] = useState<GoalAction | null>(null);
  const [actionError, setActionError] = useState<{ action: GoalAction; message: string } | null>(null);

  const refresh = useCallback(async (targetSessionId = sessionId) => {
    if (!sessionId || targetSessionId !== sessionId || sessionRef.current !== sessionId) return;
    const readId = ++readIdRef.current;
    const eventRevision = eventRevisionRef.current;
    setState((current) => current.status === "error" ? { ...current, status: "loading", error: null } : current);
    try {
      const result = await readGoalState(sessionId);
      if (sessionRef.current !== sessionId || readIdRef.current !== readId || eventRevisionRef.current !== eventRevision) return;
      if (result.goal && lastGoalRef.current && isOlderGoal(result.goal, lastGoalRef.current, "read")) return;
      if (result.goal) lastGoalRef.current = result.goal;
      setState({
        status: "ready",
        goal: result.goal,
        modeState: result.state,
        continuationPending: result.continuationPending,
        error: null,
      });
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
    setState((current) => ({
      status: "ready",
      goal,
      modeState: goal ? event.state ?? null : null,
      continuationPending: current.continuationPending,
      error: null,
    }));
  }, [refresh, sessionId]);

  const setContinuationPending = useCallback((pending: boolean) => {
    if (!sessionId || sessionRef.current !== sessionId) return;
    setState((current) => current.continuationPending === pending ? current : { ...current, continuationPending: pending });
  }, [sessionId]);

  const markStale = useCallback(() => {
    setState((current) => current.status === "ready" || current.status === "stale"
      ? { ...current, status: "stale" }
      : current);
  }, []);

  const runAction = useCallback(async (action: GoalAction, interrupt = false, budget?: number | null, objective?: string): Promise<boolean> => {
    if (!sessionId || sessionRef.current !== sessionId || pendingActionRef.current) return false;
    const actionId = ++actionIdRef.current;
    pendingActionRef.current = action;
    actionErrorRef.current = null;
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
        : action === "objective"
          ? { type: "goal", op: "set_objective", objective }
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
        continuationPending: false,
        error: null,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      actionErrorRef.current = { action, message };
      if (sessionRef.current === sessionId) {
        setActionError({ action, message });
      }
      return false;
    } finally {
      if (actionIdRef.current === actionId) {
        pendingActionRef.current = null;
        if (sessionRef.current === sessionId) setPendingAction(null);
      }
    }
  }, [sessionId]);

  const update = useCallback(async (objective: string, tokenBudget: number | null): Promise<boolean> => {
    const current = lastGoalRef.current;
    if (!current) return false;
    if (current.objective !== objective && !await runAction("objective", false, undefined, objective)) {
      throw new Error(actionErrorRef.current?.message ?? "The Session has no Goal that can change its objective.");
    }
    const nextBudget = tokenBudget ?? undefined;
    if (current.tokenBudget !== nextBudget && !await runAction("budget", false, tokenBudget)) {
      throw new Error(actionErrorRef.current?.message ?? "The Session has no Goal that can change its budget.");
    }
    return true;
  }, [runAction]);

  useEffect(() => {
    sessionRef.current = sessionId;
    lastGoalRef.current = null;
    eventRevisionRef.current = 0;
    readIdRef.current += 1;
    pendingActionRef.current = null;
    actionErrorRef.current = null;
    actionIdRef.current += 1;
    setPendingAction(null);
    setActionError(null);
    setState(sessionId ? INITIAL_STATE : EMPTY_STATE);
    void refresh();
    return () => { sessionRef.current = null; readIdRef.current += 1; };
  }, [sessionId, refresh]);

  return {
    ...state, refresh, retry: refresh, onEvent, markStale, setContinuationPending,
    pendingAction, actionError,
    pause: (interrupt = false) => runAction("pause", interrupt),
    resume: () => runAction("resume"),
    clear: (interrupt = false) => runAction("drop", interrupt),
    setBudget: (budget: number | null) => runAction("budget", false, budget),
    setObjective: (objective: string) => runAction("objective", false, undefined, objective),
    update,
  };
}
