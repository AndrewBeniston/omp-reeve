"use client";

import { useI18n } from "@/hooks/useI18n";
import type { AgentMessage } from "@/lib/types";
import type { TranscriptRow } from "./transcript-rows";
import styles from "./latest-turn-preview.module.css";

type TurnRow = Extract<TranscriptRow, { kind: "turn" }>;

export interface LatestTurnSummary {
  participant: "user" | "assistant";
  text: string;
  working: boolean;
}

function messageText(message: AgentMessage): string {
  if (message.role !== "user" && message.role !== "assistant") return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .flatMap((block) => block.type === "text" ? [block.text] : [])
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedText(text: string): string {
  const limit = 140;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
}

/** A compact view of the newest Turn. It never owns transcript content. */
export function latestTurnPreview(turn: TurnRow): LatestTurnSummary {
  const latest = turn.items.at(-1)?.message;
  const participant = latest?.role === "user" ? "user" : "assistant";
  return {
    participant,
    text: boundedText(latest ? messageText(latest) : ""),
    working: !turn.settled || turn.items.at(-1)?.streaming === true,
  };
}

export function LatestTurnPreview({ turn, visible, onSelect }: {
  turn: TurnRow | null;
  visible: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  if (!turn || !visible) return null;
  const summary = latestTurnPreview(turn);
  const participant = summary.participant === "assistant" ? t("session.assistant") : t("session.user");
  const state = summary.working ? t("composer.latestTurn.working") : t("composer.latestTurn.completed");
  const label = t("composer.latestTurn");

  return (
    <div className={styles.preview}>
      <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
        {label}{state ? `. ${state}` : ""}
      </div>
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        onClick={(event) => {
          event.currentTarget.blur();
          onSelect();
        }}
      >
        <span className={styles.participant}>{participant}</span>
        <span className={styles.text}>{summary.text}</span>
        <span className={styles.arrow} aria-hidden="true">↓</span>
      </button>
    </div>
  );
}
