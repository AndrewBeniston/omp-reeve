"use client";

import { useI18n } from "@/hooks/useI18n";
import type {
  SkillInfo as Skill,
  SkillUpdateResult,
} from "@/lib/api-types";
import styles from "../SkillsConfig.module.css";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { skillGroupLabel, updateKey } from "./skill-utils";

interface SkillGroup {
  label: string;
  skills: Skill[];
}

function groupSkills(skills: Skill[]): SkillGroup[] {
  const labels = [
    "project / skills.sh",
    "project",
    "global / skills.sh",
    "global",
    "path",
  ];

  return labels.flatMap((label) => {
    const groupedSkills = skills.filter((skill) => skillGroupLabel(skill) === label);
    return groupedSkills.length > 0 ? [{ label, skills: groupedSkills }] : [];
  });
}

export function SkillList({
  skills,
  loading,
  error,
  selected,
  addMode,
  updateStatuses,
  dormantGroupsOpen,
  onSelect,
  onAdd,
  onToggleDormantGroup,
}: {
  skills: Skill[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  addMode: boolean;
  updateStatuses: Record<string, SkillUpdateResult>;
  dormantGroupsOpen: Record<string, boolean>;
  onSelect: (skill: Skill) => void;
  onAdd: () => void;
  onToggleDormantGroup: (label: string) => void;
}) {
  const { t } = useI18n();

  function renderSkillRow(skill: Skill) {
    const isSelected = !addMode && selected === skill.filePath;
    const disabled = skill.disableModelInvocation;
    const key = updateKey(skill);
    const updateAvailable = key && updateStatuses[key]?.state === "update-available";

    return (
      <Button
        key={skill.filePath}
        tone="ghost"
        size="sm"
        fullWidth
        className={styles.skillRow}
        data-selected={isSelected}
        onClick={() => onSelect(skill)}
      >
        <span className={styles.skillStatus} data-disabled={disabled} />
        <span
          className={styles.skillName}
          data-disabled={disabled}
          data-selected={isSelected}
        >
          {skill.name}
        </span>
        {updateAvailable && (
          <StatusBadge
            tone="warning"
            title={t("i18n.updateAvailable")}
            className={styles.updateAvailableBadge}
          >
            ↑
          </StatusBadge>
        )}
      </Button>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.skillList}>
        {loading ? (
          <div role="status" className={styles.skillListLoading}>
            {t("i18n.loading")}
          </div>
        ) : error ? (
          <div role="alert" className={styles.skillListError}>{error}</div>
        ) : skills.length === 0 ? (
          <div className={styles.skillListEmpty}>{t("i18n.noSkills")}</div>
        ) : (
          groupSkills(skills).map(({ label, skills: groupedSkills }) => {
            const activeSkills = groupedSkills.filter(
              (skill) => !skill.disableModelInvocation,
            );
            const dormantSkills = groupedSkills.filter(
              (skill) => skill.disableModelInvocation,
            );
            const dormantOpen = dormantGroupsOpen[label] ?? false;

            return (
              <div key={label} className={styles.skillGroup}>
                <div className={styles.skillGroupLabel}>{label}</div>
                {activeSkills.map(renderSkillRow)}
                {dormantSkills.length > 0 && (
                  <>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() => onToggleDormantGroup(label)}
                      aria-expanded={dormantOpen}
                      className={styles.dormantButton}
                    >
                      <span className={styles.dormantMarker} aria-hidden="true">
                        {dormantOpen ? "▾" : "▸"}
                      </span>
                      {t("i18n.dormant")} ({dormantSkills.length})
                    </Button>
                    {dormantOpen && dormantSkills.map(renderSkillRow)}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className={styles.addSkillArea}>
        <Button
          tone="ghost"
          size="sm"
          fullWidth
          className={styles.addSkillButton}
          data-active={addMode}
          onClick={onAdd}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t("i18n.addSkill")}
        </Button>
      </div>
    </div>
  );
}
