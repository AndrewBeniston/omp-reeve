export type MultiAgentActionKind = "spawn" | "sendInput" | "close" | "resume" | "interrupt" | "list";
export type MultiAgentActionState = "inProgress" | "completed" | "failed" | "interrupted";

export function multiAgentActionState(isError: boolean | undefined, hasResult: boolean, details: unknown): MultiAgentActionState {
  const status = typeof details === "object" && details !== null ? (details as { status?: unknown }).status : undefined;
  if (status === "aborted" || status === "interrupted") return "interrupted";
  if (isError) return "failed";
  return hasResult ? "completed" : "inProgress";
}

export function multiAgentActionIds(input: Record<string, unknown>): { receiverThreadIds?: string[]; agentIds?: string[] } {
  const receiver = input.receiverThreadIds ?? input.receiverThreadIdsList ?? input.receivers ?? input.receiverIds;
  const agents = input.agentIds ?? input.agent_ids ?? input.agents;
  const values = (value: unknown): string[] | undefined => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : undefined;
  return { receiverThreadIds: values(receiver), agentIds: values(agents) };
}

export interface MultiAgentActionStateInput {
  kind: MultiAgentActionKind;
  state: MultiAgentActionState;
  receiverThreadIds?: readonly string[];
  agentIds?: readonly string[];
}

export interface MultiAgentActionHeaderInput {
  actions: readonly MultiAgentActionStateInput[];
  agentStates?: ReadonlyMap<string, MultiAgentActionState>;
  actionCount?: number;
}

export interface MultiAgentActionHeaderModel {
  kind: MultiAgentActionKind;
  state: MultiAgentActionState;
  agentIds: string[];
  count: number;
}

function aggregateState(states: readonly MultiAgentActionState[]): MultiAgentActionState {
  if (states.includes("inProgress")) return "inProgress";
  if (states.includes("failed")) return "failed";
  if (states.includes("interrupted")) return "interrupted";
  return "completed";
}

/** Compute the header model from action results and the known agent state map. */
export function computeMultiAgentActionHeader(input: MultiAgentActionHeaderInput): MultiAgentActionHeaderModel | undefined {
  const actions = input.actions;
  const kind = actions[0]?.kind;
  if (!kind) return undefined;
  const ids = new Set<string>();
  for (const action of actions) {
    for (const id of [...(action.receiverThreadIds ?? []), ...(action.agentIds ?? [])]) {
      if (id) ids.add(id);
    }
  }
  for (const id of input.agentStates?.keys() ?? []) if (id) ids.add(id);
  const states = actions.map((action) => action.state);
  for (const state of input.agentStates?.values() ?? []) states.push(state);
  return {
    kind,
    state: aggregateState(states),
    agentIds: [...ids].sort(),
    count: ids.size > 0 ? ids.size : Math.max(1, input.actionCount ?? actions.length),
  };
}

export function multiAgentActionKind(toolName: string): MultiAgentActionKind | undefined {
  const normalized = toolName.replace(/[-_]/g, "").toLowerCase();
  if (["spawnagent", "task", "taskbatch"].includes(normalized)) return "spawn";
  if (["sendinput", "sendmessage", "followuptask"].includes(normalized)) return "sendInput";
  if (normalized === "closeagent") return "close";
  if (normalized === "resumeagent") return "resume";
  if (normalized === "interruptagent") return "interrupt";
  if (["listagents", "listagent"].includes(normalized)) return "list";
  return undefined;
}
