"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sendAgentCommand } from "@/lib/agent-client";
import type { PluginPackageInfo, PluginsResponse } from "@/lib/api-types";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "./ui/Button";
import { FormField } from "./ui/FormField";
import { IconButton } from "./ui/IconButton";
import { StatusBadge } from "./ui/StatusBadge";
import { Tooltip } from "./ui/Tooltip";
import {
  normalizePluginSourceInput,
  PluginSourceField,
} from "./plugins/PluginSourceField";
import styles from "./PluginsConfig.module.css";

type PluginScope = PluginPackageInfo["scope"];
type PluginAction = "install" | "remove" | "update" | "disable" | "enable";

function shortenPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function packageKey(pkg: Pick<PluginPackageInfo, "source" | "scope">): string {
  return `${pkg.scope}\0${pkg.source}`;
}

function resourceSummary(pkg: PluginPackageInfo, t: ReturnType<typeof useI18n>["t"]): string {
  if (pkg.disabled) return t("i18n.disabled");
  const parts = [
    pkg.counts.extensions ? t("i18n.resourceCount", { count: pkg.counts.extensions, label: t("i18n.extensionShort") }) : "",
    pkg.counts.skills ? t("i18n.resourceCount", { count: pkg.counts.skills, label: t("i18n.skillShort") }) : "",
    pkg.counts.prompts ? t("i18n.resourceCount", { count: pkg.counts.prompts, label: t("i18n.promptShort") }) : "",
    pkg.counts.themes ? t("i18n.resourceCount", { count: pkg.counts.themes, label: t("i18n.themeShort") }) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("i18n.noResources");
}

function versionSummary(pkg: PluginPackageInfo, t: ReturnType<typeof useI18n>["t"]): string {
  const parts = [];
  if (pkg.version) parts.push(t("i18n.installedVersion", { version: pkg.version }));
  if (pkg.configuredVersion) parts.push(t("i18n.configuredVersion", { version: pkg.configuredVersion }));
  return parts.length ? parts.join(" · ") : t("i18n.unknown");
}

function installLocation(scope: PluginScope, cwd: string): string {
  return scope === "project"
    ? `${shortenPath(cwd)}/.omp/plugins`
    : "~/.omp/plugins";
}

function findInstalledPackage(
  packages: PluginPackageInfo[],
  source: string,
  scope: PluginScope,
): PluginPackageInfo | undefined {
  const trimmed = source.trim();
  const withoutNpmPrefix = trimmed.startsWith("npm:") ? trimmed.slice(4) : trimmed;
  return packages.find((pkg) => pkg.scope === scope && pkg.source === trimmed)
    ?? packages.find((pkg) => pkg.scope === scope && pkg.source === `npm:${withoutNpmPrefix}`)
    ?? packages.find((pkg) => pkg.scope === scope && pkg.source.endsWith(trimmed));
}

function ResourceList({ pkg }: { pkg: PluginPackageInfo }) {
  const { t } = useI18n();
  const groups = ([
    ["extension", t("i18n.extensions")],
    ["skill", t("i18n.skills")],
    ["prompt", t("i18n.prompts")],
    ["theme", t("i18n.themes")],
  ] as const)
    .map(([kind, label]) => ({
      kind,
      label,
      resources: pkg.resources.filter((resource) => resource.kind === kind),
    }))
    .filter((group) => group.resources.length > 0);

  if (groups.length === 0) {
    return (
      <div className={styles.emptyResources}>
        {pkg.disabled ? t("i18n.packageDisabled") : t("i18n.noResolvedResources")}
      </div>
    );
  }

  return (
    <div
      className={styles.resourceGroups}
    >
      {groups.map((group, groupIndex) => (
        <div
          key={group.kind}
          className={styles.resourceGroup}
          data-first={groupIndex === 0}
        >
          <div
            className={styles.resourceGroupLabel}
          >
            {group.label}
          </div>
          <div className={styles.resourceList}>
            {group.resources.map((resource) => (
              <div key={`${resource.kind}:${resource.path}`} className={styles.resourceItem}>
                <div
                  className={styles.resourceName}
                  title={resource.path}
                >
                  {resource.name}
                </div>
                <div
                  className={styles.resourcePath}
                  title={resource.path}
                >
                  {resource.relativePath}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScopeTag({ scope }: { scope: PluginScope }) {
  return (
    <StatusBadge
      tone={scope === "project" ? "info" : "neutral"}
      className={styles.scopeTag}
      data-scope={scope}
    >
      {scope}
    </StatusBadge>
  );
}

function Toggle({
  enabled,
  loading,
  onToggle,
  label,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <IconButton
      label={label}
      size="sm"
      pressed={enabled}
      onClick={onToggle}
      disabled={loading}
      data-on={enabled}
      className={styles.toggle}
    >
      <span className={styles.toggleTrack}>
        <span className={styles.toggleThumb} />
      </span>
    </IconButton>
  );
}

function SegmentedScope({
  value,
  projectResourcesLoaded,
  onChange,
}: {
  value: PluginScope;
  projectResourcesLoaded: boolean;
  onChange: (scope: PluginScope) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={styles.scopeSelector}
      role="group"
      aria-label={t("roles.scope")}
    >
      {(["global", "project"] as PluginScope[]).map((scope) => {
        const active = value === scope;
        const disabled = scope === "project" && !projectResourcesLoaded;
        return (
          <Button
            key={scope}
            tone="ghost"
            size="sm"
            onClick={() => {
              if (!disabled) onChange(scope);
            }}
            disabled={disabled}
            title={disabled ? t("trust.projectScopeUnavailable") : undefined}
            aria-pressed={active}
            data-active={active}
            className={styles.scopeButton}
          >
            {scope}
          </Button>
        );
      })}
    </div>
  );
}

function AddPluginPanel({
  cwd,
  source,
  scope,
  projectResourcesLoaded,
  busy,
  actionError,
  onSourceChange,
  onScopeChange,
  onInstall,
}: {
  cwd: string;
  source: string;
  scope: PluginScope;
  projectResourcesLoaded: boolean;
  busy: boolean;
  actionError: string | null;
  onSourceChange: (value: string) => void;
  onScopeChange: (scope: PluginScope) => void;
  onInstall: () => void;
}) {
  const { t } = useI18n();
  const examples = ["@scope/omp-plugin", "github:user/repo", "pkg[feature]"];

  return (
    <div className={styles.addPanel}>
      <div className={styles.addPanelHeader}>
        <div className={styles.addPanelTitleRow}>
          <div className={styles.addPanelTitle}>
            {t("i18n.addPlugin")}
          </div>
          <a
            href="https://github.com/can1357/oh-my-pi#plugins"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.docsLink}
          >
            <svg width="28" height="28" viewBox="0 0 800 800" aria-hidden="true" focusable="false" className={styles.docsIcon}>
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
              />
              <path fill="currentColor" d="M517.36 400H634.72V634.72H517.36Z" />
            </svg>
            oh-my-pi plugins
          </a>
        </div>
        <div className={styles.installLocation}>
          {installLocation(scope, cwd)}
        </div>
      </div>

      <FormField id="plugin-source" label="Source" className={styles.sourceField}>
        <PluginSourceField
          source={source}
          busy={busy}
          className={styles.sourceInput}
          onSourceChange={onSourceChange}
          onInstall={onInstall}
        />
      </FormField>

      <div className={styles.installActions}>
        <SegmentedScope
          value={scope}
          projectResourcesLoaded={projectResourcesLoaded}
          onChange={onScopeChange}
        />
        <Button
          tone="primary"
          size="sm"
          onClick={onInstall}
          disabled={busy || !source.trim()}
          loading={busy}
        >
          {busy ? t("i18n.installing") : t("i18n.install")}
        </Button>
      </div>

      <div className={styles.examplesSection}>
        <div className={styles.sectionLabel}>
          Examples
        </div>
        <div className={styles.exampleList}>
          {examples.map((example) => (
            <Button
              key={example}
              tone="neutral"
              size="sm"
              onClick={() => onSourceChange(example)}
              className={styles.exampleButton}
            >
              {example}
            </Button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className={styles.actionError}>
          {actionError}
        </div>
      )}
    </div>
  );
}

function PackageDetail({
  pkg,
  cwd,
  busyKey,
  actionError,
  actionMessage,
  sessionId,
  onAction,
  onReloadSession,
}: {
  pkg: PluginPackageInfo;
  cwd: string;
  busyKey: string | null;
  actionError: string | null;
  actionMessage: string | null;
  sessionId: string | null;
  onAction: (action: PluginAction, pkg: PluginPackageInfo) => void;
  onReloadSession: () => void;
}) {
  const { t } = useI18n();
  const key = packageKey(pkg);
  const busy = busyKey?.endsWith(key) ?? false;
  const reloadBusy = busyKey === "reload";
  const enabled = !pkg.disabled;

  return (
    <div className={styles.packageDetail}>
      <div className={styles.packageHeader}>
        <div className={styles.packageIdentity}>
          <Toggle
            enabled={enabled}
            loading={busy || reloadBusy}
            onToggle={() => onAction(pkg.disabled ? "enable" : "disable", pkg)}
            label={pkg.disabled ? t("i18n.enablePackage") : t("i18n.disablePackage")}
          />
          <ScopeTag scope={pkg.scope} />
          {pkg.disabled ? (
            <StatusBadge tone="neutral">
              {t("i18n.disabled")}
            </StatusBadge>
          ) : pkg.filtered && (
            <StatusBadge tone="warning">
              {t("i18n.filtered")}
            </StatusBadge>
          )}
          <span
            className={styles.packageSource}
          >
            {pkg.source}
          </span>
        </div>

        <div className={styles.packageActions}>
          <Button
            size="sm"
            onClick={() => onAction("update", pkg)}
            disabled={busy || reloadBusy}
            loading={busyKey === `update:${key}`}
          >
             {busyKey === `update:${key}` ? t("i18n.updating") : t("i18n.update")}
          </Button>
          <Button
            size="sm"
            onClick={onReloadSession}
            disabled={!sessionId || reloadBusy || busy}
            loading={reloadBusy}
             title={sessionId ? t("i18n.reloadSession") : t("i18n.openSessionToReload")}
          >
             {reloadBusy ? t("i18n.reloading") : t("i18n.reloadSession")}
          </Button>
          <Button
            tone="danger"
            size="sm"
            onClick={() => onAction("remove", pkg)}
            disabled={busy || reloadBusy}
            loading={busyKey === `remove:${key}`}
          >
             {busyKey === `remove:${key}` ? t("i18n.removing") : t("i18n.remove")}
          </Button>
        </div>
      </div>

      <div
        className={styles.metadataGrid}
      >
        <div className={styles.metadataLabel}>{t("i18n.status")}</div>
        <div>
          <StatusBadge
            tone={
              pkg.status === "loaded"
                ? "success"
                : pkg.status === "installed"
                  ? "warning"
                  : pkg.status === "disabled"
                    ? "neutral"
                    : "danger"
            }
            className={styles.packageStatus}
            data-status={pkg.status}
          >
            {pkg.status}
          </StatusBadge>
        </div>
        <div className={styles.metadataLabel}>{t("i18n.version")}</div>
         <div className={styles.metadataCode}>{versionSummary(pkg, t)}</div>
        <div className={styles.metadataLabel}>{t("i18n.package")}</div>
        <div className={styles.metadataCodeWrap}>
          {pkg.packageName ?? t("i18n.unknown")}
        </div>
        <div className={styles.metadataLabel}>{t("i18n.resources")}</div>
         <div className={styles.metadataValue}>{resourceSummary(pkg, t)}</div>
        <div className={styles.metadataLabel}>{t("i18n.installedPath")}</div>
        <div
          className={styles.installedPath}
          data-missing={!pkg.installedPath}
        >
          {pkg.installedPath ? shortenPath(pkg.installedPath) : t("i18n.notFound")}
        </div>
        <div className={styles.metadataLabel}>{t("i18n.cwd")}</div>
        <div className={styles.metadataPath}>
          {shortenPath(cwd)}
        </div>
      </div>

      <div className={styles.resourcesSection}>
        <div className={styles.sectionTitle}>
          {t("i18n.resolvedResources")}
        </div>
        <ResourceList pkg={pkg} />
      </div>

      {actionMessage && (
        <div className={styles.actionMessage}>
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className={styles.actionError}>
          {actionError}
        </div>
      )}
    </div>
  );
}

export function PluginsConfig({
  cwd,
  sessionId,
  onClose,
  onReloaded,
  embedded = false,
}: {
  cwd: string;
  sessionId: string | null;
  onClose: () => void;
  onReloaded?: () => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<PluginsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [installSource, setInstallSource] = useState("");
  const [installScope, setInstallScope] = useState<PluginScope>("global");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const packages = useMemo(() => data?.packages ?? [], [data?.packages]);
  const selectedPackage = packages.find((pkg) => packageKey(pkg) === selected) ?? null;
  const projectResourcesLoaded = data?.projectResourcesLoaded ?? true;

  const groupedPackages = useMemo(() => {
    return (["project", "global"] as PluginScope[])
      .map((scope) => ({ scope, packages: packages.filter((pkg) => pkg.scope === scope) }))
      .filter((group) => group.packages.length > 0);
  }, [packages]);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plugins?cwd=${encodeURIComponent(cwd)}`);
      const next = (await res.json()) as PluginsResponse & { error?: string };
      if (!res.ok || next.error) throw new Error(next.error ?? `HTTP ${res.status}`);
      setData(next);
      setAddMode((current) => next.packages.length === 0 || current);
      setSelected((current) => {
        if (current && next.packages.some((pkg) => packageKey(pkg) === current)) return current;
        return next.packages[0] ? packageKey(next.packages[0]) : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const runAction = useCallback(async (action: PluginAction, pkg: PluginPackageInfo) => {
    const key = packageKey(pkg);
    setBusyKey(`${action}:${key}`);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source: pkg.source, scope: pkg.scope, cwd }),
      });
      const next = (await res.json()) as PluginsResponse & { error?: string };
      if (!res.ok || next.error) throw new Error(next.error ?? `HTTP ${res.status}`);
      setData(next);
      if (action === "remove") {
        setSelected(next.packages[0] ? packageKey(next.packages[0]) : null);
        if (next.packages.length === 0) setAddMode(true);
        setActionMessage("Package removed.");
      } else {
        const messages: Record<Exclude<PluginAction, "remove">, string> = {
          install: "Package installed.",
          update: "Package updated.",
          disable: "Package disabled.",
          enable: "Package enabled.",
        };
        setActionMessage(messages[action]);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }, [cwd]);

  const installPlugin = useCallback(async () => {
    const source = normalizePluginSourceInput(installSource).trim();
    if (!source) return;
    setInstallSource(source);
    const key = `${installScope}\0${source}`;
    setBusyKey(`install:${key}`);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", source, scope: installScope, cwd }),
      });
      const next = (await res.json()) as PluginsResponse & { error?: string };
      if (!res.ok || next.error) throw new Error(next.error ?? `HTTP ${res.status}`);
      setData(next);
      const installed = findInstalledPackage(next.packages, source, installScope);
      setSelected(installed ? packageKey(installed) : key);
      setAddMode(false);
      setInstallSource("");
      setActionMessage("Package installed.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }, [cwd, installScope, installSource]);

  const reloadSession = useCallback(async () => {
    if (!sessionId) return;
    setBusyKey("reload");
    setActionError(null);
    setActionMessage(null);
    try {
      await sendAgentCommand(sessionId, { type: "reload" });
      onReloaded?.();
      await loadPlugins();
      setActionMessage("Session reloaded.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }, [loadPlugins, onReloaded, sessionId]);

  const addBusy = busyKey?.startsWith("install:") ?? false;

  return (
    <div
      className={styles.backdrop}
      data-embedded={embedded}
      onClick={(e) => {
        if (!embedded && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog} data-embedded={embedded}>
        <div
          className={styles.dialogHeader}
        >
          <div className={styles.dialogTitleRow}>
            <span className={styles.dialogTitle}>
              {t("common.plugins")}
            </span>
            <code
              className={styles.dialogPath}
            >
              {shortenPath(cwd)}
            </code>
          </div>
          <IconButton
            label={t("i18n.close")}
            size="sm"
            onClick={onClose}
          >
            ×
          </IconButton>
        </div>

        {!projectResourcesLoaded && (
          <div
            role="status"
            className={styles.projectNotice}
          >
            {t("trust.pluginsNotLoaded")}
          </div>
        )}

        <div className={styles.dialogBody}>
          <div className={styles.sidebar}>
            <div className={styles.packageList}>
              {loading ? (
                <div className={styles.loadingState}>
                  Loading...
                </div>
              ) : error ? (
                <div className={styles.listError}>
                  {error}
                </div>
              ) : packages.length === 0 ? (
                <div className={styles.emptyList}>
                  No plugins configured
                </div>
              ) : (
                groupedPackages.map((group) => (
                  <div key={group.scope} className={styles.packageGroup}>
                    <div
                      className={styles.packageGroupLabel}
                    >
                      {group.scope}
                    </div>
                    {group.packages.map((pkg) => {
                      const key = packageKey(pkg);
                      const isSelected = !addMode && selected === key;
                      return (
                        <Button
                          key={key}
                          tone="ghost"
                          size="sm"
                          fullWidth
                          className={styles.packageItem}
                          data-selected={isSelected}
                          onClick={() => {
                            setSelected(key);
                            setAddMode(false);
                            setActionError(null);
                            setActionMessage(null);
                          }}
                        >
                          <span
                            className={styles.statusDot}
                            data-status={pkg.status}
                          />
                          <span className={styles.packageSummary}>
                            <span
                              className={styles.packageName}
                              data-selected={isSelected}
                            >
                              {pkg.source}
                            </span>
                            <span
                              className={styles.resourceSummary}
                            >
                              {resourceSummary(pkg, t)}
                            </span>
                            {(pkg.version || pkg.configuredVersion) && (
                              <span
                                className={styles.versionSummary}
                              >
                                 {versionSummary(pkg, t)}
                              </span>
                            )}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className={styles.sidebarFooter}>
              <Button
                tone="ghost"
                size="sm"
                fullWidth
                className={styles.addPluginButton}
                data-active={addMode}
                onClick={() => {
                  setAddMode(true);
                  setActionError(null);
                  setActionMessage(null);
                }}
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
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                 {t("i18n.addPlugin")}
              </Button>
            </div>
          </div>

          <div className={styles.detailPanel}>
            {addMode ? (
              <AddPluginPanel
                cwd={cwd}
                source={installSource}
                scope={installScope}
                projectResourcesLoaded={projectResourcesLoaded}
                busy={addBusy}
                actionError={actionError}
                onSourceChange={setInstallSource}
                onScopeChange={setInstallScope}
                onInstall={installPlugin}
              />
            ) : loading ? null : selectedPackage ? (
              <PackageDetail
                key={packageKey(selectedPackage)}
                pkg={selectedPackage}
                cwd={cwd}
                busyKey={busyKey}
                actionError={actionError}
                actionMessage={actionMessage}
                sessionId={sessionId}
                onAction={runAction}
                onReloadSession={reloadSession}
              />
            ) : (
              <div
                className={styles.emptyDetail}
              >
                {t("i18n.selectPackage")}
              </div>
            )}
          </div>
        </div>

        <div
          className={styles.dialogFooter}
        >
          <div className={styles.footerSummary}>
            {data?.diagnostics.length ? (
              <Tooltip
                content={(
                  <span className={styles.diagnosticDetail}>
                    {data.diagnostics.map((diagnostic) => (
                      `${diagnostic.type}: ${diagnostic.source ? `${diagnostic.source}: ` : ""}${diagnostic.message}`
                    )).join("\n")}
                  </span>
                )}
              >
                <StatusBadge tone={data.diagnostics.some((diagnostic) => diagnostic.type === "error") ? "danger" : "warning"}>
                  {data.diagnostics.length} diagnostic{data.diagnostics.length === 1 ? "" : "s"}
                </StatusBadge>
              </Tooltip>
            ) : (
              <span>
                {data ? `${data.totals.extensions} ext · ${data.totals.skills} skills · ${data.totals.prompts} prompts · ${data.totals.themes} themes` : ""}
              </span>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => void loadPlugins()}
            disabled={loading || busyKey !== null}
            loading={loading}
          >
             {t("i18n.refresh")}
          </Button>
          <Button tone="ghost" size="sm" onClick={onClose}>
             {t("i18n.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
