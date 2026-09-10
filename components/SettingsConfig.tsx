"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { PluginsConfig } from "./PluginsConfig";
import { AccessConfig } from "./AccessConfig";
import { SearchableSelect } from "./SearchableSelect";
import { ThemePreview } from "./settings/ThemePreview";
import { ArchivedChatsSettings } from "./settings/ArchivedChatsSettings";
import { SettingsIcon } from "./settings/SettingsIcon";
import { AboutConfig } from "./AboutConfig";
import { SettingsSearchResults, type SettingsSearchResultsHandle } from "./settings/SettingsSearchResults";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { FormField } from "./ui/FormField";
import { IconButton } from "./ui/IconButton";
import { Tabs } from "./ui/Tabs";
import { DynamicStyleVars } from "./ui/DynamicStyleVars";
import { useI18n } from "@/hooks/useI18n";
import { refreshOmpTheme, useTheme } from "@/hooks/useTheme";
import { sendAgentCommand } from "@/lib/agent-client";
import { buildSettingsNavigation } from "@/lib/settings-navigation";
import { buildSettingsSearchResults, type SettingsSearchResult } from "@/lib/settings-search";
import { getPanelWidthCssValue, SIDEBAR_DEFAULT_WIDTH } from "@/lib/panel-layout";
import { cx } from "@/lib/ui";
import type {
  McpConfigResponse,
  McpScopeConfig,
  McpServerConfig,
  McpServerEntry,
  BrowserSettingPath,
  SettingsField,
  SettingsResponse,
  SettingsValue,
} from "@/lib/settings-api";
import { COMPLETION_SOUND_SETTING_PATH } from "@/lib/settings-api";
import styles from "./SettingsConfig.module.css";

type SettingsSection = "models" | "themes" | "skills" | "plugins" | "mcp" | "access" | "archived" | "about" | `settings:${string}`;

interface SettingsConfigProps {
  cwd?: string | null;
  sessionId: string | null;
  sidebarWidth: number;
  initialSection?: SettingsSection;
  onClose: () => void;
  onModelsChanged?: () => void;
  onReloaded?: () => void;
  onArchivedSessionsChanged?: () => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

interface BrowserSettingAdapter {
  read: () => SettingsValue;
  write: (value: SettingsValue) => void;
}

const CORE_SECTIONS: Array<{ id: SettingsSection; label: string; icon: string; requiresCwd?: boolean }> = [
  { id: "models", label: "Models", icon: "model" },
  { id: "themes", label: "Themes", icon: "theme" },
  { id: "skills", label: "Skills", icon: "skill", requiresCwd: true },
  { id: "plugins", label: "Plugins", icon: "plugin", requiresCwd: true },
  { id: "mcp", label: "MCP", icon: "mcp" },
  { id: "access", label: "Access", icon: "access" },
  { id: "archived", label: "Archived chats", icon: "archive" },
  { id: "about", label: "About", icon: "about" },
];

function conditionVisible(field: SettingsField, values: Map<string, SettingsValue>): boolean {
  switch (field.condition) {
    case undefined: return true;
    case "hasImageProtocol": return false;
    case "advisorEnabled": return values.get("advisor.enabled") === true;
    case "hindsightActive": return values.get("memory.backend") === "hindsight";
    case "mnemopiActive": return values.get("memory.backend") === "mnemopi";
    case "autolearnActive": return values.get("autolearn.enabled") === true;
    case "autoThinkingActive": return values.get("defaultThinkingLevel") === "auto";
    case "usageAwareFallbackEnabled": return values.get("retry.usageAwareFallback") === true;
    case "planModeEnabled": return values.get("plan.enabled") === true;
    case "unexpectedStopDetection": return values.get("features.unexpectedStopDetection") === true;
    default: return true;
  }
}

interface SettingControlSharedProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
  className?: string;
}

interface SettingControlProps extends SettingControlSharedProps {
  field: SettingsField;
  busy: boolean;
  onSave: (value: SettingsValue) => void;
}

function TextSetting({ field, busy, onSave, className, ...controlProps }: SettingControlProps) {
  const [value, setValue] = useState(field.type === "secret" ? "" : String(field.value ?? ""));
  useEffect(() => {
    setValue(field.type === "secret" ? "" : String(field.value ?? ""));
  }, [field.path, field.type, field.value]);
  const persisted = field.type === "secret" ? "" : String(field.value ?? "");
  return (
    <input
      {...controlProps}
      className={cx(styles.textInput, className)}
      type={field.type === "secret" ? "password" : "text"}
      value={value}
      disabled={busy}
      placeholder={field.type === "secret" && field.configured ? "Configured — enter to replace" : undefined}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => { if (value !== persisted && (field.type !== "secret" || value.length > 0)) onSave(value); }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );
}

function ProviderLimitsSetting({ field, busy, onSave, className, ...controlProps }: SettingControlProps) {
  const serialized = JSON.stringify(field.value ?? {}, null, 2);
  const [value, setValue] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  const parseErrorId = controlProps.id ? `${controlProps.id}-parse-error` : undefined;
  const describedBy = [controlProps["aria-describedby"], error ? parseErrorId : null].filter(Boolean).join(" ") || undefined;
  useEffect(() => { setValue(serialized); setError(null); }, [serialized]);
  return (
    <div className={cx(styles.providerLimitsWrap, className)}>
      <textarea
        {...controlProps}
        className={styles.providerLimitsEditor}
        aria-describedby={describedBy}
        aria-invalid={error ? true : controlProps["aria-invalid"]}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value === serialized) return;
          try {
            onSave(JSON.parse(value) as Record<string, number>);
            setError(null);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
      />
      {error && <div id={parseErrorId} role="alert" className={styles.error}>{error}</div>}
    </div>
  );
}

function MultiSelectSetting({ field, busy, onSave, className, ...controlProps }: SettingControlProps) {
  const selected = Array.isArray(field.value) ? field.value : [];
  const toggle = (value: string) => onSave(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onSave(next);
  };
  return (
    <div {...controlProps} role="group" className={cx(styles.multiSelect, className)}>
      {field.options?.map((option) => {
        const index = selected.indexOf(option.value);
        return (
          <span key={option.value} className={styles.choice} data-selected={index >= 0} title={option.description}>
            <Button size="sm" tone="ghost" className={styles.choiceToggle} disabled={busy} onClick={() => toggle(option.value)}>{option.label}</Button>
            {field.ordered && index >= 0 && (
              <span className={styles.reorder}>
                <IconButton label={`Move ${option.label} earlier`} size="sm" disabled={busy || index === 0} onClick={() => move(index, -1)}>←</IconButton>
                <IconButton label={`Move ${option.label} later`} size="sm" disabled={busy || index === selected.length - 1} onClick={() => move(index, 1)}>→</IconButton>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function SettingControl({ field, busy, onSave, id, className, ...ariaProps }: SettingControlProps) {
  const controlProps: SettingControlSharedProps = { id, className, ...ariaProps };
  if (field.type === "boolean") {
    return (
      <IconButton
        id={id}
        label={field.label}
        className={cx(styles.switch, className)}
        disabled={busy}
        pressed={field.value === true}
        data-on={field.value === true}
        {...ariaProps}
        onClick={() => onSave(field.value !== true)}
      >
        <span aria-hidden="true" />
      </IconButton>
    );
  }
  if (field.type === "select") {
    return <SearchableSelect {...controlProps} value={String(field.value ?? "")} disabled={busy} options={(field.options ?? []).map((option) => ({ value: option.value, label: option.label, description: option.description }))} onChange={(value) => onSave(typeof field.value === "number" || typeof field.defaultValue === "number" ? Number(value) : value)} />;
  }
  if (field.type === "multiselect") return <MultiSelectSetting field={field} busy={busy} onSave={onSave} {...controlProps} />;
  if (field.type === "providerLimits") return <ProviderLimitsSetting field={field} busy={busy} onSave={onSave} {...controlProps} />;
  return <TextSetting field={field} busy={busy} onSave={onSave} {...controlProps} />;
}

function settingFieldId(path: string): string {
  return `setting-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function SettingRow({ field, busy, error, onSave }: { field: SettingsField; busy: boolean; error?: string; onSave: (value: SettingsValue) => void }) {
  return (
    <FormField
      id={settingFieldId(field.path)}
      label={field.label}
      description={field.description}
      error={error}
      labelMode="aria-labelledby"
      className={styles.settingRow}
    >
      <SettingControl className={styles.settingControl} field={field} busy={busy} onSave={onSave} />
    </FormField>
  );
}

export function SettingsConfig({ cwd, sessionId, sidebarWidth = SIDEBAR_DEFAULT_WIDTH, initialSection = "settings:interaction", onClose, onModelsChanged, onReloaded, onArchivedSessionsChanged, soundEnabled, onSoundToggle }: SettingsConfigProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [needsReload, setNeedsReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [requestedFieldPath, setRequestedFieldPath] = useState<string | null>(null);
  const { preference, theme, toggleTheme } = useTheme();
  const { locale, setLocale, supportedLocales, t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<SettingsSearchResultsHandle>(null);
  const browserSettingAdapters = useMemo<Record<BrowserSettingPath, BrowserSettingAdapter>>(() => ({
    [COMPLETION_SOUND_SETTING_PATH]: {
      read: () => soundEnabled,
      write: (value) => {
        if (value !== soundEnabled) onSoundToggle();
      },
    },
  }), [onSoundToggle, soundEnabled]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const suffix = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
      const response = await fetch(`/api/settings${suffix}`, { cache: "no-store" });
      const data = await response.json() as SettingsResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setSettings(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const saveSetting = useCallback(async (field: SettingsField, value: SettingsValue) => {
    if (field.owner === "browser") {
      browserSettingAdapters[field.path as BrowserSettingPath]?.write(value);
      return;
    }
    setSaving((current) => new Set(current).add(field.path));
    setSaveErrors((current) => { const next = { ...current }; delete next[field.path]; return next; });
    try {
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: field.path, value }) });
      const result = await response.json() as { value?: SettingsValue; error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`);
      setSettings((current) => current ? { ...current, fields: current.fields.map((item) => item.path === field.path ? { ...item, value: result.value ?? value, configured: true } : item) } : current);
      if (field.path === "theme.dark" || field.path === "theme.light") {
        await refreshOmpTheme(cwd);
        await loadSettings();
      } else {
        setNeedsReload(true);
      }
    } catch (error) {
      setSaveErrors((current) => ({ ...current, [field.path]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setSaving((current) => { const next = new Set(current); next.delete(field.path); return next; });
    }
  }, [browserSettingAdapters, cwd, loadSettings]);

  const settingsFields = useMemo(() => settings?.fields.map((field) => {
    if (field.owner !== "browser") return field;
    const adapter = field.path in browserSettingAdapters
      ? browserSettingAdapters[field.path as BrowserSettingPath]
      : undefined;
    return adapter ? {
        ...field,
        label: t(field.label),
        description: t(field.description),
        value: adapter.read(),
        configured: true,
      } : null;
  }).filter((field): field is SettingsField => field !== null) ?? [], [browserSettingAdapters, settings?.fields, t]);
  const values = useMemo(() => new Map(settingsFields.map((field) => [field.path, field.value])), [settingsFields]);
  const visibleFields = useMemo(() => settingsFields.filter((field) => conditionVisible(field, values)), [settingsFields, values]);
  const activeTab = section.startsWith("settings:") ? section.slice("settings:".length) : null;
  const filteredFields = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized) return visibleFields.filter((field) => `${field.label} ${field.description} ${field.path} ${field.group ?? ""}`.toLowerCase().includes(normalized));
    if (!activeTab) return [];
    return visibleFields.filter((field) => field.tab === activeTab && !(activeTab === "appearance" && field.group === "Theme"));
  }, [activeTab, query, visibleFields]);

  const close = useCallback(() => { onModelsChanged?.(); onClose(); }, [onClose, onModelsChanged]);
  const reloadActiveSession = useCallback(async () => {
    if (!sessionId) return;
    setReloading(true);
    try {
      await sendAgentCommand(sessionId, { type: "reload" });
      setNeedsReload(false);
      onReloaded?.();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setReloading(false);
    }
  }, [onReloaded, sessionId]);
  const selectedTab = settings?.tabs.find((tab) => tab.id === activeTab);
  const navigationSources = useMemo(
    () => buildSettingsNavigation(CORE_SECTIONS, settings?.tabs ?? []),
    [settings?.tabs],
  );
  const activeNavigation = navigationSources.find((item) => item.id === section);
  const settingsSearchResults = useMemo(
    () => buildSettingsSearchResults(query, navigationSources, visibleFields),
    [navigationSources, query, visibleFields],
  );
  const pageTitle = query.trim() ? "Search results" : activeNavigation?.label ?? selectedTab?.label ?? "Settings";
  const pageDescription = query.trim()
    ? `${settingsSearchResults.length} matching Settings results.`
    : activeNavigation?.description ?? "Configure the values supplied by OMP.";

  useEffect(() => {
    if (!requestedFieldPath || query.trim()) return;
    const frame = requestAnimationFrame(() => {
      const control = document.getElementById(settingFieldId(requestedFieldPath));
      control?.scrollIntoView({ block: "center" });
      control?.focus();
      setRequestedFieldPath(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [query, requestedFieldPath, section]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const selectSearchResult = (result: SettingsSearchResult) => {
    setQuery("");
    setSection(result.sectionId as SettingsSection);
    setRequestedFieldPath(result.fieldPath ?? null);
  };

  const renderFields = (fields: SettingsField[], groups: string[]) => {
    const orderedGroups = [...groups, ...fields.map((field) => field.group ?? "General").filter((group) => !groups.includes(group))];
    return [...new Set(orderedGroups)].map((group) => {
      const groupFields = fields.filter((field) => (field.group ?? "General") === group);
      if (!groupFields.length) return null;
      return <section className={styles.group} key={group}><h3 className={styles.groupTitle}>{group}</h3>{groupFields.map((field) => <SettingRow key={field.path} field={field} busy={saving.has(field.path)} error={saveErrors[field.path]} onSave={(value) => void saveSetting(field, value)} />)}</section>;
    });
  };

  const renderThemeSection = () => {
    if (!settings) return <div className={styles.empty}>{loading ? "Loading themes…" : loadError ?? "Themes unavailable"}</div>;
    return (
      <div className={styles.scrollContent}>
        <header className={styles.contentHeader}><h2 className={styles.contentTitle}>Appearance</h2><p className={styles.contentDescription}>{activeNavigation?.description ?? "Choose the Reeve mode, language, and OMP palettes for light and dark interfaces."}</p></header>
        <div className={styles.settingsBody}>
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>{t("settings.appearance.interface")}</h3>
            <FormField
              id="web-theme-preference"
              label={t("settings.appearance.theme")}
              description={t("settings.appearance.themeDescription")}
              labelMode="aria-labelledby"
              className={styles.settingRow}
            >
              <Button
                size="sm"
                tone="ghost"
                className={styles.settingControl}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
              >
                {t(`settings.appearance.theme.${preference}`)}
              </Button>
            </FormField>
            <FormField
              id="web-language"
              label={t("settings.appearance.language")}
              description={t("settings.appearance.languageDescription")}
              labelMode="aria-labelledby"
              className={styles.settingRow}
            >
              <SearchableSelect
                className={styles.settingControl}
                value={locale}
                options={supportedLocales.map((option) => ({ value: option.id, label: option.label }))}
                onChange={(value) => {
                  const option = supportedLocales.find((item) => item.id === value);
                  if (option) setLocale(option.id as typeof locale);
                }}
              />
            </FormField>
          </section>
          <div className={styles.themeGrid}>{(["dark", "light"] as const).map((mode) => {
            const field = settings.fields.find((item) => item.path === `theme.${mode}`)!;
            const palette = settings.theme.palettes[mode];
            return (
              <div className={styles.themeCard} key={mode}>
                <ThemePreview mode={mode} palette={palette} />
                <div className={styles.themeCardBody}>
                  <FormField
                    id={`theme-${mode}`}
                    label={<span className={styles.themeCardHeader}><span className={styles.themeSlot}>{mode} mapping</span>{theme === mode && <span className={styles.themeActive}>Active on web</span>}</span>}
                    labelMode="aria-labelledby"
                  >
                    <SearchableSelect value={String(field.value)} disabled={saving.has(field.path)} options={(field.options ?? []).map((option) => ({ value: option.value, label: option.label, description: option.description }))} onChange={(value) => void saveSetting(field, value)} />
                  </FormField>
                  {theme !== mode && <Button size="sm" tone="ghost" fullWidth className={styles.previewButton} onClick={() => toggleTheme()}>Preview {mode}</Button>}
                </div>
              </div>
            );
          })}</div>
          {renderFields(settings.fields.filter((field) => field.tab === "appearance" && field.group === "Theme" && !field.path.startsWith("theme.")), ["Theme"])}
        </div>
      </div>
    );
  };

  const renderGenericSettings = () => {
    if (loading) return <div className={styles.empty}>Loading omp settings…</div>;
    if (loadError || !settings) return <div className={styles.empty}>{loadError ?? "Settings unavailable"}</div>;
    return (
      <div className={styles.scrollContent}>
        <header className={styles.contentHeader}>
          <h2 className={styles.contentTitle}>{pageTitle}</h2>
          <p className={styles.contentDescription}>{pageDescription}</p>
          {needsReload && sessionId && (
            <div className={styles.reloadNotice}>
              <span>Saved. Reload the active session to apply runtime settings.</span>
              <Button size="sm" tone="primary" loading={reloading} onClick={() => void reloadActiveSession()}>
                {reloading ? "Reloading…" : "Reload session"}
              </Button>
            </div>
          )}
        </header>
        <div className={styles.settingsBody}>
          {filteredFields.length
            ? renderFields(filteredFields, selectedTab?.groups ?? [])
            : settingsSearchResults.length
              ? <div className={styles.empty}>Select a result from the Settings navigation.</div>
              : <div className={styles.empty}>No results found.</div>}
        </div>
      </div>
    );
  };

  const renderSection = (sectionId: SettingsSection) => {
    if (query.trim()) return renderGenericSettings();
    if (sectionId === "models") return <ModelsConfig cwd={cwd} embedded onClose={close} onModelsChanged={onModelsChanged} />;
    if (sectionId === "themes") return renderThemeSection();
    if (sectionId === "skills") return cwd ? <SkillsConfig cwd={cwd} embedded onClose={close} /> : renderGenericSettings();
    if (sectionId === "plugins") return cwd ? <PluginsConfig cwd={cwd} sessionId={sessionId} embedded onClose={close} onReloaded={onReloaded} /> : renderGenericSettings();
    if (sectionId === "mcp") return <McpSettings cwd={cwd} sessionId={sessionId} onReloaded={onReloaded} />;
    if (sectionId === "access") return <AccessConfig />;
    if (sectionId === "archived") return <ArchivedChatsSettings onChanged={onArchivedSessionsChanged} />;
    if (sectionId === "about") return <AboutConfig />;
    return renderGenericSettings();
  };

  const navigationItems = navigationSources.map((item) => {
    const id = item.id as SettingsSection;
    return {
      id,
      label: <><SettingsIcon kind={item.icon ?? "tools"} className={styles.navIcon} /><span>{item.label}</span></>,
      panel: <main className={styles.content}>{renderSection(id)}</main>,
      disabled: item.requiresCwd && !cwd,
      group: item.group,
    };
  });

  if (!navigationItems.some((item) => item.id === section) && section.startsWith("settings:")) {
    const fallback = buildSettingsNavigation([], [{ id: activeTab ?? "unknown", label: selectedTab?.label ?? "Settings" }])[0];
    navigationItems.push({
      id: section,
      label: <><SettingsIcon kind={activeTab ?? "tools"} className={styles.navIcon} /><span>{fallback.label}</span></>,
      panel: <main className={styles.content}>{renderGenericSettings()}</main>,
      disabled: false,
      group: fallback.group,
    });
  }

  return (
    <Dialog
      open
      presentation="fullWindow"
      className={styles.settingsDialog}
      title="Settings"
      description={<code className={styles.context} title={cwd ?? "Global configuration"}>{cwd ?? "Global configuration"}</code>}
      initialFocus={searchRef}
      onOpenChange={(next) => { if (!next) close(); }}
    >
      <DynamicStyleVars
        className={styles.settingsLayout}
        variables={{ "--ui-panel-width": getPanelWidthCssValue(sidebarWidth) }}
      >
        <div className={styles.backRail}>
          <Button fullWidth size="md" tone="ghost" className={styles.backButton} onClick={close}>
            <svg className={styles.backIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            <span>{t("settings.backToApp")}</span>
          </Button>
        </div>
        <div className={styles.searchWrap}><svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input ref={searchRef} className={styles.search} value={query} aria-label="Search settings" placeholder="Search settings…" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Escape" && query) {
            event.preventDefault();
            setQuery("");
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            searchResultsRef.current?.focusFirst();
          }
        }} /></div>
        {query.trim() && (
          <div className={styles.searchResultsNav}>
            <SettingsSearchResults ref={searchResultsRef} results={settingsSearchResults} onSelect={selectSearchResult} />
          </div>
        )}
        <Tabs
          className={styles.settingsTabs}
          data-search={Boolean(query.trim())}
          label="Settings sections"
          value={section}
          items={navigationItems}
          orientation="vertical"
          onValueChange={(value) => { setQuery(""); setSection(value as SettingsSection); }}
        />
      </DynamicStyleVars>
    </Dialog>
  );
}

function McpSettings({ cwd, sessionId, onReloaded }: { cwd?: string | null; sessionId?: string | null; onReloaded?: () => void }) {
  const [data, setData] = useState<McpConfigResponse | null>(null);
  const [scope, setScope] = useState<"user" | "project">("user");
  const [selected, setSelected] = useState(0);
  const [json, setJson] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const suffix = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
      const response = await fetch(`/api/mcp${suffix}`, { cache: "no-store" });
      const result = await response.json() as McpConfigResponse & { error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`);
      setData(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [cwd]);

  useEffect(() => { void load(); }, [load]);
  const currentScope: McpScopeConfig | null = data ? (scope === "user" ? data.user : data.project) : null;
  const server = currentScope?.servers[selected] ?? null;
  useEffect(() => { setName(server?.name ?? ""); setJson(server ? JSON.stringify(server.config, null, 2) : ""); }, [server]);

  const updateServers = (servers: McpScopeConfig["servers"]) => {
    setData((current) => {
      if (!current) return current;
      const updated = { ...(scope === "user" ? current.user : current.project!), servers };
      return scope === "user" ? { ...current, user: updated } : { ...current, project: updated };
    });
  };
  const commitDraft = (): Array<Pick<McpServerEntry, "name" | "config">> => {
    const servers = currentScope?.servers ?? [];
    const updated = server?.editable === false
      ? servers
      : servers.map((item, index) => index === selected
        ? { ...item, name, config: JSON.parse(json) as McpServerConfig }
        : item);
    return updated.filter((item) => item.editable !== false).map(({ name: serverName, config }) => ({ name: serverName, config }));
  };
  const save = async () => {
    if (!currentScope) return;
    setSaving(true);
    setError(null);
    try {
      const servers = commitDraft();
      const suffix = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
      const response = await fetch(`/api/mcp${suffix}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, servers }) });
      const result = await response.json() as { error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };
  const toggleServer = async (entry: McpServerEntry) => {
    const key = `${scope}:${entry.name}`;
    setToggling(key);
    setError(null);
    try {
      const suffix = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
      const response = await fetch(`/api/mcp${suffix}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, name: entry.name, enabled: !entry.enabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`);
      await load();
      if (sessionId) {
        await sendAgentCommand(sessionId, { type: "reload" });
        onReloaded?.();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setToggling(null);
    }
  };
  const addServer = () => {
    if (!currentScope) return;
    let candidate = "new-server";
    let suffix = 2;
    while (currentScope.servers.some((item) => item.name === candidate)) candidate = `new-server-${suffix++}`;
    const next = [...currentScope.servers, { name: candidate, config: { type: "stdio" as const, command: "" }, enabled: true, editable: true }];
    updateServers(next);
    setSelected(next.length - 1);
  };
  const removeServer = () => {
    if (!currentScope || !server || server.editable === false) return;
    updateServers(currentScope.servers.filter((_, index) => index !== selected));
    setSelected(Math.max(0, selected - 1));
  };

  const serverListPanel = (
    <>
      {currentScope?.error ? <div className={styles.mcpError}>{currentScope.error}</div> : (
        <div className={styles.serverRows}>
          {currentScope?.servers.length ? currentScope.servers.map((item, index) => {
            const toggleKey = `${scope}:${item.name}`;
            return (
              <div key={`${item.name}-${item.source?.path ?? index}`} className={styles.serverRow} data-active={selected === index}>
                <Button fullWidth size="sm" tone="ghost" className={styles.serverSelect} title={item.source?.path} onClick={() => setSelected(index)}>
                  <span className={styles.statusDot} data-off={!item.enabled} />
                  <span className={styles.serverName}>{item.name}</span>
                  {item.editable === false && <span className={styles.sourceBadge}>{item.source?.provider ?? "external"}</span>}
                </Button>
                <Button
                  size="sm"
                  tone="ghost"
                  className={styles.serverToggle}
                  data-on={item.enabled}
                  disabled={toggling === toggleKey}
                  aria-pressed={item.enabled}
                  aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.name}`}
                  title={`${item.enabled ? "Disable" : "Enable"} ${item.name}`}
                  onClick={() => void toggleServer(item)}
                >
                  {toggling === toggleKey ? "…" : item.enabled ? "ON" : "OFF"}
                </Button>
              </div>
            );
          }) : <div className={styles.serverListEmpty}>No servers in this scope.</div>}
        </div>
      )}
      <Button fullWidth size="sm" tone="ghost" className={styles.addServer} disabled={Boolean(currentScope?.error)} onClick={addServer}>+ Add OMP server</Button>
    </>
  );

  return (
    <div className={styles.scrollContent}>
      <header className={styles.contentHeader}>
        <h2 className={styles.contentTitle}>MCP servers</h2>
        <p className={styles.contentDescription}>All MCP servers discovered by OMP are listed by scope and can be enabled or disabled here. Native OMP entries are editable; configurations owned by Claude, Codex, Gemini, plugins, or other providers remain read-only at their source.</p>
      </header>
      <div className={styles.settingsBody}>
        {!data ? <div className={styles.empty}>{error ?? "Loading MCP configuration…"}</div> : (
          <div className={styles.mcpLayout}>
            <Tabs
              className={styles.mcpList}
              label="MCP configuration scope"
              value={scope}
              orientation="horizontal"
              items={[
                { id: "user", label: `User · ${data.user.servers.length}`, panel: serverListPanel },
                { id: "project", label: `Project · ${data.project?.servers.length ?? 0}`, panel: serverListPanel, disabled: !data.project },
              ]}
              onValueChange={(value) => { setScope(value as "user" | "project"); setSelected(0); }}
            />
            <section className={styles.mcpEditor}>
              {server ? (
                <>
                  <div className={styles.editorHeader}>
                    <input className={styles.textInput} value={name} aria-label="MCP server name" readOnly={server.editable === false} onChange={(event) => setName(event.target.value)} placeholder="server-name" />
                    {server.editable !== false && <Button size="sm" tone="danger" className={styles.dangerButton} onClick={removeServer}>Delete</Button>}
                  </div>
                  {server.editable === false && <div className={styles.readOnlyNotice}>Configuration read-only · managed by {server.source?.provider ?? "an external provider"}. Status can be changed from the server list.</div>}
                  <textarea className={styles.jsonEditor} value={json} aria-label="MCP server configuration" readOnly={server.editable === false} spellCheck={false} onChange={(event) => setJson(event.target.value)} />
                  <div className={styles.editorActions}>
                    <div>
                      {error && <div className={styles.error}>{error}</div>}
                      <div className={styles.saveState}>{server.source?.path ?? currentScope?.path}</div>
                    </div>
                    {server.editable !== false && <Button size="sm" tone="primary" className={styles.primaryButton} loading={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save MCP"}</Button>}
                  </div>
                </>
              ) : <div className={styles.empty}>Add or select an MCP server.</div>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
