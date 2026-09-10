"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { HeaderListEditor } from "./HeaderListEditor";
import {
  ApiSelect,
  FieldGroup,
  FieldHint,
  SectionTitle,
  SecretTextInput,
  TextInput,
} from "./model-fields";
import { API_OPTIONS, type ProviderEntry } from "./types";
import { useI18n } from "@/hooks/useI18n";
import type { DiscoveredModel } from "@/lib/model-discovery";
import styles from "./provider-detail.module.css";

type ModelDiscoveryState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; models: DiscoveredModel[]; endpoint: string }
  | { phase: "error"; message: string };

export function ProviderDetail({ name, provider, onChange, onRename, onDelete, onAddModels }: {
  name: string; provider: ProviderEntry;
  onChange: (p: ProviderEntry) => void; onRename: (n: string) => void; onDelete: () => void;
  onAddModels: (models: DiscoveredModel[]) => void;
}) {
  const { t } = useI18n();
  const [editingName, setEditingName] = useState(name);
  const [discoveryState, setDiscoveryState] = useState<ModelDiscoveryState>({ phase: "idle" });
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const discoveryRequestIdRef = useRef(0);
  const selectShownRef = useRef<HTMLInputElement>(null);
  useEffect(() => setEditingName(name), [name]);
  const set = <K extends keyof ProviderEntry>(k: K, v: ProviderEntry[K]) => onChange({ ...provider, [k]: v });

  useEffect(() => {
    if (!provider.api) onChange({ ...provider, api: "openai-completions" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.api]);

  useEffect(() => {
    discoveryRequestIdRef.current += 1;
    setDiscoveryState({ phase: "idle" });
    setDiscoveryQuery("");
    setSelectedModelIds([]);
  }, [name, provider.baseUrl, provider.api, provider.apiKey]);

  const handleDiscoverModels = useCallback(async () => {
    if (!provider.baseUrl?.trim() || discoveryState.phase === "loading") return;
    const requestId = ++discoveryRequestIdRef.current;
    setDiscoveryState({ phase: "loading" });
    setSelectedModelIds([]);
    try {
      const res = await fetch("/api/models-config/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName: name, provider: { ...provider, models: undefined } }),
      });
      const data = await res.json() as { models?: DiscoveredModel[]; endpoint?: string; error?: string };
      if (requestId !== discoveryRequestIdRef.current) return;
      if (!res.ok || data.error || !data.models) {
        setDiscoveryState({ phase: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setDiscoveryState({ phase: "success", models: data.models, endpoint: data.endpoint ?? provider.baseUrl });
    } catch (error) {
      if (requestId !== discoveryRequestIdRef.current) return;
      setDiscoveryState({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [discoveryState.phase, name, provider]);

  const existingModelIds = new Set((provider.models ?? []).map((model) => model.id));
  const discoveredModels = discoveryState.phase === "success" ? discoveryState.models : [];
  const normalizedDiscoveryQuery = discoveryQuery.trim().toLocaleLowerCase();
  const filteredDiscoveredModels = discoveredModels.filter((model) => !normalizedDiscoveryQuery
    || model.id.toLocaleLowerCase().includes(normalizedDiscoveryQuery)
    || model.name?.toLocaleLowerCase().includes(normalizedDiscoveryQuery));
  const shownDiscoveredModels = filteredDiscoveredModels.slice(0, 300);
  const selectableShownIds = shownDiscoveredModels
    .filter((model) => !existingModelIds.has(model.id))
    .map((model) => model.id);
  const selectedCount = selectedModelIds.filter((id) => !existingModelIds.has(id)).length;
  const allShownSelected = selectableShownIds.length > 0
    && selectableShownIds.every((id) => selectedModelIds.includes(id));
  const someShownSelected = !allShownSelected
    && selectableShownIds.some((id) => selectedModelIds.includes(id));

  useEffect(() => {
    if (selectShownRef.current) selectShownRef.current.indeterminate = someShownSelected;
  }, [someShownSelected]);

  const toggleDiscoveredModel = (id: string) => {
    setSelectedModelIds((current) => current.includes(id)
      ? current.filter((entry) => entry !== id)
      : [...current, id]);
  };

  const toggleShownModels = () => {
    const shownIds = new Set(selectableShownIds);
    setSelectedModelIds((current) => allShownSelected
      ? current.filter((id) => !shownIds.has(id))
      : Array.from(new Set([...current, ...selectableShownIds])));
  };

  const addSelectedModels = () => {
    if (discoveryState.phase !== "success") return;
    const selected = new Set(selectedModelIds);
    const additions = discoveryState.models.filter((model) => selected.has(model.id) && !existingModelIds.has(model.id));
    if (additions.length === 0) return;
    onAddModels(additions);
    setSelectedModelIds([]);
  };

  return (
    <div className={styles.providerStack}>
      <div className={styles.providerHeader}>
        <SectionTitle>{t("i18n.provider")}</SectionTitle>
        <Button onClick={onDelete} tone="danger" size="sm">
          {t("i18n.delete")}
        </Button>
      </div>

      <div className={styles.nameField}>
        <FormField id="models-provider-name" label={t("i18n.providerName")}>
          <TextInput value={editingName} onChange={setEditingName} placeholder="provider-name" mono />
        </FormField>
        {editingName !== name && editingName.trim() && (
          <Button onClick={() => onRename(editingName.trim())} tone="primary" size="sm" className={styles.renameButton}>
            {t("i18n.rename")}
          </Button>
        )}
      </div>

      <FormField id="models-provider-base-url" label="Base URL">
        <TextInput value={provider.baseUrl ?? ""} onChange={(v) => set("baseUrl", v || undefined)}
          placeholder="https://api.example.com/v1" mono />
      </FormField>

      <FormField
        id="models-provider-api-key"
        label="API Key"
        description={<>Prefix with <code className={styles.inlineCode}>!</code> to run a shell command, or use an env var name</>}
      >
        <SecretTextInput value={provider.apiKey ?? ""} onChange={(v) => set("apiKey", v || undefined)}
          placeholder="ENV_VAR_NAME, !shell-command, or literal key" mono />
      </FormField>

      <FormField id="models-provider-api" label="API">
        <ApiSelect value={provider.api ?? "openai-completions"} onChange={(v) => set("api", v)} options={API_OPTIONS} required />
      </FormField>

      <FieldGroup label="Headers">
        <HeaderListEditor
          headers={provider.headers}
          onChange={(headers) => set("headers", headers)}
        />
        <FieldHint>
          Added to every request from this provider (e.g. User-Agent). Useful for gateways with bot detection.
        </FieldHint>
      </FieldGroup>

      <div className={styles.discoverySection}>
        {discoveryState.phase !== "success" && (
          <Button
            onClick={handleDiscoverModels}
            disabled={!provider.baseUrl?.trim() || discoveryState.phase === "loading"}
            loading={discoveryState.phase === "loading"}
            size="sm"
          >
            {discoveryState.phase === "loading" ? t("models.discoveryFetching") : t("models.discoveryFetch")}
          </Button>
        )}

        {discoveryState.phase === "error" && (
          <div className={styles.discoveryError} role="alert">
            {discoveryState.message}
          </div>
        )}

        {discoveryState.phase === "success" && (
          <>
            <TextInput
              value={discoveryQuery}
              onChange={setDiscoveryQuery}
              placeholder={t("models.discoveryFilterPlaceholder", { count: discoveryState.models.length })}
              aria-label={t("models.discoveryFilter")}
              className={styles.discoveryFilterInput}
            />

            <div className={styles.discoveryList}>
              <label
                className={styles.discoverySelectAllLabel}
                data-has-items={selectableShownIds.length > 0}
              >
                <input
                  ref={selectShownRef}
                  type="checkbox"
                  checked={allShownSelected}
                  disabled={selectableShownIds.length === 0}
                  onChange={toggleShownModels}
                  className={styles.discoveryCheckbox}
                />
                {t("models.discoverySelectShown")}
              </label>
              {shownDiscoveredModels.length === 0 ? (
                <div className={styles.discoveryEmpty}>{t("models.discoveryNoMatches")}</div>
              ) : shownDiscoveredModels.map((model) => {
                const alreadyAdded = existingModelIds.has(model.id);
                const checked = selectedModelIds.includes(model.id);
                return (
                  <label
                    key={model.id}
                    className={styles.discoveredModelLabel}
                    data-added={alreadyAdded}
                  >
                    <input
                      type="checkbox"
                      checked={checked || alreadyAdded}
                      disabled={alreadyAdded}
                      onChange={() => toggleDiscoveredModel(model.id)}
                      className={styles.discoveryCheckbox}
                    />
                    <span className={styles.discoveredModelText}>
                      <span className={styles.discoveredModelName}>{model.name ?? model.id}</span>
                      {model.name && <code className={styles.discoveredModelId}>{model.id}</code>}
                    </span>
                    {alreadyAdded && <span className={styles.discoveredModelAdded}>{t("models.discoveryAdded")}</span>}
                  </label>
                );
              })}
            </div>

            <div className={styles.discoveryFooter}>
              <span title={discoveryState.endpoint} className={styles.discoveryEndpoint}>
                {filteredDiscoveredModels.length > shownDiscoveredModels.length
                  ? t("models.discoveryShowing", { shown: shownDiscoveredModels.length, total: filteredDiscoveredModels.length })
                  : t("models.discoveryFetched", { count: discoveryState.models.length })}
              </span>
              <Button
                onClick={addSelectedModels}
                disabled={selectedCount === 0}
                tone="primary"
                size="sm"
              >
                {selectedCount
                  ? t("models.discoveryAddSelectedCount", { count: selectedCount })
                  : t("models.discoveryAddSelected")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
