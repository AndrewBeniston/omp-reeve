"use client";

import { CircleStop, FilePenLine, FolderSearch, Globe2, List, Search, Terminal, Users, Wrench } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { activityRowContent, type ActivityRowContent, type ActivityRowState } from "./transcript-rows";
import { getResultText } from "./tool-presentation";
import { TerminalOutput } from "./TerminalOutput";
import type { ToolCallContent, ToolResultMessage } from "@/lib/types";
import styles from "./activity-row.module.css";

interface ActivityRowProps {
  content: ActivityRowContent;
  toolName: string;
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

export function ActivityRow({ block, result, interrupted = false }: { block: ToolCallContent; result?: ToolResultMessage; interrupted?: boolean }) {
  const { t } = useI18n();
  const content = activityRowContent(block, result, interrupted);
  const text = rowText(content, block.toolName, t);
  const resultText = getResultText(result);
  const isError = result?.isError ?? false;
  const isTerminalCommand = content.classification.kind === "command";
  return (
    <div aria-label={`${block.toolName}, ${text.action}, ${t(`transcript.activity.state.${content.state}`)}`}>
      <div className={styles.row} data-activity-kind={content.classification.kind} data-activity-state={content.state}>
        <span className={styles.icon} data-activity-icon={content.state === "interrupted" ? "stopped" : content.classification.kind}><ActivityIcon content={content} toolName={block.toolName} /></span>
        <span className={styles.action} data-activity-slot="action">{text.action}</span>
        {text.detail ? <span className={styles.detail} data-activity-slot="detail" title={text.detail}>{text.detail}</span> : null}
      </div>
      {isTerminalCommand ? (
        <TerminalOutput command={text.detail ?? ""} output={resultText ?? ""} pending={!result} isError={isError} />
      ) : null}
    </div>
  );
}
