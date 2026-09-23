"use client";

import { Users } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { computeMultiAgentActionHeader, type MultiAgentActionHeaderInput } from "@/lib/transcript/multi-agent-action-header";
import styles from "./multi-agent-action-header.module.css";

export function MultiAgentActionHeader({ input }: { input: MultiAgentActionHeaderInput }) {
  const { t } = useI18n();
  const model = computeMultiAgentActionHeader(input);
  if (!model) return null;
  const key = `transcript.multiAgentAction.${model.kind}.${model.state}`;
  return (
    <div className={styles.row} data-multi-agent-action-header data-action-kind={model.kind} data-action-state={model.state}>
      <span className={styles.icon}><Users aria-hidden="true" /></span>
      <span className={styles.action}>{t(key)}{t(model.count === 1 ? "transcript.multiAgentAction.count.one" : "transcript.multiAgentAction.count.other", { count: model.count })}</span>
    </div>
  );
}
