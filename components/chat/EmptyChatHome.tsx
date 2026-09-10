"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { projectLabel } from "@/lib/project-selection";
import { ReeveWordmark } from "../ReeveWordmark";
import { ProjectContextBar } from "./ProjectContextBar";
import styles from "./empty-chat-home.module.css";

export function EmptyChatHome({
  composer,
  contextLabel,
  projectless,
  selectedPath,
  onProjectSelected,
  onProjectlessSelected,
  onSuggestionSelected,
}: {
  composer: ReactNode;
  contextLabel: string;
  projectless: boolean;
  selectedPath: string | null;
  onProjectSelected: (path: string) => void;
  onProjectlessSelected: () => void;
  onSuggestionSelected: (prompt: string) => void;
}) {
  const { t } = useI18n();
  const displayContextLabel = !projectless && selectedPath ? projectLabel(selectedPath) : contextLabel;

  return (
    <div className={styles.root}>
      <div className={styles.hero}>
        <div className={styles.wordmark} aria-hidden="true"><ReeveWordmark label={null} /></div>
        <h1 className={styles.title}>
          {projectless
            ? t("workspace.homeQuestion")
            : t("workspace.homeProjectQuestion", { project: displayContextLabel })}
        </h1>
        <div className={styles.suggestions}>
          {HOME_SUGGESTIONS.map((suggestion) => (
            <button
              type="button"
              className={styles.suggestion}
              key={suggestion.label}
              onClick={() => onSuggestionSelected(suggestion.prompt)}
            >
              <SuggestionIcon kind={suggestion.icon} />
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.composerArea}>
        <div className={styles.contextBar}>
          <ProjectContextBar
            contextLabel={displayContextLabel}
            projectless={projectless}
            selectedPath={selectedPath}
            onProjectSelected={onProjectSelected}
            onProjectlessSelected={onProjectlessSelected}
          />
        </div>
        <div className={styles.composer}>{composer}</div>
      </div>
    </div>
  );
}

const HOME_SUGGESTIONS = [
  { icon: "explore", label: "Explore and understand code", prompt: "Explore this workspace and explain its structure." },
  { icon: "build", label: "Build a new feature, app, or tool", prompt: "Build a useful new feature in this workspace." },
  { icon: "review", label: "Review code and suggest changes", prompt: "Review the current code and suggest specific improvements." },
  { icon: "fix", label: "Fix issues and failures", prompt: "Find and fix the most important issue in this workspace." },
] as const;

function SuggestionIcon({ kind }: { kind: (typeof HOME_SUGGESTIONS)[number]["icon"] }) {
  const path = kind === "build"
    ? <path d="m8 2 1.2 2.8L12 6 9.2 7.2 8 10 6.8 7.2 4 6l2.8-1.2z" />
    : kind === "review"
      ? <><path d="M3 6a5 5 0 0 1 8.5-2.5" /><path d="M11.5 1.8v2.4H9" /><path d="M13 8a5 5 0 0 1-8.5 2.5" /><path d="M4.5 12.2V9.8H7" /></>
      : kind === "fix"
        ? <><path d="M5 5.5h6v5H5z" /><path d="M6.5 3.5v2M9.5 3.5v2M3 7h2M11 7h2M3 9h2M11 9h2" /></>
        : <><path d="m3 3 4 4-4 4" /><path d="M8 11h4" /></>;
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
}
