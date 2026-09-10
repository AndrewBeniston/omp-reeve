"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { FieldGroup, SecretTextInput, SectionTitle } from "./model-fields";
import type { ApiKeyProvider } from "./types";
import { useI18n } from "@/hooks/useI18n";
import styles from "./auth-detail.module.css";

export function ApiKeyDetail({ provider, onRefresh }: { provider: ApiKeyProvider; onRefresh: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    setApiKey("");
    setError(null);
    setSavedOk(false);
  }, [provider.id]);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await fetch(`/api/auth/api-key/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setError(d.error ?? `HTTP ${res.status}`);
      } else {
        setApiKey("");
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
        onRefresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [apiKey, provider.id, onRefresh]);

  const handleRemove = useCallback(async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/api-key/${encodeURIComponent(provider.id)}`, { method: "DELETE" });
      const d = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || d.error) setError(d.error ?? `HTTP ${res.status}`);
      else onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving(false);
    }
  }, [provider.id, onRefresh]);

  return (
    <div className={styles.authStack}>
      <div className={styles.authHeader}>
        <SectionTitle>API Key</SectionTitle>
        <StatusBadge tone={provider.configured ? "success" : "neutral"}>
          {provider.configured ? t("i18n.configured") : t("i18n.notConfigured")}
        </StatusBadge>
      </div>

      <p className={styles.statusText}>
        {provider.configured
          ? "API key is stored. Enter a new key below to replace it, or disconnect to remove it."
          : `Enter your ${provider.displayName} API key to enable ${provider.modelCount} model${provider.modelCount !== 1 ? "s" : ""}.`}
      </p>

      <FieldGroup label="API Key">
        <div className={styles.apiKeyRow}>
          <SecretTextInput
            value={apiKey}
            onChange={setApiKey}
            onKeyDown={(e) => { if (e.key === "Enter" && apiKey.trim()) handleSave(); }}
            placeholder={provider.configured ? "Enter new key to replace…" : "sk-…"}
            aria-label="API Key"
            className={styles.apiKeyInput}
            autoComplete="off"
            spellCheck={false}
            mono
          />
          <Button
            onClick={handleSave}
            disabled={saving || !apiKey.trim() || savedOk}
            tone="primary"
            size="sm"
            loading={saving}
            className={styles.apiKeySaveState}
            data-state={savedOk ? "saved" : saving ? "saving" : "idle"}
          >
            {savedOk && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {savedOk ? t("i18n.saved") : saving ? t("i18n.saving") : t("i18n.save")}
          </Button>
        </div>
      </FieldGroup>

      {error && <p className={styles.errorText} role="alert">{error}</p>}

      {provider.configured && (
        <Button
          onClick={handleRemove}
          disabled={removing}
          tone="danger"
          size="sm"
          loading={removing}
        >
          {removing ? t("i18n.removing") : t("i18n.disconnect")}
        </Button>
      )}
    </div>
  );
}
