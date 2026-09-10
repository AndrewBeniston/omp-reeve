"use client";

import { useI18n } from "@/hooks/useI18n";
import type {
  SkillInfo as Skill,
  SkillUpdateResult,
} from "@/lib/api-types";
import styles from "../SkillsConfig.module.css";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { StatusBadge } from "../ui/StatusBadge";
import { shortenPath, shortVersion, sourceLabel } from "./skill-utils";

function SkillVisibilityToggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = enabled
    ? t("i18n.visibleInPrompt")
    : t("i18n.hiddenFromPrompt");

  return (
    <IconButton
      label={label}
      size="sm"
      pressed={enabled}
      onClick={onToggle}
      disabled={loading}
      data-on={enabled}
      className={styles.visibilityToggle}
    >
      <span className={styles.toggleTrack} aria-hidden="true">
        <span className={styles.toggleThumb} />
      </span>
    </IconButton>
  );
}

export function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
  saveError,
  updateStatus,
  checkingUpdate,
  updating,
  updateError,
  onCheckUpdate,
  onUpdate,
}: {
  skill: Skill;
  cwd: string;
  onToggle: (skill: Skill) => void;
  toggling: boolean;
  saveError: string | null;
  updateStatus?: SkillUpdateResult;
  checkingUpdate: boolean;
  updating: boolean;
  updateError: string | null;
  onCheckUpdate: () => void;
  onUpdate: () => void;
}) {
  const { t } = useI18n();
  const label = sourceLabel(skill);
  const enabled = !skill.disableModelInvocation;
  const displayPath = label === "project" && skill.filePath.startsWith(cwd)
    ? `./${skill.filePath.slice(cwd.length).replace(/^[/\\]/, "")}`
    : shortenPath(skill.filePath);

  return (
    <div className={styles.detailPanel}>
      <div className={styles.visibilitySection}>
        <div className={styles.visibilityControlRow}>
          <StatusBadge
            tone={label === "project" ? "info" : "neutral"}
            className={styles.scopeTag}
            data-scope={label}
          >
            {label}
          </StatusBadge>
          <span className={styles.skillPath}>{displayPath}</span>
          <SkillVisibilityToggle
            enabled={enabled}
            loading={toggling}
            onToggle={() => onToggle(skill)}
          />
        </div>
        <div className={styles.visibilityStatusRow}>
          {!enabled && (
            <StatusBadge tone="neutral">
              {t("i18n.hiddenButInvocable")}
            </StatusBadge>
          )}
          {saveError && (
            <span role="alert" className={styles.saveError}>{saveError}</span>
          )}
        </div>
      </div>

      {skill.install?.skillsShUrl && (
        <div className={styles.metadataSection}>
          <span className={styles.metadataLabel}>Source</span>
          <a
            href={skill.install.skillsShUrl}
            target="_blank"
            rel="noreferrer"
            title={skill.install.skillsShUrl}
            className={styles.sourceLink}
          >
            <span className={styles.sourceUrl}>
              {skill.install.skillsShUrl.replace(/^https?:\/\//, "")} ↗
            </span>
          </a>
        </div>
      )}

      {skill.install && (
        <div className={styles.versionSection}>
          <span className={styles.metadataLabel}>Version</span>
          <div className={styles.versionControls}>
            <span className={styles.versionValue}>
              {shortVersion(updateStatus?.currentVersion ?? skill.install.versionHash)}
            </span>
            {skill.install.canCheckForUpdates && (
              <Button
                size="sm"
                onClick={onCheckUpdate}
                disabled={checkingUpdate || updating}
                loading={checkingUpdate}
              >
                {t("i18n.check")}
              </Button>
            )}
            {updateStatus?.state === "update-available" && (
              <StatusBadge tone="warning" className={styles.versionBadge}>
                {shortVersion(updateStatus.latestVersion)}
              </StatusBadge>
            )}
            {(checkingUpdate ||
              (updateStatus && updateStatus.state !== "update-available")) && (
              <StatusBadge
                tone={
                  checkingUpdate
                    ? "info"
                    : updateStatus?.state === "up-to-date"
                      ? "success"
                      : updateStatus?.state === "unsupported"
                        ? "neutral"
                        : "danger"
                }
                className={styles.updateState}
                data-state={checkingUpdate ? "checking" : updateStatus?.state}
              >
                {checkingUpdate
                  ? t("i18n.checking")
                  : updateStatus?.state === "up-to-date"
                    ? t("i18n.upToDate")
                    : updateStatus?.state === "unsupported"
                      ? t("i18n.automaticChecksUnavailable")
                      : updateStatus?.message || t("i18n.checkFailed")}
              </StatusBadge>
            )}
            {updateStatus?.state === "update-available" && (
              <Button
                tone="primary"
                size="sm"
                onClick={onUpdate}
                disabled={updating || checkingUpdate}
                loading={updating}
              >
                {updating ? t("i18n.updating") : t("i18n.update")}
              </Button>
            )}
          </div>
          {updateError && (
            <span role="alert" className={styles.updateError}>{updateError}</span>
          )}
        </div>
      )}

      <div className={styles.metadataSection}>
        <span className={styles.metadataLabel}>Name</span>
        <span className={styles.skillTitle}>{skill.name}</span>
      </div>

      <div className={styles.descriptionSection}>
        <span className={styles.metadataLabel}>Description</span>
        <span className={styles.skillDescription}>{skill.description}</span>
      </div>
    </div>
  );
}
