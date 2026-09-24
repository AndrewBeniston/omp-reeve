"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import styles from "./agent-chip.module.css";

export interface AgentChipModel {
  id: string;
  name: string;
  provider: string;
}

interface AgentChipProps {
  name: string;
  role?: string;
  model?: string;
  modelList?: readonly AgentChipModel[];
}

function modelLabel(model: string, modelList: readonly AgentChipModel[] | undefined): string | undefined {
  if (!modelList) return undefined;
  const value = model.trim();
  const entry = modelList.find((candidate) => candidate.id === value || `${candidate.provider}/${candidate.id}` === value || candidate.name === value);
  return entry?.name;
}

export function AgentChip({ name, role, model, modelList }: AgentChipProps) {
  const displayName = name.replace(/^@/, "");
  const label = role && role !== "default" ? `${displayName} (${role})` : displayName;
  const chip = <span className={styles.chip} data-agent-chip>{label}</span>;
  const tooltip = model ? modelLabel(model, modelList) : undefined;
  return tooltip ? <Tooltip content={tooltip}>{chip}</Tooltip> : chip;
}
