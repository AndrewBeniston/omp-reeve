"use client";

import { useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ProviderIcon } from "./provider-icons";
import type { ApiKeyProvider, OAuthProvider } from "./types";
import { useI18n } from "@/hooks/useI18n";
import styles from "./add-provider-picker.module.css";

export interface AddProviderPickerProps {
  oauthProviders: OAuthProvider[];
  apiKeyProviders: ApiKeyProvider[];
  onSelectOAuth: (id: string) => void;
  onSelectApiKey: (id: string) => void;
  onAddCustom: () => void;
  onClose: () => void;
}

export function AddProviderPicker({
  oauthProviders, apiKeyProviders,
  onSelectOAuth, onSelectApiKey, onAddCustom, onClose,
}: AddProviderPickerProps) {
  const [search, setSearch] = useState("");
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const q = search.trim().toLowerCase();

  const availableOAuth = oauthProviders.filter((p) => !p.loggedIn && (!q || p.name.toLowerCase().includes(q)));
  const availableApiKey = apiKeyProviders.filter((p) => !p.configured && (!q || p.displayName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));
  const showCustom = !q || "custom".includes(q) || "openai-compatible".includes(q) || "anthropic-compatible".includes(q);

  const totalCount = availableOAuth.length + availableApiKey.length + (showCustom ? 1 : 0);

  return (
    <Dialog
      open
      title={t("i18n.addProvider")}
      size="lg"
      initialFocus={inputRef}
      onOpenChange={(next) => { if (!next) onClose(); }}
      className={styles.pickerDialog}
    >
      <div className={styles.searchRow}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon} aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("i18n.searchProviders")}
          aria-label={t("i18n.searchProviders")}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.results}>
        {totalCount === 0 ? (
          <div className={styles.emptyResults}>{t("i18n.noProviders")}</div>
        ) : (
          <div className={styles.cardGrid}>
            {showCustom && (
              <div className={styles.sectionHeader}>{t("i18n.custom")}</div>
            )}
            {showCustom && (
              <Button
                onClick={() => { onAddCustom(); onClose(); }}
                tone="neutral"
                fullWidth
                className={styles.providerCard}
              >
                <span className={styles.cardText}>
                  <span className={styles.cardTitle}>OpenAI / Anthropic compatible</span>
                  <span className={styles.cardSubtitle}>{t("i18n.customEndpoint")}</span>
                </span>
                <span className={styles.customIconBox}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.customIcon} aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
              </Button>
            )}

            {availableOAuth.length > 0 && (
              <div className={styles.sectionHeader} data-padded={showCustom}>{t("i18n.subscriptions")}</div>
            )}
            {availableOAuth.map((p) => (
              <Button key={p.id} onClick={() => { onSelectOAuth(p.id); onClose(); }}
                tone="neutral"
                fullWidth
                className={styles.providerCard}
              >
                <span className={styles.cardText}>
                  <span className={styles.cardTitle}>{p.name}</span>
                  <span className={styles.cardSubtitle}>OAuth</span>
                </span>
                <ProviderIcon id={p.id} size={28} />
              </Button>
            ))}

            {availableApiKey.length > 0 && (
              <div className={styles.sectionHeader} data-padded={availableOAuth.length > 0}>API Key</div>
            )}
            {availableApiKey.map((p) => (
              <Button key={p.id} onClick={() => { onSelectApiKey(p.id); onClose(); }}
                tone="neutral"
                fullWidth
                className={styles.providerCard}
              >
                <span className={styles.cardText}>
                  <span className={styles.cardTitle}>{p.displayName}</span>
                  <span className={styles.cardSubtitle}>{p.modelCount} models</span>
                </span>
                <ProviderIcon id={p.id} size={28} />
              </Button>
            ))}

          </div>
        )}
      </div>
    </Dialog>
  );
}
