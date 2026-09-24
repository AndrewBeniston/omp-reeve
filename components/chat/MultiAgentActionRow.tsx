"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import type { SubagentSnapshot } from "@/lib/types";
import type { MultiAgentActionState } from "@/lib/transcript/multi-agent-action-header";
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

function rowText(action: MultiAgentPerAgentAction, agent: string, t: (key: string, params?: Record<string, string | number>) => string): { label: string; showInput: boolean } {
  const prompt = action.prompt;
  const sendInputWithPrompt = action.kind === "sendInput" && prompt !== undefined;
  const labelKey = actionKey(action, sendInputWithPrompt);
  if (agent && action.kind === "spawn" && action.state === "completed" && prompt) {
    return { label: t("transcript.multiAgentAction.row.spawn.createdWithInstructions", { agent, instructions: prompt }), showInput: false };
  }
  if (agent && action.kind === "sendInput" && prompt) {
    return { label: t("transcript.multiAgentAction.row.sendInput.messagedWithPrompt", { action: t(labelKey), agent, prompt }), showInput: false };
  }
  const actionText = t(labelKey);
  if (!agent) return { label: t("transcript.multiAgentAction.row.generic", { action: actionText }), showInput: Boolean(action.prompt) };
  return { label: t("transcript.multiAgentAction.row.agent", { action: actionText, agent, stateSuffix: stateSuffix(action, t) }), showInput: Boolean(action.prompt) };
}

export function MultiAgentActionRows({ actions, agents, perAgentStates }: {
  actions: readonly MultiAgentPerAgentAction[];
  agents?: readonly SubagentSnapshot[];
  perAgentStates?: ReadonlyMap<string, MultiAgentPerAgentState>;
}) {
  const { t } = useI18n();
  const ids = [...new Set(actions.flatMap((action) => [...(action.receiverThreadIds ?? []), ...(action.agentIds ?? [])]).filter(Boolean))].sort();
  if (ids.length === 0) {
    const action = actions[0];
    if (!action) return null;
    const content = rowText(action, "", t);
    return <MultiAgentActionRow label={content.label} input={content.showInput ? action.prompt : undefined} />;
  }
  return <>{ids.map((id) => {
    const action = actions.find((candidate) => candidate.receiverThreadIds?.includes(id) || candidate.agentIds?.includes(id)) ?? actions[0]!;
    const knownAgents = agents ?? [];
    const perAgentState = perAgentStates?.get(id);
    const rowAction = perAgentState ? { ...action, agentState: perAgentState.state, agentMessage: perAgentState.message } : action.agentState ? action : { ...action, agentState: snapshotState(id, knownAgents) };
    const content = rowText(rowAction, agentName(id, knownAgents) ?? "", t);
    return <MultiAgentActionRow key={id} label={content.label} input={content.showInput ? action.prompt : undefined} />;
  })}</>;
}

function MultiAgentActionRow({ label, input }: { label: string; input?: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.row} data-multi-agent-action-row>
      <span className={styles.icon}><UserRound aria-hidden="true" /></span>
      <span className={styles.copy}>
        <OverflowText className={styles.label} text={label} label="label" />
        {input ? <OverflowText className={styles.input} text={t("transcript.multiAgentAction.meta.prompt", { prompt: input })} label="input" /> : null}
      </span>
    </div>
  );
}

function OverflowText({ className, text, label }: { className: string; text: string; label: "label" | "input" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [title, setTitle] = useState<string>();
  useLayoutEffect(() => {
    const element = ref.current;
    setTitle(element && element.scrollWidth > element.clientWidth ? text : undefined);
  }, [text]);
  return <span ref={ref} className={className} title={title} data-multi-agent-action-text={label}>{text}</span>;
}
