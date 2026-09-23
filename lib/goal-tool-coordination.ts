import type { Goal } from "@oh-my-pi/pi-tui/tools/goal";
import { GoalApiError, runGoalCommand } from "./goal-command";
import type { AgentSessionLike, GoalCommandResult } from "./omp-types";

type GoalEvent = {
  type: string;
};

type ToolPresentationSession = AgentSessionLike & {
  getMountedXdevToolNames(): string[];
  setActiveToolPresentation(names: string[], mountedNames: string[]): Promise<void>;
};

type ToolSnapshot = { names: string[]; mountedNames: string[] };

/** Keeps the OMP tool selection in step with OMP's Goal state for one Wrapper. */
export class GoalToolCoordination {
  private previousTools: ToolSnapshot | undefined;
  private completedGoalIds = new Set<string>();
  private commandRunning = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly session: AgentSessionLike) {}

  async run(command: Record<string, unknown>): Promise<GoalCommandResult> {
    await this.pending;
    this.commandRunning = true;
    let result: GoalCommandResult;
    try {
      result = await runGoalCommand(this.session, command, () => this.activate());
    } catch (error) {
      this.commandRunning = false;
      try {
        await this.reconcile();
      } catch {
        // Keep the command's typed error. A later Goal event can retry restoration.
      }
      throw error;
    }
    this.commandRunning = false;
    await this.reconcile();
    return result;
  }

  observe(event: GoalEvent): void {
    if (this.commandRunning) return;
    if (event.type === "goal_updated") {
      this.schedule(false);
    } else if (event.type === "agent_end" || event.type === "agent_settled") {
      if (this.session.getGoalModeState()?.mode === "exiting") this.schedule(true);
    }
  }

  async settle(): Promise<void> {
    await this.pending;
    await this.reconcile();
  }

  async selectTools(names: string[]): Promise<void> {
    await this.pending;
    const state = this.session.getGoalModeState();
    if (!state?.enabled || (state.goal.status !== "active" && state.goal.status !== "budget-limited")) {
      await this.session.setActiveToolsByName(names);
      return;
    }
    if (names.length === 0) {
      throw new GoalApiError(
        "goal_unsupported",
        "Goal mode requires tools. Pause or drop the Goal before selecting a restricted tool preset.",
        501,
      );
    }
    const oldTools = this.session.getEnabledToolNames();
    const nextTools = names.filter((name) => name !== "goal");
    await this.session.setActiveToolsByName([...nextTools, "goal"]);
    if (!this.session.getEnabledToolNames().includes("goal")) {
      await this.session.setActiveToolsByName(oldTools);
      throw new GoalApiError("goal_unsupported", "The installed OMP SDK cannot activate the Goal tool.", 501);
    }
    this.previousTools = this.snapshot();
  }

  private schedule(afterTurn: boolean): void {
    this.pending = this.pending.then(() => this.reconcile(afterTurn)).catch((error) => {
      console.error("[reeve] Goal tool coordination failed:", error);
    });
  }

  private toolSession(): ToolPresentationSession {
    const session = this.session as Partial<ToolPresentationSession>;
    if (typeof session.getMountedXdevToolNames !== "function" || typeof session.setActiveToolPresentation !== "function") {
      throw new GoalApiError("goal_unsupported", "The installed OMP SDK cannot restore the previous tool presentation.", 501);
    }
    return session as ToolPresentationSession;
  }

  private snapshot(): ToolSnapshot {
    return {
      names: this.session.getEnabledToolNames().filter((name) => name !== "goal"),
      mountedNames: this.toolSession().getMountedXdevToolNames(),
    };
  }

  private async activate(): Promise<void> {
    const current = this.snapshot();
    const previousTools = this.previousTools ?? current;
    await this.toolSession().setActiveToolPresentation([...current.names, "goal"], current.mountedNames);
    if (!this.session.getEnabledToolNames().includes("goal")) {
      await this.toolSession().setActiveToolPresentation(current.names, current.mountedNames);
      throw new GoalApiError(
        "goal_unsupported",
        "The restricted tool preset cannot activate the OMP Goal tool.",
        501,
      );
    }
    this.previousTools = previousTools;
  }

  private async restoreTools(): Promise<void> {
    if (!this.session.getEnabledToolNames().includes("goal")) {
      this.previousTools = undefined;
      return;
    }
    const previousTools = this.previousTools ?? this.snapshot();
    await this.toolSession().setActiveToolPresentation(previousTools.names, previousTools.mountedNames);
    this.previousTools = undefined;
  }

  private async reconcile(afterTurn = false): Promise<void> {
    const state = this.session.getGoalModeState();
    if (state?.goal.status === "complete") {
      if (this.session.isStreaming && !afterTurn) return;
      await this.complete(state.goal);
      return;
    }
    if (state?.enabled && (state.goal.status === "active" || state.goal.status === "budget-limited")) {
      if (!this.session.getEnabledToolNames().includes("goal")) await this.activate();
      return;
    }
    await this.restoreTools();
  }

  private async complete(goal: Goal): Promise<void> {
    if (this.completedGoalIds.has(goal.id)) return;
    await this.restoreTools();
    const alreadyRecorded = this.session.sessionManager.getEntries().some((entry) => (
      entry.type === "custom" && entry.customType === "goal-completed"
      && typeof entry.data === "object" && entry.data !== null && "id" in entry.data && entry.data.id === goal.id
    ));
    if (!alreadyRecorded) {
      this.session.sessionManager.appendCustomEntry("goal-completed", {
        id: goal.id,
        objective: goal.objective,
        tokensUsed: goal.tokensUsed,
        tokenBudget: goal.tokenBudget,
        timeUsedSeconds: goal.timeUsedSeconds,
      });
    }
    this.session.setGoalModeState(undefined);
    this.session.sessionManager.appendModeChange("none");
    this.completedGoalIds.add(goal.id);
  }
}
