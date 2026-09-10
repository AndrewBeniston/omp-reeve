"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type {
  SkillInfo as Skill,
  SkillInstallScope,
  SkillSearchResult,
  SkillsResponse,
  SkillUpdateResult,
} from "@/lib/api-types";
import styles from "./SkillsConfig.module.css";
import { SkillDetail } from "./skills/SkillDetail";
import { SkillDiscovery } from "./skills/SkillDiscovery";
import { SkillList } from "./skills/SkillList";
import {
  shortenPath,
  skillGroupLabel,
  updateKey,
} from "./skills/skill-utils";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

const SKILL_ROUTES = {
  root: "/api/skills",
  search: "/api/skills/search",
  install: "/api/skills/install",
  check: "/api/skills/check",
  update: "/api/skills/update",
} as const;

export function SkillsConfig({
  cwd,
  onClose,
  embedded = false,
}: {
  cwd: string;
  onClose: () => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [updateStatuses, setUpdateStatuses] = useState<Record<string, SkillUpdateResult>>({});
  const [checkingUpdates, setCheckingUpdates] = useState<Set<string>>(new Set());
  const [checkingAll, setCheckingAll] = useState(false);
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [projectResourcesLoaded, setProjectResourcesLoaded] = useState(true);
  const [dormantGroupsOpen, setDormantGroupsOpen] = useState<Record<string, boolean>>({});

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${SKILL_ROUTES.root}?cwd=${encodeURIComponent(cwd)}`);
      const data = (await response.json()) as Partial<SkillsResponse> & { error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      const loadedSkills = data.skills ?? [];
      setSkills(loadedSkills);
      setProjectResourcesLoaded(data.projectResourcesLoaded ?? true);
      if (loadedSkills.length > 0 && !selected) {
        const initialSkill = loadedSkills.find(
          (skill) => !skill.disableModelInvocation,
        ) ?? loadedSkills[0];
        setSelected(initialSkill.filePath);
        if (initialSkill.disableModelInvocation) {
          setDormantGroupsOpen((current) => ({
            ...current,
            [skillGroupLabel(initialSkill)]: true,
          }));
        }
      }
      return loadedSkills;
    } catch (loadError) {
      setError(String(loadError));
      return [];
    } finally {
      setLoading(false);
    }
  }, [cwd, selected]);

  useEffect(() => {
    setUpdateStatuses({});
    setUpdateError(null);
    void loadSkills();
  }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchSkills = useCallback(async (query: string): Promise<SkillSearchResult[]> => {
    const response = await fetch(SKILL_ROUTES.search, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = (await response.json()) as {
      results?: SkillSearchResult[];
      error?: string;
    };
    if (!response.ok || data.error) {
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    return data.results ?? [];
  }, []);

  const installSkill = useCallback(async (
    packageName: string,
    scope: SkillInstallScope,
  ): Promise<void> => {
    const response = await fetch(SKILL_ROUTES.install, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ package: packageName, scope, cwd }),
    });
    const data = (await response.json()) as { success?: boolean; error?: string };
    if (!response.ok || data.error) {
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
  }, [cwd]);

  const checkForUpdates = useCallback(async (skill?: Skill) => {
    const targets = skill
      ? [skill]
      : skills.filter((item) => Boolean(item.install));
    const keys = targets
      .map(updateKey)
      .filter((key): key is string => Boolean(key));
    if (keys.length === 0) return;

    setUpdateError(null);
    setCheckingUpdates((current) => new Set([...current, ...keys]));
    if (!skill) setCheckingAll(true);
    try {
      const response = await fetch(SKILL_ROUTES.check, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          package: skill?.install?.package,
          scope: skill?.install?.scope,
        }),
      });
      const data = (await response.json()) as {
        updates?: SkillUpdateResult[];
        error?: string;
      };
      if (!response.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      setUpdateStatuses((current) => {
        const next = { ...current };
        for (const update of data.updates ?? []) {
          next[`${update.scope}\0${update.package}`] = update;
        }
        return next;
      });
    } catch (checkError) {
      setUpdateError(checkError instanceof Error ? checkError.message : String(checkError));
    } finally {
      setCheckingUpdates((current) => {
        const next = new Set(current);
        for (const key of keys) next.delete(key);
        return next;
      });
      if (!skill) setCheckingAll(false);
    }
  }, [cwd, skills]);

  const updateInstalledSkill = useCallback(async (skill: Skill) => {
    if (!skill.install) return;
    const key = updateKey(skill)!;
    setUpdatingSkill(key);
    setUpdateError(null);
    try {
      const response = await fetch(SKILL_ROUTES.update, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cwd,
          package: skill.install.package,
          scope: skill.install.scope,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        skill?: Skill;
        error?: string;
      };
      if (!response.ok || data.error || !data.success) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      await loadSkills();
      const versionHash = data.skill?.install?.versionHash;
      setUpdateStatuses((current) => ({
        ...current,
        [key]: {
          package: skill.install!.package,
          scope: skill.install!.scope,
          state: "up-to-date",
          currentVersion: versionHash,
          latestVersion: versionHash,
        },
      }));
    } catch (updateFailure) {
      setUpdateError(updateFailure instanceof Error
        ? updateFailure.message
        : String(updateFailure));
    } finally {
      setUpdatingSkill(null);
    }
  }, [cwd, loadSkills]);

  const toggle = useCallback(async (skill: Skill) => {
    const next = !skill.disableModelInvocation;
    setToggling((current) => new Set(current).add(skill.filePath));
    setSaveError(null);
    try {
      const response = await fetch(SKILL_ROUTES.root, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: skill.filePath,
          disableModelInvocation: next,
        }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || data.error) {
        setSaveError(data.error ?? `HTTP ${response.status}`);
        return;
      }
      setSkills((current) => current.map((item) =>
        item.filePath === skill.filePath
          ? { ...item, disableModelInvocation: next }
          : item,
      ));
      if (next) {
        setDormantGroupsOpen((current) => ({
          ...current,
          [skillGroupLabel(skill)]: true,
        }));
      }
    } catch (toggleError) {
      setSaveError(String(toggleError));
    } finally {
      setToggling((current) => {
        const nextToggling = new Set(current);
        nextToggling.delete(skill.filePath);
        return nextToggling;
      });
    }
  }, []);

  const selectedSkill = skills.find((skill) => skill.filePath === selected) ?? null;
  const updateCount = Object.values(updateStatuses).filter(
    (status) => status.state === "update-available",
  ).length;

  return (
    <div
      className={styles.backdrop}
      data-embedded={embedded}
      onClick={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} data-embedded={embedded}>
        <div className={styles.dialogHeader}>
          <div className={styles.dialogHeading}>
            <span className={styles.dialogTitle}>{t("common.skills")}</span>
            <code className={styles.dialogPath}>{shortenPath(cwd)}</code>
          </div>
          <IconButton label={t("i18n.close")} size="sm" onClick={onClose}>
            ×
          </IconButton>
        </div>

        {!projectResourcesLoaded && (
          <div role="status" className={styles.projectWarning}>
            {t("trust.skillsNotLoaded")}
          </div>
        )}

        <div className={styles.dialogBody}>
          <SkillList
            skills={skills}
            loading={loading}
            error={error}
            selected={selected}
            addMode={addMode}
            updateStatuses={updateStatuses}
            dormantGroupsOpen={dormantGroupsOpen}
            onSelect={(skill) => {
              setSelected(skill.filePath);
              setAddMode(false);
            }}
            onAdd={() => setAddMode(true)}
            onToggleDormantGroup={(label) => {
              setDormantGroupsOpen((current) => ({
                ...current,
                [label]: !(current[label] ?? false),
              }));
            }}
          />

          <div className={styles.contentPanel}>
            {addMode ? (
              <SkillDiscovery
                cwd={cwd}
                projectResourcesLoaded={projectResourcesLoaded}
                installedPackages={{
                  global: new Set(
                    skills
                      .filter((skill) => skill.install?.scope === "global")
                      .map((skill) => skill.install!.package),
                  ),
                  project: new Set(
                    skills
                      .filter((skill) => skill.install?.scope === "project")
                      .map((skill) => skill.install!.package),
                  ),
                }}
                onSearch={searchSkills}
                onInstall={installSkill}
                onInstalled={() => void loadSkills()}
              />
            ) : loading ? null : selectedSkill ? (
              <SkillDetail
                key={selectedSkill.filePath}
                skill={selectedSkill}
                cwd={cwd}
                onToggle={toggle}
                toggling={toggling.has(selectedSkill.filePath)}
                saveError={saveError}
                updateStatus={
                  updateKey(selectedSkill)
                    ? updateStatuses[updateKey(selectedSkill)!]
                    : undefined
                }
                checkingUpdate={
                  updateKey(selectedSkill)
                    ? checkingUpdates.has(updateKey(selectedSkill)!)
                    : false
                }
                updating={updatingSkill === updateKey(selectedSkill)}
                updateError={updateError}
                onCheckUpdate={() => void checkForUpdates(selectedSkill)}
                onUpdate={() => void updateInstalledSkill(selectedSkill)}
              />
            ) : (
              <div className={styles.selectSkillPrompt}>{t("i18n.selectSkill")}</div>
            )}
          </div>
        </div>

        <div className={styles.dialogFooter}>
          <div className={styles.updateSummary}>
            {skills.some((skill) => Boolean(skill.install)) && (
              <Button
                size="sm"
                onClick={() => void checkForUpdates()}
                disabled={checkingAll || updatingSkill !== null}
                loading={checkingAll}
              >
                {checkingAll ? t("i18n.checking") : t("i18n.checkUpdates")}
              </Button>
            )}
            {updateCount > 0 && (
              <span className={styles.updateCount}>
                {updateCount}{" "}
                {updateCount === 1 ? t("i18n.update") : t("i18n.updates")}
              </span>
            )}
          </div>
          <Button tone="ghost" size="sm" onClick={onClose}>
            {t("i18n.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
