"use client";

import { useState } from "react";
import { CircleStop, FilePenLine, FolderSearch, Globe2, List, Search, Terminal, Users, Wrench } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { activityCallGroups, activityRowContent, type ActivityRowContent, type ActivityRowState } from "./transcript-rows";
import { getResultText } from "./tool-presentation";
import { TerminalOutput } from "./TerminalOutput";
import type { ToolCallContent, ToolResultMessage } from "@/lib/types";
import type { ActivityCall } from "@/lib/transcript/repeat-collapsing";
import { selectLiveActivityHeader, type LiveActivityHeaderInput } from "@/lib/transcript/live-activity-header";
import { composeActivitySummary } from "@/lib/transcript/activity-summary";
import type { SubagentSnapshot } from "@/lib/types";
import { SubagentActivityRow, SubagentGroupSummary, visibleSubagentRows } from "./SubagentActivityRow";
import { MultiAgentActionHeader } from "./MultiAgentActionHeader";
import { MultiAgentActionRows, multiAgentActionPrompt, multiAgentAgentMessage, multiAgentPerAgentState, multiAgentPerAgentStates } from "./MultiAgentActionRow";
import { multiAgentActionIds, multiAgentActionKind, multiAgentActionState } from "@/lib/transcript/multi-agent-action-header";
import styles from "./activity-row.module.css";

interface ActivityRowProps {
  content: ActivityRowContent;
  toolName: string;
}

interface ActivityHeaderProps {
  input: LiveActivityHeaderInput;
}

const stateKey = (state: ActivityRowState) => state === "running" ? "running" : state === "interrupted" ? "interrupted" : "completed";

function rowText(content: ActivityRowContent, toolName: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const { classification, state, detail } = content;
  switch (classification.kind) {
    case "command":
      return {
        action: t(`transcript.activity.command.${stateKey(state)}`),
        detail: detail ? t(`transcript.activity.command.${stateKey(state)}.detail`, { command: detail }) : undefined,
      };
    case "read":
      return { action: t("transcript.activity.read"), detail };
    case "search":
      return detail
        ? { action: t("transcript.activity.search.query"), detail: t("transcript.activity.search.queryDetail", { query: detail }) }
        : { action: t("transcript.activity.search.files") };
    case "list":
      return detail
        ? { action: t("transcript.activity.list.generic"), detail: t("transcript.activity.list.detail", { folder: detail }) }
        : { action: t("transcript.activity.list.generic") };
    case "edit":
      return { action: t("transcript.activity.edit") };
    case "web-search":
      return detail
        ? { action: t("transcript.activity.webSearch.query"), detail: t("transcript.activity.search.queryDetail", { query: detail }) }
        : { action: t("transcript.activity.webSearch.generic") };
    case "sub-agent":
      return { action: t(`transcript.activity.subAgent.${stateKey(state) === "completed" ? "completed" : "running"}`) };
    case "connector":
      return { action: t(`transcript.activity.connector.${stateKey(state) === "completed" ? "completed" : "running"}`), detail: toolName };
    case "application-control":
      return { action: t(`transcript.activity.applicationControl.${classification.surface === "terminal" ? "terminal" : "desktop"}`) };
    case "unknown":
      return { action: t(`transcript.activity.unknown.${stateKey(state) === "completed" ? "completed" : "running"}`), detail: toolName };
  }
}

function ActivityIcon({ content }: ActivityRowProps) {
  if (content.state === "interrupted") return <CircleStop aria-hidden="true" />;
  switch (content.classification.kind) {
    case "command": return <Terminal aria-hidden="true" />;
    case "read": return <Search aria-hidden="true" />;
    case "search": return <FolderSearch aria-hidden="true" />;
    case "list": return <List aria-hidden="true" />;
    case "edit": return <FilePenLine aria-hidden="true" />;
    case "web-search": return <Globe2 aria-hidden="true" />;
    case "sub-agent": return <Users aria-hidden="true" />;
    case "connector":
    case "application-control":
    case "unknown": return <Wrench aria-hidden="true" />;
    default: return <Wrench aria-hidden="true" />;
  }
}

function firstPartyLabel(content: ActivityRowContent): boolean {
  return !["connector", "application-control", "unknown"].includes(content.classification.kind);
}

/** Render the live action or completed summary for an Activity area. */
export function ActivityHeader({ input }: ActivityHeaderProps) {
  const { locale, t } = useI18n();
  const selected = selectLiveActivityHeader(input);
  if (selected.kind === "summary") {
    const summary = composeActivitySummary({ calls: input.calls, locale, t });
    return <div className={styles.row} data-live-activity-header="summary">{summary}</div>;
  }
  if (selected.kind === "thinking") {
    return <div className={styles.row} data-live-activity-header="thinking">{t("transcript.activity.header.thinking")}</div>;
  }
  const { block, result } = selected.call;
  const content = activityRowContent(block, result);
  const text = rowText(content, block.toolName, t);
  return (
    <div className={styles.row} data-live-activity-header="activity" data-activity-kind={content.classification.kind}>
      <span className={styles.icon}><ActivityIcon content={content} toolName={block.toolName} /></span>
      <span className={styles.action}>{text.action}</span>
      {text.detail ? <span className={styles.detail} title={text.detail}>{text.detail}</span> : null}
    </div>
  );
}

export function ActivityRow({ block, result, interrupted = false, groupedCalls, subagents = [], onOpenSubagent }: { block: ToolCallContent; result?: ToolResultMessage; interrupted?: boolean; groupedCalls?: ActivityCall[]; subagents?: SubagentSnapshot[]; onOpenSubagent?: (id: string) => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const group = groupedCalls ? activityCallGroups(groupedCalls).find((candidate) => candidate.repeated) : undefined;
  const calls = group?.calls ?? [{ block, result }];
  const first = calls[0];
  const actionKind = multiAgentActionKind(first.block.toolName);
  const actionCalls = actionKind ? calls.map((call) => ({
    kind: actionKind,
    state: multiAgentActionState(call.result?.isError, Boolean(call.result), call.result?.details),
    prompt: multiAgentActionPrompt(call.block.input),
    agentState: multiAgentPerAgentState(call.block.input),
    agentMessage: multiAgentAgentMessage(call.block.input),
    perAgentStates: multiAgentPerAgentStates(call.block.input),
    ...multiAgentActionIds(call.block.input),
  })) : [];
  const content = activityRowContent(first.block, first.result, interrupted);
  const text = rowText(content, first.block.toolName, t);
  const resultText = getResultText(first.result);
  const isError = first.result?.isError ?? false;
  const isTerminalCommand = content.classification.kind === "command";
  const count = calls.length;
  const countText = t(count === 1 ? "transcript.activity.repeatedCount.one" : "transcript.activity.repeatedCount.other", { count });
  const header = firstPartyLabel(content) ? text.action : first.block.toolName;
  const subagentRows = visibleSubagentRows(subagents, first.block.toolCallId, t("transcript.activity.subAgent.defaultName"));
  const childRows = subagentRows.length > 0 ? (
    <div data-subagent-activity-group>
      {subagentRows.length === 1
        ? <SubagentActivityRow subagent={subagentRows[0]!.snapshot} displayName={subagentRows[0]!.name} onOpen={onOpenSubagent} />
        : <SubagentGroupSummary subagents={subagentRows.map(({ snapshot }) => snapshot)} fallbackName={t("transcript.activity.subAgent.defaultName")} onOpen={onOpenSubagent} />}
    </div>
  ) : null;
  const parentSubagents = subagents.filter((snapshot) => snapshot.parentToolCallId === first.block.toolCallId);
  const agentStates = new Map(parentSubagents.map((snapshot) => [snapshot.id, snapshot.status === "failed" ? "failed" as const : snapshot.status === "aborted" || (snapshot.status as string) === "cancelled" ? "interrupted" as const : snapshot.status === "completed" ? "completed" as const : "inProgress" as const]));
  const multiAgentHeader = actionKind ? <MultiAgentActionHeader input={{ actions: actionCalls, agentStates, actionCount: calls.length }} /> : null;
  const perAgentStates = new Map(actionCalls.flatMap((action) => [...(action.perAgentStates ?? [])]));
  const multiAgentRows = actionKind ? <MultiAgentActionRows actions={actionCalls} agents={subagents} perAgentStates={perAgentStates} /> : null;
  if (group) {
    return (
      <div data-activity-repeats-group>
        <button
          type="button"
          className={styles.repeatsButton}
          data-activity-repeats
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className={styles.icon}><ActivityIcon content={content} toolName={first.block.toolName} /></span>
          <span className={styles.action}>{header}</span>
          <span className={styles.detail} data-activity-count>{countText}</span>
        </button>
        {expanded ? calls.map((call) => <div data-activity-instance className={styles.repeatInstance} key={call.block.toolCallId}><ActivityRow block={call.block} result={call.result} subagents={subagents} onOpenSubagent={onOpenSubagent} /></div>) : null}
        {multiAgentHeader}
        {multiAgentRows}
        {childRows}
      </div>
    );
  }
  return (
    <div aria-label={`${first.block.toolName}, ${text.action}, ${t(`transcript.activity.state.${content.state}`)}`}>
      <div className={styles.row} data-activity-kind={content.classification.kind} data-activity-state={content.state}>
        <span className={styles.icon} data-activity-icon={content.state === "interrupted" ? "stopped" : content.classification.kind}><ActivityIcon content={content} toolName={first.block.toolName} /></span>
        <span className={styles.action} data-activity-slot="action">{text.action}</span>
        {text.detail ? <span className={styles.detail} data-activity-slot="detail" title={text.detail}>{text.detail}</span> : null}
      </div>
      {isTerminalCommand ? (
        <TerminalOutput command={text.detail ?? ""} output={resultText ?? ""} pending={!result} isError={isError} />
      ) : null}
      {multiAgentHeader}
      {multiAgentRows}
      {childRows}
    </div>
  );
}
