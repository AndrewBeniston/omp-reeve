import type { AgentSessionLike, GoalCommandResult } from "./omp-types";
import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import type { GoalModeState } from "@oh-my-pi/pi-coding-agent/goals/state";
import type { SessionManager } from "@oh-my-pi/pi-coding-agent";

const GOAL_STATUSES = new Set(["active", "paused", "budget-limited", "complete", "dropped"]);

export type GoalErrorCode =
  | "goal_invalid_input"
  | "goal_invalid_transition"
  | "goal_disabled"
  | "goal_invalid_snapshot"
  | "goal_unsupported";

export class GoalApiError extends Error {
  constructor(
    public readonly code: GoalErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoalApiError";
  }
}

function objective(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoalApiError("goal_invalid_input", "The Goal objective must not be empty.", 400);
  }
  return value.trim();
}

function tokenBudget(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new GoalApiError("goal_invalid_input", "The Goal token budget must be a positive integer.", 400);
  }
  return value;
}

function requireGoalCapability(session: AgentSessionLike, method?: string): void {
  if (
    typeof session.getGoalModeState !== "function"
    || !session.goalRuntime
    || (method && typeof (session.goalRuntime as unknown as Record<string, unknown>)[method] !== "function")
  ) {
    throw new GoalApiError("goal_unsupported", `The installed OMP SDK does not support Goal ${method ?? "state"}.`, 501);
  }
}

type GoalContext = { mode: string; modeData?: Record<string, unknown> };

function readGoalFromContext({ mode, modeData }: GoalContext): Goal | null {
  if (mode !== "goal" && mode !== "goal_paused") return null;
  const candidate = modeData?.goal;
  const value = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
  const invalid = (field: string): never => {
    throw new GoalApiError("goal_invalid_snapshot", `The saved Goal has an invalid ${field}.`, 422);
  };
  if (!value) return invalid("goal");
  if (typeof value.id !== "string" || !value.id.trim()) invalid("id");
  if (typeof value.objective !== "string" || !value.objective.trim()) invalid("objective");
  if (!GOAL_STATUSES.has(value.status as string)) invalid("status");
  if (!Number.isSafeInteger(value.tokensUsed) || (value.tokensUsed as number) < 0) invalid("tokensUsed");
  if (!Number.isSafeInteger(value.timeUsedSeconds) || (value.timeUsedSeconds as number) < 0) invalid("timeUsedSeconds");
  if (!Number.isFinite(value.createdAt) || (value.createdAt as number) <= 0) invalid("createdAt");
  if (!Number.isFinite(value.updatedAt) || (value.updatedAt as number) < (value.createdAt as number)) invalid("updatedAt");
  if (value.tokenBudget !== undefined && (!Number.isSafeInteger(value.tokenBudget) || (value.tokenBudget as number) <= 0)) {
    invalid("tokenBudget");
  }
  if (mode === "goal_paused" && value.status !== "paused") invalid("status");
  if (mode === "goal" && (value.status === "paused" || value.status === "dropped")) invalid("status");
  return candidate as Goal;
}

/** Validate OMP's persisted mode entry before handing its Goal back to OMP. */
export function readPersistedGoal(session: AgentSessionLike): Goal | null {
  return readGoalFromContext(session.sessionManager.buildSessionContext());
}

/** Read Goal state from a Session file without creating an AgentSession. */
export function readPersistedGoalState(
  sessionManager: Pick<SessionManager, "buildSessionContext">,
): GoalCommandResult {
  const context = sessionManager.buildSessionContext();
  const { mode } = context;
  const goal = readGoalFromContext(context);
  if (!goal) return { goal: null, state: null };
  return {
    goal,
    state: { enabled: mode === "goal", mode: "active", goal },
  };
}

export async function restoreGoalFromSession(
  session: AgentSessionLike,
  options: { preserveActiveGoal?: boolean } = {},
): Promise<void> {
  const { mode } = session.sessionManager.buildSessionContext();
  if (mode !== "goal" && mode !== "goal_paused") return;
  requireGoalCapability(session, "onThreadResumed");
  if (session.settings.get("goal.enabled") !== true) {
    session.goalRuntime.clearAccounting();
    session.sessionManager.appendModeChange("none");
    return;
  }
  const goal = readPersistedGoal(session);
  if (!goal) return;
  session.setGoalModeState({ enabled: mode === "goal", mode: "active", goal });
  await session.goalRuntime.onThreadResumed({ preserveActiveGoal: options.preserveActiveGoal === true });
}

export async function runGoalCommand(
  session: AgentSessionLike,
  command: Record<string, unknown>,
  beforeActivation?: () => Promise<void>,
): Promise<GoalCommandResult> {
  requireGoalCapability(session);
  try {
    readPersistedGoal(session);
  } catch (error) {
    if (!(error instanceof GoalApiError) || error.code !== "goal_invalid_snapshot") throw error;
    if (command.op === "get") return { goal: null, state: null };
    if (command.op !== "drop") throw error;
    if (session.settings.get("goal.enabled") !== true) {
      throw new GoalApiError("goal_disabled", "Goal mode is disabled in OMP settings.", 403);
    }
    session.goalRuntime.clearAccounting();
    session.setGoalModeState(undefined);
    session.sessionManager.appendModeChange("none");
    return { goal: null, state: null };
  }
  if (command.op !== "get" && session.settings.get("goal.enabled") !== true) {
    throw new GoalApiError("goal_disabled", "Goal mode is disabled in OMP settings.", 403);
  }
  let reportedGoal: Goal | undefined;
  if (command.op === "create") {
    requireGoalCapability(session, "createGoal");
    const input = { objective: objective(command.objective), tokenBudget: tokenBudget(command.tokenBudget) };
    const current = session.getGoalModeState();
    if (current && current.goal.status !== "complete" && current.goal.status !== "dropped") {
      throw new GoalApiError("goal_invalid_transition", "This Session already has a Goal.", 409);
    }
    await beforeActivation?.();
    await session.goalRuntime.createGoal(input);
    // A new Session with only a mode entry has no file until OMP forces one.
    await session.sessionManager.ensureOnDisk();
  } else if (command.op === "replace") {
    requireGoalCapability(session, "replaceGoal");
    const input = { objective: objective(command.objective), tokenBudget: tokenBudget(command.tokenBudget) };
    const current = session.getGoalModeState();
    if (!current?.enabled || (current.goal.status !== "active" && current.goal.status !== "budget-limited")) {
      throw new GoalApiError("goal_invalid_transition", "Only an active Goal can be replaced.", 409);
    }
    await session.goalRuntime.replaceGoal(input);
  } else if (command.op === "set_budget") {
    requireGoalCapability(session, "onBudgetMutated");
    const budget = command.tokenBudget === null ? undefined : tokenBudget(command.tokenBudget);
    const current = session.getGoalModeState();
    if (!current || current.goal.status === "complete" || current.goal.status === "dropped") {
      throw new GoalApiError("goal_invalid_transition", "This Session has no Goal that can change its budget.", 409);
    }
    await session.goalRuntime.onBudgetMutated(budget);
  } else if (command.op === "set_objective") {
    const nextObjective = objective(command.objective);
    const current = session.getGoalModeState();
    if (!current || current.goal.status === "complete" || current.goal.status === "dropped") {
      throw new GoalApiError("goal_invalid_transition", "This Session has no Goal that can change its objective.", 409);
    }
    session.setGoalModeState({
      ...current,
      goal: { ...current.goal, objective: nextObjective },
    });
    // The installed OMP SDK has no objective-specific runtime method. Its
    // budget mutation path emits goal_updated and persists the current Goal.
    await session.goalRuntime.onBudgetMutated(current.goal.tokenBudget);
  } else if (command.op === "pause") {
    requireGoalCapability(session, "pauseGoal");
    const current = session.getGoalModeState();
    if (!current || (current.goal.status !== "active" && current.goal.status !== "budget-limited")) {
      throw new GoalApiError("goal_invalid_transition", "Only an active Goal can pause.", 409);
    }
    await session.goalRuntime.pauseGoal();
  } else if (command.op === "resume") {
    requireGoalCapability(session, "resumeGoal");
    const current = session.getGoalModeState();
    if (!current || current.goal.status !== "paused") {
      throw new GoalApiError("goal_invalid_transition", "Only a paused Goal can resume.", 409);
    }
    if (current.goal.tokenBudget !== undefined && current.goal.tokensUsed >= current.goal.tokenBudget) {
      throw new GoalApiError("goal_invalid_transition", "Increase or clear the Goal budget before resuming.", 409);
    }
    await beforeActivation?.();
    await session.goalRuntime.resumeGoal();
  } else if (command.op === "drop") {
    requireGoalCapability(session, "dropGoal");
    if (!session.getGoalModeState()) {
      throw new GoalApiError("goal_invalid_transition", "This Session has no Goal to drop.", 409);
    }
    reportedGoal = await session.goalRuntime.dropGoal();
  } else if (command.op === "complete") {
    requireGoalCapability(session, "completeGoalFromTool");
    const current = session.getGoalModeState();
    if (!current || current.goal.status === "complete" || current.goal.status === "dropped") {
      throw new GoalApiError("goal_invalid_transition", "This Session has no Goal to complete.", 409);
    }
    reportedGoal = await session.goalRuntime.completeGoalFromTool();
  } else if (command.op !== "get") {
    throw new GoalApiError("goal_invalid_input", "Unknown Goal operation.", 400);
  }

  const state = session.getGoalModeState();
  return { goal: reportedGoal ?? state?.goal ?? null, state: state ?? null };
}
