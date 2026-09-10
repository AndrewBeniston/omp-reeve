"use client";

import { useState, useEffect, useCallback } from "react";
import { ModelRolesPanel } from "./ModelRolesPanel";
import { AddProviderPicker } from "./models/AddProviderPicker";
import { ApiKeyDetail } from "./models/ApiKeyDetail";
import { ModelDetail } from "./models/ModelDetail";
import { ModelsSidebarTree } from "./models/ModelsSidebarTree";
import { OAuthDetail } from "./models/OAuthDetail";
import { ProviderDetail } from "./models/ProviderDetail";
import type {
  ApiKeyProvider,
  ModelEntry,
  ModelsJson,
  OAuthProvider,
  ProviderEntry,
  Selection,
} from "./models/types";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { Surface } from "./ui/Surface";
import { useI18n } from "@/hooks/useI18n";
import type { DiscoveredModel } from "@/lib/model-discovery";
import styles from "./ModelsConfig.module.css";

export function ModelsConfig({ cwd, onClose, embedded = false, onModelsChanged }: { cwd?: string | null; onClose: () => void; embedded?: boolean; onModelsChanged?: () => void }) {
  const { t } = useI18n();
  const [config, setConfig] = useState<ModelsJson>({ providers: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [selection, setSelection] = useState<Selection | null>({ type: "roles" });
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [apiKeyProviders, setApiKeyProviders] = useState<ApiKeyProvider[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadOAuthProviders = useCallback(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d: { providers: OAuthProvider[] }) => setOauthProviders(d.providers))
      .catch(() => {});
  }, []);

  const loadApiKeyProviders = useCallback(() => {
    fetch("/api/auth/all-providers")
      .then((r) => r.json())
      .then((d: { providers: ApiKeyProvider[] }) => setApiKeyProviders(d.providers))
      .catch(() => {});
  }, []);

  // A dual-auth provider moves between the two lists when its credential type
  // changes, so any auth change has to reload both — refreshing only one leaves
  // the provider rendered twice, and disconnecting the stale row would delete
  // the credential that was just created (#309).
  const refreshAuthProviders = useCallback(() => {
    loadOAuthProviders();
    loadApiKeyProviders();
  }, [loadOAuthProviders, loadApiKeyProviders]);

  useEffect(() => {
    fetch("/api/models-config")
      .then((r) => r.json())
      .then((d: ModelsJson) => {
        setConfig(d.providers ? d : { ...d, providers: {} });
      })
      .catch(() => setConfig({ providers: {} }))
      .finally(() => setLoading(false));
    refreshAuthProviders();
  }, [refreshAuthProviders]);

  const addCustomProvider = useCallback(() => {
    let finalName = "new-provider";
    let n = 1;
    while (config.providers?.[finalName]) finalName = `new-provider-${n++}`;
    setConfig((prev) => ({ ...prev, providers: { ...(prev.providers ?? {}), [finalName]: { api: "openai-completions" } } }));
    setSelection({ type: "provider", name: finalName });
  }, [config.providers]);

  const updateProvider = useCallback((name: string, p: ProviderEntry) => {
    setConfig((prev) => ({ ...prev, providers: { ...(prev.providers ?? {}), [name]: p } }));
  }, []);

  const renameProvider = useCallback((oldName: string, newName: string) => {
    setConfig((prev) => {
      const entries = Object.entries(prev.providers ?? {});
      const idx = entries.findIndex(([k]) => k === oldName);
      if (idx === -1) return prev;
      entries[idx] = [newName, entries[idx][1]];
      return { ...prev, providers: Object.fromEntries(entries) };
    });
    setSelection((prev) => {
      if (!prev) return prev;
      if (prev.type === "provider" && prev.name === oldName) return { type: "provider", name: newName };
      if (prev.type === "model" && prev.providerName === oldName) return { ...prev, providerName: newName };
      return prev;
    });
  }, []);

  const deleteProvider = useCallback((name: string) => {
    setConfig((prev) => {
      const providers = { ...(prev.providers ?? {}) };
      delete providers[name];
      return { ...prev, providers };
    });
    setConfig((prev) => {
      const remaining = Object.keys(prev.providers ?? {});
      setSelection(remaining.length > 0 ? { type: "provider", name: remaining[0] } : null);
      return prev;
    });
  }, []);

  const addModel = useCallback((providerName: string) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? []), { id: "" }];
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
    setConfig((prev) => {
      const idx = (prev.providers?.[providerName]?.models?.length ?? 1) - 1;
      setSelection({ type: "model", providerName, index: idx });
      return prev;
    });
  }, []);

  const addDiscoveredModels = useCallback((providerName: string, discovered: DiscoveredModel[]) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      const existingIds = new Set(models.map((model) => model.id));
      for (const discoveredModel of discovered) {
        if (existingIds.has(discoveredModel.id)) continue;
        existingIds.add(discoveredModel.id);
        models.push({ id: discoveredModel.id, name: discoveredModel.name });
      }
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const updateModel = useCallback((providerName: string, index: number, m: ModelEntry) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models[index] = m;
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models } } };
    });
  }, []);

  const removeModel = useCallback((providerName: string, index: number) => {
    setConfig((prev) => {
      const provider = prev.providers?.[providerName] ?? {};
      const models = [...(provider.models ?? [])];
      models.splice(index, 1);
      return { ...prev, providers: { ...(prev.providers ?? {}), [providerName]: { ...provider, models: models.length ? models : undefined } } };
    });
    setSelection({ type: "provider", name: providerName });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const res = await fetch("/api/models-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) setSaveError(d.error ?? `HTTP ${res.status}`);
      else {
        setSavedOk(true);
        onModelsChanged?.();
        setTimeout(() => setSavedOk(false), 2000);
      }
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [config, onModelsChanged]);

  const providers = Object.entries(config.providers ?? {});
  const activeOAuth = oauthProviders.filter((p) => p.loggedIn);
  const activeApiKey = apiKeyProviders.filter((p) => p.configured);

  // Resolve current detail
  const detailContent = (() => {
    if (!selection) return null;
    if (selection.type === "roles") {
      return <ModelRolesPanel cwd={cwd ?? null} onRolesChanged={onModelsChanged} />;
    }
    if (selection.type === "oauth") {
      const p = oauthProviders.find((p) => p.id === selection.providerId);
      if (!p) return null;
      return <OAuthDetail key={p.id} provider={p} onRefresh={refreshAuthProviders} />;
    }
    if (selection.type === "apikey") {
      const p = apiKeyProviders.find((p) => p.id === selection.providerId);
      if (!p) return null;
      return <ApiKeyDetail key={p.id} provider={p} onRefresh={refreshAuthProviders} />;
    }
    if (selection.type === "provider") {
      const provider = config.providers?.[selection.name];
      if (!provider) return null;
      return (
        <ProviderDetail
          key={selection.name}
          name={selection.name}
          provider={provider}
          onChange={(p) => updateProvider(selection.name, p)}
          onRename={(n) => renameProvider(selection.name, n)}
          onDelete={() => deleteProvider(selection.name)}
          onAddModels={(models) => addDiscoveredModels(selection.name, models)}
        />
      );
    }
    const provider = config.providers?.[selection.providerName];
    const model = provider?.models?.[selection.index];
    if (!model) return null;
    return (
      <ModelDetail
        key={`${selection.providerName}-${selection.index}`}
        providerName={selection.providerName}
        provider={provider}
        model={model}
        onChange={(m) => updateModel(selection.providerName, selection.index, m)}
        onDelete={() => removeModel(selection.providerName, selection.index)}
      />
    );
  })();

  return (
    <>
    <div className={styles.modelsModalWrapper} data-embedded={embedded}
      onClick={(e) => { if (!embedded && e.target === e.currentTarget) onClose(); }}>
      <Surface tone="canvas" border="default" radius="lg" elevation="raised" className={styles.modelsModalCard} data-embedded={embedded}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalHeading}>
            <span className={styles.modalTitle}>{t("common.models")}</span>
            <code className={styles.modalPath}>~/.omp/agent/models.yml</code>
          </div>
          {!embedded && (
            <IconButton label={t("i18n.close")} size="sm" onClick={onClose}>×</IconButton>
          )}
        </div>

        {/* Body */}
        <div className={styles.modelsModalBody}>

          {/* Left: tree */}
          <div className={styles.modelsSidebarTree}>
            <ModelsSidebarTree
              loading={loading}
              selection={selection}
              activeOAuth={activeOAuth}
              activeApiKey={activeApiKey}
              providers={providers}
              onSelect={setSelection}
              onAddModel={addModel}
            />

            {/* Add provider */}
            <div className={styles.addProviderRow}>
              <Button onClick={() => setPickerOpen(true)} tone="ghost" size="sm" fullWidth className={styles.addProviderButton}>
                + {t("i18n.addProvider")}
              </Button>
            </div>
          </div>

          {/* Right: detail */}
          <div className={styles.detailPane}>
            {loading ? null : detailContent ?? (
              <div className={styles.detailPlaceholder}>
                {t("i18n.selectProviderModel")}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          {saveError && <span className={styles.saveError} role="alert">{saveError}</span>}
          <Button onClick={onClose} size="sm">
            {t("i18n.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || savedOk}
            tone="primary"
            size="sm"
            loading={saving}
            className={styles.modalSaveBtn}
            data-state={savedOk ? "saved" : saving ? "saving" : "idle"}
          >
            {savedOk && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                className={styles.savedCheckIcon}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span>{savedOk ? t("i18n.saved") : saving ? t("i18n.saving") : t("i18n.save")}</span>
          </Button>
        </div>
      </Surface>
    </div>
    {pickerOpen && (
      <AddProviderPicker
        oauthProviders={oauthProviders}
        apiKeyProviders={apiKeyProviders}
        onSelectOAuth={(id) => setSelection({ type: "oauth", providerId: id })}
        onSelectApiKey={(id) => setSelection({ type: "apikey", providerId: id })}
        onAddCustom={addCustomProvider}
        onClose={() => setPickerOpen(false)}
      />
    )}
    </>
  );
}
