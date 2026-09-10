"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ModelRoleAssignment, ModelRoleScope } from "@/lib/api-types";
import {
  formatModelRoleSelector,
  getModelRoleThinkingLevel,
  getModelRoleThinkingOptions,
  type ModelRoleThinkingLevel,
} from "@/lib/model-role-selection";
import { useI18n } from "@/hooks/useI18n";
import { SearchableSelect } from "./SearchableSelect";
import { resolveRoleModelChange } from "./models/role-selector-change";
import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";
import { Tooltip } from "./ui/Tooltip";
import styles from "./ModelRolesPanel.module.css";

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
}

interface ModelsResponse {
  modelList?: ModelEntry[];
  thinkingLevels?: Record<string, string[]>;
}

interface Props {
  /** Working directory the roles are resolved against (project layer + model scope). */
  cwd: string | null;
  /** Notifies the shell that a role changed so open sessions refresh their picker. */
  onRolesChanged?: () => void;
}

const SCOPES: ModelRoleScope[] = ["global", "project"];

function selectorFor(model: ModelEntry): string {
  return `${model.provider}/${model.id}`;
}

/**
 * Assign a model to each of omp's roles.
 *
 * omp routes work by role rather than by "the current model": `default` runs
 * ordinary turns, `smol` runs cheap subagent work, `slow` runs deep reasoning,
 * `plan` drives plan mode, `commit` writes changelogs. This panel writes the
 * same `modelRoles` record `omp`'s `/model` selector writes, so an assignment
 * made here is what the next terminal session uses too.
 */
export function ModelRolesPanel({ cwd, onRolesChanged }: Props) {
  const { t } = useI18n();
  const [roles, setRoles] = useState<ModelRoleAssignment[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [thinkingLevels, setThinkingLevels] = useState<Record<string, string[]>>({});
  const [scope, setScope] = useState<ModelRoleScope>("global");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!cwd) {
      setRoles([]);
      setModels([]);
      setThinkingLevels({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = `?cwd=${encodeURIComponent(cwd)}`;
      const [rolesRes, modelsRes] = await Promise.all([
        fetch(`/api/model-roles${query}`, signal ? { signal } : undefined),
        fetch(`/api/models${query}`, signal ? { signal } : undefined),
      ]);
      if (!rolesRes.ok) throw new Error(`HTTP ${rolesRes.status}`);
      const rolesData = await rolesRes.json() as { roles?: ModelRoleAssignment[]; error?: string };
      if (rolesData.error) throw new Error(rolesData.error);
      if (!modelsRes.ok) throw new Error(`HTTP ${modelsRes.status}`);
      const modelsData = await modelsRes.json() as ModelsResponse;
      setRoles(rolesData.roles ?? []);
      setModels(modelsData.modelList ?? []);
      setThinkingLevels(modelsData.thinkingLevels ?? {});
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const assign = useCallback(async (role: string, selector: string | null) => {
    if (!cwd) return;
    setPendingRole(role);
    setError(null);
    try {
      const res = await fetch("/api/model-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, role, selector, scope }),
      });
      const data = await res.json() as { roles?: ModelRoleAssignment[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRoles(data.roles ?? []);
      onRolesChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingRole(null);
    }
  }, [cwd, scope, onRolesChanged]);

  const visibleRoles = useMemo(() => roles.filter((role) => !role.hidden), [roles]);

  if (!cwd) {
    return <div className={styles.emptyNotice}>{t("roles.needsProject")}</div>;
  }

  return (
    <div className={styles.panel}>
      <div>
        <div className={styles.title}>
          {t("roles.title")}
        </div>
        <div className={styles.description}>
          {t("roles.description")}
        </div>
      </div>

      <div className={styles.scopeRow}>
        <span className={styles.scopeLabel}>{t("roles.scope")}</span>
        <div className={styles.scopeToggleGroup} role="group" aria-label={t("roles.scope")}>
          {SCOPES.map((option) => (
            <Button
              key={option}
              tone="ghost"
              size="sm"
              onClick={() => setScope(option)}
              aria-pressed={scope === option}
              data-active={scope === option}
              className={styles.scopeButton}
            >
              {option === "global" ? t("roles.scopeGlobal") : t("roles.scopeProject")}
            </Button>
          ))}
        </div>
        <span className={styles.scopePath}>
          {scope === "global" ? "~/.omp/agent/config.yml" : ".omp/config.yml"}
        </span>
      </div>

      {error && (
        <div className={styles.error} role="alert">{error}</div>
      )}

      {loading ? (
        <div className={styles.loading}>{t("i18n.loading")}</div>
      ) : (
        <div className={styles.rolesList}>
          {visibleRoles.map((role) => {
            const current = role.resolved ? `${role.resolved.provider}/${role.resolved.modelId}` : "";
            const currentThinkingLevel = getModelRoleThinkingLevel(role.selector);
            const thinkingKey = role.resolved ? `${role.resolved.provider}:${role.resolved.modelId}` : "";
            const thinkingOptions = getModelRoleThinkingOptions(thinkingLevels[thinkingKey]);
            return (
              <Surface
                key={role.role}
                tone="sidebar"
                border="default"
                radius="md"
                padding="sm"
                className={styles.roleCard}
              >
                <div className={styles.roleMainRow}>
                  <div className={styles.roleIdentity}>
                    <span className={styles.roleTag}>{role.tag ?? role.role.toUpperCase()}</span>
                    <div className={styles.roleInfo}>
                      <div className={styles.roleName}>{role.name}</div>
                      <div className={styles.roleSource}>
                        {t(`roles.source.${role.source}`)}
                      </div>
                    </div>
                  </div>

                  <SearchableSelect
                    value={current}
                    disabled={pendingRole === role.role}
                    ariaLabel={role.name}
                    className={styles.modelSelect}
                    onChange={(value) => {
                      const selectedModel = models.find((model) => selectorFor(model) === value);
                      void assign(role.role, resolveRoleModelChange({
                        value,
                        currentSelector: role.selector,
                        supportedLevels: selectedModel
                          ? thinkingLevels[`${selectedModel.provider}:${selectedModel.id}`]
                          : undefined,
                      }));
                    }}
                    options={[
                      { value: "", label: t("roles.unset") },
                      ...models.map((model) => ({
                        value: selectorFor(model),
                        label: `${model.name} — ${model.provider}`,
                        searchText: selectorFor(model),
                      })),
                      ...current && !models.some((model) => selectorFor(model) === current)
                        ? [{ value: current, label: current }]
                        : [],
                    ]}
                  />

                  {role.warning && (
                    <Tooltip content={role.warning}>
                      <StatusBadge tone="warning" className={styles.roleWarning} aria-label={role.warning}>!</StatusBadge>
                    </Tooltip>
                  )}
                </div>

                {role.resolved && (
                  <div className={styles.thinkingRow}>
                    <span className={styles.thinkingLabel}>
                      {t("roles.thinking")}
                    </span>
                    <div
                      role="group"
                      aria-label={`${role.name} ${t("roles.thinking")}`}
                      className={styles.thinkingGroup}
                    >
                      {thinkingOptions.map((level: ModelRoleThinkingLevel) => {
                        const active = currentThinkingLevel === level;
                        return (
                          <Button
                            key={level}
                            tone="ghost"
                            size="sm"
                            aria-pressed={active}
                            data-active={active}
                            disabled={pendingRole === role.role}
                            title={level === "inherit" ? t("roles.thinkingInherit") : level}
                            onClick={() => {
                              if (active) return;
                              void assign(role.role, formatModelRoleSelector(current, level));
                            }}
                            className={styles.thinkingButton}
                          >
                            {level}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
