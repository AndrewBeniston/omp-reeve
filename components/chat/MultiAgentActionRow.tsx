"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useI18n } from "@/hooks/useI18n";
import type { SubagentSnapshot } from "@/lib/types";
import type { MultiAgentActionState } from "@/lib/transcript/multi-agent-action-header";
import { AgentChip, type AgentChipModel } from "./AgentChip";
import styles from "./multi-agent-action-row.module.css";

export type MultiAgentPerAgentActionState = "pendingInit" | "running" | "completed" | "errored" | "interrupted" | "shutdown" | "notFound";

export interface MultiAgentPerAgentState {
  state: MultiAgentPerAgentActionState;
  message?: string;
}

export interface MultiAgentPerAgentAction {
  kind: "spawn" | "sendInput" | "close" | "resume" | "interrupt" | "list";
  state: MultiAgentActionState;
  receiverThreadIds?: readonly string[];
  agentIds?: readonly string[];
  prompt?: string;
  agentState?: MultiAgentPerAgentActionState;
  agentMessage?: string;
  agentName?: string;
  role?: string;
  model?: string;
  perAgentStates?: ReadonlyMap<string, MultiAgentPerAgentState>;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function multiAgentActionPrompt(input: Record<string, unknown>): string | undefined {
  return text(input.prompt) ?? text(input.instructions) ?? text(input.message);
}

export function multiAgentPerAgentState(input: Record<string, unknown>): MultiAgentPerAgentActionState | undefined {
  const value = input.agentState ?? input.agent_state;
  if (value === "pendingInit" || value === "running" || value === "completed" || value === "interrupted" || value === "errored" || value === "shutdown" || value === "notFound") return value;
  return undefined;
}

export function multiAgentAgentMessage(input: Record<string, unknown>): string | undefined {
  return text(input.agentMessage) ?? text(input.agent_message);
}

export function multiAgentAgentName(input: Record<string, unknown>): string | undefined {
  return text(input.agentName) ?? text(input.agent_name);
}

export function multiAgentAgentRole(input: Record<string, unknown>): string | undefined {
  return text(input.agentRole) ?? text(input.agent_role) ?? text(input.role);
}

export function multiAgentAgentModel(input: Record<string, unknown>): string | undefined {
  const value = input.model ?? input.modelId ?? input.model_id;
  if (typeof value === "string") return text(value);
  if (value && typeof value === "object") {
    const model = value as { id?: unknown; modelId?: unknown };
    return text(model.id) ?? text(model.modelId);
  }
  return undefined;
}

export function multiAgentPerAgentStates(input: Record<string, unknown>): Map<string, MultiAgentPerAgentState> {
  const value = input.agentStates ?? input.agent_states;
  const entries = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
  const states = new Map<string, MultiAgentPerAgentState>();
  for (const [id, value] of entries) {
    const stateValue = typeof value === "object" && value !== null ? (value as { state?: unknown }).state ?? (value as { status?: unknown }).status : value;
    const state = multiAgentPerAgentState({ agentState: stateValue });
    if (!state) continue;
    const message = typeof value === "object" && value !== null ? text((value as { message?: unknown }).message) : undefined;
    states.set(id, { state, message });
  }
  return states;
}

function agentName(agentId: string, agents: readonly SubagentSnapshot[]): string | undefined {
  const agent = agents.find((candidate) => candidate.id === agentId);
  const name = agent?.agent.trim();
  return name && name !== agentId ? name : undefined;
}

function agentRole(agentId: string, agents: readonly SubagentSnapshot[]): string | undefined {
  const value = (agents.find((candidate) => candidate.id === agentId) as (SubagentSnapshot & { role?: unknown }) | undefined)?.role;
  return typeof value === "string" ? value : undefined;
}

function agentModel(agentId: string, agents: readonly SubagentSnapshot[]): string | undefined {
  const value = (agents.find((candidate) => candidate.id === agentId) as (SubagentSnapshot & { model?: unknown }) | undefined)?.model;
  return typeof value === "string" ? value : undefined;
}

function snapshotState(agentId: string, agents: readonly SubagentSnapshot[]): MultiAgentPerAgentActionState | undefined {
  const status = agents.find((candidate) => candidate.id === agentId)?.status;
  if (status === "pending") return "pendingInit";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "failed") return "errored";
  if (status === "aborted") return "interrupted";
  return undefined;
}

function actionKey(action: MultiAgentPerAgentAction, sendInputWithPrompt: boolean): string {
  if (action.state === "interrupted") return `transcript.multiAgentAction.${action.kind}.interrupted`;
  if (action.kind === "interrupt" || action.kind === "list") return `transcript.multiAgentAction.${action.kind}.${action.state}`;
  const prefix = sendInputWithPrompt ? "transcript.multiAgentAction.rowAction.sendInput.messaged" : `transcript.multiAgentAction.rowAction.${action.kind}`;
  return `${prefix}.${action.state}`;
}

function stateSuffix(action: MultiAgentPerAgentAction, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!action.agentState || action.kind === "close" || action.kind === "resume") return "";
  const state = t(`transcript.multiAgentAction.agentState.${action.agentState}`);
  return action.agentMessage ? ` (${state}: ${action.agentMessage})` : ` (${state})`;
}

const AGENT_PLACEHOLDER = "\u0000agent\u0000";

function splitAgentLabel(label: string): { before: string; after: string } {
  const index = label.indexOf(AGENT_PLACEHOLDER);
  if (index < 0) return { before: label, after: "" };
  return { before: label.slice(0, index), after: label.slice(index + AGENT_PLACEHOLDER.length) };
}

function rowText(action: MultiAgentPerAgentAction, agent: string, t: (key: string, params?: Record<string, string | number>) => string): { labelBefore: string; labelAfter: string; showInput: boolean } {
  const prompt = action.prompt;
  const sendInputWithPrompt = action.kind === "sendInput" && prompt !== undefined;
  const labelKey = actionKey(action, sendInputWithPrompt);
  if (agent && action.kind === "spawn" && action.state === "completed" && prompt) {
    const split = splitAgentLabel(t("transcript.multiAgentAction.row.spawn.createdWithInstructions", { agent: AGENT_PLACEHOLDER, instructions: prompt }));
    return { labelBefore: split.before, labelAfter: split.after, showInput: false };
  }
  if (agent && action.kind === "sendInput" && prompt) {
    const split = splitAgentLabel(t("transcript.multiAgentAction.row.sendInput.messagedWithPrompt", { action: t(labelKey), agent: AGENT_PLACEHOLDER, prompt }));
    return { labelBefore: split.before, labelAfter: split.after, showInput: false };
  }
  const actionText = t(labelKey);
  if (!agent) return { labelBefore: t("transcript.multiAgentAction.row.generic", { action: actionText }), labelAfter: "", showInput: Boolean(action.prompt) };
  const split = splitAgentLabel(t("transcript.multiAgentAction.row.agent", { action: actionText, agent: AGENT_PLACEHOLDER, stateSuffix: stateSuffix(action, t) }));
  return { labelBefore: split.before, labelAfter: split.after, showInput: Boolean(action.prompt) };
}

export function MultiAgentActionRows({ actions, agents, perAgentStates, modelList }: {
  actions: readonly MultiAgentPerAgentAction[];
  agents?: readonly SubagentSnapshot[];
  perAgentStates?: ReadonlyMap<string, MultiAgentPerAgentState>;
  modelList?: readonly AgentChipModel[];
}) {
  const { t } = useI18n();
  const ids = [...new Set(actions.flatMap((action) => [...(action.receiverThreadIds ?? []), ...(action.agentIds ?? [])]).filter(Boolean))].sort();
  if (ids.length === 0) {
    const action = actions[0];
    if (!action) return null;
    const content = rowText(action, "", t);
    return <MultiAgentActionRow labelBefore={content.labelBefore} labelAfter={content.labelAfter} input={content.showInput ? action.prompt : undefined} />;
  }
  return <>{ids.map((id) => {
    const action = actions.find((candidate) => candidate.receiverThreadIds?.includes(id) || candidate.agentIds?.includes(id)) ?? actions[0]!;
    const knownAgents = agents ?? [];
    const perAgentState = perAgentStates?.get(id);
    const rowAction = perAgentState ? { ...action, agentState: perAgentState.state, agentMessage: perAgentState.message } : action.agentState ? action : { ...action, agentState: snapshotState(id, knownAgents) };
    const content = rowText(rowAction, agentName(id, knownAgents) ?? action.agentName ?? "", t);
    return <MultiAgentActionRow
      key={id}
      labelBefore={content.labelBefore}
      labelAfter={content.labelAfter}
      agent={agentName(id, knownAgents) ?? action.agentName}
      role={action.role ?? agentRole(id, knownAgents)}
      model={action.model ?? agentModel(id, knownAgents)}
      modelList={modelList}
      input={content.showInput ? action.prompt : undefined}
    />;
  })}</>;
}

function MultiAgentActionRow({ labelBefore, labelAfter, agent, role, model, modelList, input }: { labelBefore: string; labelAfter: string; agent?: string; role?: string; model?: string; modelList?: readonly AgentChipModel[]; input?: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.row} data-multi-agent-action-row>
      <span className={styles.icon}><UserRound aria-hidden="true" /></span>
      <span className={styles.copy}>
        <span className={styles.label} data-multi-agent-action-text="label">
          <span>{labelBefore}</span>
          {agent ? <AgentChip name={agent} role={role} model={model} modelList={modelList} /> : null}
          <span>{labelAfter}</span>
        </span>
        {input ? <OverflowText className={styles.input} text={t("transcript.multiAgentAction.meta.prompt", { prompt: input })} label="input" /> : null}
      </span>
    </div>
  );
}

function OverflowText({ className, text, label }: { className: string; text: string; label: "label" | "input" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const checkOverflow = () => {
    const element = ref.current;
    setOverflowing(Boolean(element && element.scrollWidth > element.clientWidth));
  };
  useLayoutEffect(checkOverflow, [text]);
  const content = <span ref={ref} className={className} data-multi-agent-action-text={label} data-overflow={overflowing} onMouseEnter={checkOverflow} onFocusCapture={checkOverflow}>{text}</span>;
  return overflowing ? <Tooltip content={text}>{content}</Tooltip> : content;
}
