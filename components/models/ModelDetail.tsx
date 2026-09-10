"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { StatusBadge } from "../ui/StatusBadge";
import { Tooltip } from "../ui/Tooltip";
import { setCompatBool } from "../models-config-helpers";
import { HeaderListEditor } from "./HeaderListEditor";
import { ThinkingLevelMapEditor } from "./ThinkingLevelMapEditor";
import {
  ApiSelect,
  Check,
  FieldGroup,
  FieldHint,
  NumInput,
  SectionTitle,
  TextInput,
} from "./model-fields";
import {
  effectiveCompat,
  fillEmptyModelFields,
  hasDeepseekCompat,
  setDeepseekCompat,
} from "./model-compat";
import { API_OPTIONS, type ModelEntry, type ProviderEntry } from "./types";
import { useI18n } from "@/hooks/useI18n";
import type { ModelCatalogRecommendation } from "@/lib/model-catalog";
import styles from "./model-detail.module.css";

type ModelTestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "success"; latencyMs?: number; status?: number; responseText?: string }
  | { phase: "error"; message: string; latencyMs?: number; status?: number };

type ModelCatalogState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; recommendation: ModelCatalogRecommendation; appliedCount: number }
  | { phase: "error"; message: string };

export function ModelDetail({
  providerName,
  provider,
  model,
  onChange,
  onDelete,
}: {
  providerName: string;
  provider: ProviderEntry;
  model: ModelEntry;
  onChange: (m: ModelEntry) => void;
  onDelete: () => void;
}) {
  const [testState, setTestState] = useState<ModelTestState>({ phase: "idle" });
  const { t } = useI18n();
  const [catalogState, setCatalogState] = useState<ModelCatalogState>({ phase: "idle" });
  const catalogRequestIdRef = useRef(0);
  const catalogUndoRef = useRef<ModelEntry | null>(null);
  const set = <K extends keyof ModelEntry>(k: K, v: ModelEntry[K]) => onChange({ ...model, [k]: v });
  const costVal = (k: keyof NonNullable<ModelEntry["cost"]>) => model.cost?.[k] !== undefined ? String(model.cost[k]) : "";
  const setCost = (k: keyof NonNullable<ModelEntry["cost"]>, v: string) => {
    const n = parseFloat(v);
    onChange({ ...model, cost: { ...(model.cost ?? {}), [k]: isNaN(n) ? undefined : n } });
  };
  const testSummary = (() => {
    if (testState.phase === "idle") return null;
    if (testState.phase === "testing") return t("i18n.testingModel");
    const meta = [
      testState.latencyMs !== undefined ? `${testState.latencyMs}ms` : null,
      testState.status !== undefined ? `HTTP ${testState.status}` : null,
    ].filter(Boolean);
    if (testState.phase === "success") {
      return [t("i18n.connected"), ...meta, testState.responseText || null].filter(Boolean).join(" · ");
    }
    return [t("i18n.failed"), ...meta, testState.message].filter(Boolean).join(" · ");
  })();

  useEffect(() => {
    setTestState({ phase: "idle" });
  }, [providerName, provider.baseUrl, provider.api, provider.apiKey, model.id, model.api]);

  useEffect(() => {
    catalogRequestIdRef.current += 1;
    setCatalogState({ phase: "idle" });
    catalogUndoRef.current = null;
  }, [providerName, provider.baseUrl, model.id]);

  const handleTest = useCallback(async () => {
    if (!model.id.trim() || testState.phase === "testing") return;
    setTestState({ phase: "testing" });
    try {
      const res = await fetch("/api/models-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName, provider, model }),
      });
      const d = await res.json() as {
        ok?: boolean;
        error?: string;
        latencyMs?: number;
        status?: number;
        responseText?: string;
      };
      if (!res.ok || !d.ok) {
        setTestState({
          phase: "error",
          message: d.error ?? `HTTP ${res.status}`,
          latencyMs: d.latencyMs,
          status: d.status,
        });
        return;
      }
      setTestState({
        phase: "success",
        latencyMs: d.latencyMs,
        status: d.status,
        responseText: d.responseText,
      });
    } catch (e) {
      setTestState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [model, provider, providerName, testState.phase]);

  const handleCatalogFill = useCallback(async () => {
    const query = model.id.trim();
    if (!query || catalogState.phase === "loading") return;
    const requestId = ++catalogRequestIdRef.current;
    setCatalogState({ phase: "loading" });
    try {
      const params = new URLSearchParams({ q: query, provider: providerName, limit: "50" });
      if (provider.baseUrl?.trim()) params.set("baseUrl", provider.baseUrl.trim());
      const res = await fetch(`/api/models-config/catalog?${params}`);
      const data = await res.json() as { recommendation?: ModelCatalogRecommendation; error?: string };
      if (requestId !== catalogRequestIdRef.current) return;
      if (!res.ok || data.error || !data.recommendation) {
        setCatalogState({ phase: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const filled = fillEmptyModelFields(model, data.recommendation.preset);
      if (filled.appliedCount > 0) {
        catalogUndoRef.current = model;
        onChange(filled.model);
      }
      setCatalogState({
        phase: "success",
        recommendation: data.recommendation,
        appliedCount: filled.appliedCount,
      });
    } catch (error) {
      if (requestId !== catalogRequestIdRef.current) return;
      setCatalogState({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [catalogState.phase, model, onChange, provider.baseUrl, providerName]);

  const undoCatalogFill = () => {
    const previous = catalogUndoRef.current;
    if (!previous) return;
    catalogUndoRef.current = null;
    onChange(previous);
    setCatalogState({ phase: "idle" });
  };

  const catalogResultSummary = (() => {
    if (catalogState.phase !== "success") return null;
    const { recommendation, appliedCount } = catalogState;
    const applied = appliedCount > 0
      ? t("models.catalogFilled", { count: appliedCount })
      : t("models.catalogNoEmptyFields");
    if (recommendation.price.status === "unreliable") {
      const price = recommendation.price.reason === "no-exact-match"
        ? t("models.catalogNoExactMatch")
        : t("models.catalogPriceUnreliable");
      return `${applied} · ${price}`;
    }
    const price = recommendation.price.method === "provider"
      ? t("models.catalogPriceProvider", { provider: recommendation.price.providerName ?? recommendation.price.providerId ?? providerName })
      : recommendation.price.method === "base-url"
        ? t("models.catalogPriceBaseUrl", { provider: recommendation.price.providerName ?? recommendation.price.providerId ?? providerName })
        : t("models.catalogPriceConsensus", {
            support: recommendation.price.support,
            total: recommendation.price.total,
          });
    return `${applied} · ${price}`;
  })();
  const catalogStatusText = catalogState.phase === "error"
    ? catalogState.message
    : catalogResultSummary;

  return (
    <div className={styles.modelStack}>
      <div className={styles.modelHeader}>
        <SectionTitle>{t("i18n.model")}</SectionTitle>
        <div className={styles.headerActions}>
          {testSummary && (
            <Tooltip content={testSummary}>
              <StatusBadge
                tone={testState.phase === "error" ? "danger" : testState.phase === "success" ? "success" : "neutral"}
                className={styles.testSummaryBadge}
              >
                {testSummary}
              </StatusBadge>
            </Tooltip>
          )}
          <Button
            onClick={handleTest}
            disabled={!model.id.trim() || testState.phase === "testing"}
            title={t("i18n.testConnection")}
            tone="neutral"
            size="sm"
            loading={testState.phase === "testing"}
            className={styles.testStateButton}
            data-state={testState.phase}
          >
            {testState.phase === "success" && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {testState.phase === "testing" ? t("i18n.checking") : testState.phase === "success" ? t("common.ok") : t("i18n.test")}
          </Button>
          <Button onClick={onDelete} tone="danger" size="sm">
            {t("i18n.remove")}
          </Button>
        </div>
      </div>

      <div className={styles.identityGrid}>
        <FormField id="models-model-id" label="ID *"><TextInput value={model.id} onChange={(v) => set("id", v)} placeholder="model-id" mono /></FormField>
        <FormField id="models-model-name" label="Name"><TextInput value={model.name ?? ""} onChange={(v) => set("name", v || undefined)} placeholder="Display name" /></FormField>
      </div>

      <div className={styles.catalogSection}>
        <div className={styles.catalogActions}>
          <Button
            onClick={() => void handleCatalogFill()}
            disabled={!model.id.trim() || catalogState.phase === "loading"}
            loading={catalogState.phase === "loading"}
            size="sm"
          >
            {catalogState.phase === "loading" ? t("models.catalogFilling") : t("models.catalogFill")}
          </Button>
          <a
            href="https://github.com/anomalyco/models.dev"
            target="_blank"
            rel="noreferrer"
            className={styles.catalogSourceLink}
          >
            {t("models.catalogSource")}
          </a>
        </div>

        <div
          aria-live="polite"
          className={styles.catalogStatusRow}
          data-status={catalogState.phase === "error" ? "error" : catalogState.phase === "success" && catalogState.recommendation.price.status === "unreliable" ? "warning" : "default"}
        >
          <span
            title={catalogStatusText ?? undefined}
            className={styles.catalogStatusText}
          >
            {catalogStatusText}
          </span>
          {catalogUndoRef.current && (
            <Button
              onClick={undoCatalogFill}
              tone="ghost"
              size="sm"
            >
              {t("models.catalogUndo")}
            </Button>
          )}
        </div>
      </div>

      <FormField id="models-model-api" label="API override">
        <ApiSelect value={model.api ?? ""} onChange={(v) => set("api", v || undefined)} options={API_OPTIONS} />
      </FormField>

      <FieldGroup label="Headers">
        <HeaderListEditor
          headers={model.headers}
          onChange={(headers) => set("headers", headers)}
        />
        <FieldHint>
          Added to this model&apos;s requests; overrides the provider headers for this model.
        </FieldHint>
      </FieldGroup>

      <div className={styles.toggleRow}>
        <Check label="Reasoning / thinking" checked={model.reasoning ?? false} onChange={(v) => set("reasoning", v || undefined)} />
        <Check label="Image input" checked={model.input?.includes("image") ?? false}
          onChange={(v) => set("input", v ? ["text", "image"] : undefined)} />
      </div>

      {model.reasoning && (
        <>
          <Check
            label="DeepSeek thinking compat"
            checked={hasDeepseekCompat(model)}
            onChange={(v) => onChange(setDeepseekCompat(model, v))}
          />
          <Check
            label="Use developer role for the system prompt (disable if server rejects it)"
            checked={effectiveCompat(provider, model)["supportsDeveloperRole"] !== false}
            onChange={(v) => onChange(setCompatBool(model, "supportsDeveloperRole", v))}
          />
          <div>
            <div className={styles.thinkingHeader}>
              <SectionTitle>Thinking level map</SectionTitle>
              {model.thinkingLevelMap && (
                <Button
                  onClick={() => set("thinkingLevelMap", undefined)}
                  tone="ghost"
                  size="sm"
                >
                  clear all
                </Button>
              )}
            </div>
            <ThinkingLevelMapEditor
              value={model.thinkingLevelMap}
              onChange={(v) => set("thinkingLevelMap", v)}
            />
          </div>
        </>
      )}

      <div className={styles.limitsGrid}>
        <FormField id="models-context-window" label="Context window (tokens)">
          <NumInput value={model.contextWindow !== undefined ? String(model.contextWindow) : ""}
            onChange={(v) => set("contextWindow", v ? parseInt(v) : undefined)} placeholder="128000" />
        </FormField>
        <FormField id="models-max-tokens" label="Max output tokens">
          <NumInput value={model.maxTokens !== undefined ? String(model.maxTokens) : ""}
            onChange={(v) => set("maxTokens", v ? parseInt(v) : undefined)} placeholder="16384" />
        </FormField>
      </div>

      <div>
        <SectionTitle>Cost (per million tokens)</SectionTitle>
        <div className={styles.costGrid}>
          {(["input", "output", "cacheRead", "cacheWrite"] as const).map((k) => (
            <FormField key={k} id={`models-cost-${k}`} label={k}>
              <NumInput value={costVal(k)} onChange={(v) => setCost(k, v)} placeholder="0" />
            </FormField>
          ))}
        </div>
      </div>
    </div>
  );
}
