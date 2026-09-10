"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type {
  SkillInstallScope,
  SkillSearchResult,
} from "@/lib/api-types";
import styles from "../SkillsConfig.module.css";
import { Button } from "../ui/Button";
import { FormField } from "../ui/FormField";
import { shortenPath } from "./skill-utils";

export function SkillSearchForm({
  query,
  searching,
  onQueryChange,
  onSearch,
}: {
  query: string;
  searching: boolean;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={styles.searchRow}>
      <FormField
        id="skill-search"
        label={t("i18n.search")}
        className={styles.searchField}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch(query);
          }}
          placeholder={t("i18n.skillSearchPlaceholder")}
          className={styles.searchInput}
        />
      </FormField>
      <Button
        tone="primary"
        size="sm"
        onClick={() => onSearch(query)}
        disabled={searching || !query.trim()}
        loading={searching}
        className={styles.searchAction}
      >
        {searching ? t("i18n.searching") : t("i18n.search")}
      </Button>
    </div>
  );
}

export function SkillDiscovery({
  cwd,
  installedPackages,
  projectResourcesLoaded,
  onSearch,
  onInstall,
  onInstalled,
}: {
  cwd: string;
  installedPackages: Record<SkillInstallScope, ReadonlySet<string>>;
  projectResourcesLoaded: boolean;
  onSearch: (query: string) => Promise<SkillSearchResult[]>;
  onInstall: (packageName: string, scope: SkillInstallScope) => Promise<void>;
  onInstalled: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [newlyInstalledPackages, setNewlyInstalledPackages] = useState<Set<string>>(
    new Set(),
  );
  const [scope, setScope] = useState<SkillInstallScope>("global");

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const searchResults = await onSearch(searchQuery.trim());
      setResults(searchResults);
      if (searchResults.length === 0) setSearchError("No skills found");
    } catch (error) {
      setSearchError(String(error));
    } finally {
      setSearching(false);
    }
  }, [onSearch]);

  const install = useCallback(async (packageName: string) => {
    setInstalling(packageName);
    setInstallError(null);
    try {
      await onInstall(packageName, scope);
      setNewlyInstalledPackages((current) =>
        new Set(current).add(`${scope}:${packageName}`),
      );
      onInstalled();
    } catch (error) {
      setInstallError(String(error));
    } finally {
      setInstalling(null);
    }
  }, [onInstall, onInstalled, scope]);

  const installPath = scope === "global"
    ? "~/.claude/skills/"
    : `${shortenPath(cwd)}/.claude/skills/`;

  return (
    <div className={styles.discoveryPanel}>
      <div className={styles.discoveryHeader}>
        <div className={styles.discoveryTitle}>{t("i18n.addSkill")}</div>
        <SkillSearchForm
          query={query}
          searching={searching}
          onQueryChange={setQuery}
          onSearch={(searchQuery) => void search(searchQuery)}
        />

        <div className={styles.scopeRow}>
          <div
            className={styles.scopeSelector}
            role="group"
            aria-label={t("roles.scope")}
          >
            {(["global", "project"] as const).map((nextScope) => (
              <Button
                key={nextScope}
                tone="ghost"
                size="sm"
                onClick={() => {
                  if (nextScope === "global" || projectResourcesLoaded) {
                    setScope(nextScope);
                  }
                }}
                disabled={nextScope === "project" && !projectResourcesLoaded}
                title={nextScope === "project" && !projectResourcesLoaded
                  ? t("trust.projectScopeUnavailable")
                  : undefined}
                aria-pressed={scope === nextScope}
                data-active={scope === nextScope}
                className={styles.scopeButton}
              >
                {nextScope}
              </Button>
            ))}
          </div>
          <span className={styles.installPath}>→ {installPath}</span>
        </div>

        {searchError && (
          <div role="alert" className={styles.searchError}>{searchError}</div>
        )}
        {installError && (
          <div role="alert" className={styles.installError}>{installError}</div>
        )}
      </div>

      {results.length > 0 ? (
        <div className={styles.searchResults}>
          {results.map((result) => {
            const isInstalled =
              installedPackages[scope].has(result.package) ||
              newlyInstalledPackages.has(`${scope}:${result.package}`);
            const isInstalling = installing === result.package;
            const separatorIndex = result.package.indexOf("@");
            const repository = separatorIndex > -1
              ? result.package.slice(0, separatorIndex)
              : result.package;
            const skillName = separatorIndex > -1
              ? result.package.slice(separatorIndex + 1)
              : null;

            return (
              <div key={result.package} className={styles.searchResult}>
                <div className={styles.searchResultContent}>
                  <div className={styles.searchResultName}>
                    {skillName ?? repository}
                  </div>
                  <div className={styles.searchResultMetadata}>
                    <span className={styles.searchResultRepository}>{repository}</span>
                    <span className={styles.searchResultInstalls}>{result.installs}</span>
                    {result.url && (
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.searchResultLink}
                      >
                        skills.sh ↗
                      </a>
                    )}
                  </div>
                </div>
                <Button
                  tone={isInstalled ? "neutral" : "primary"}
                  size="sm"
                  onClick={() => {
                    if (!isInstalled && !isInstalling) void install(result.package);
                  }}
                  disabled={isInstalled || isInstalling || installing !== null}
                  loading={isInstalling}
                  data-state={isInstalled ? "installed" : isInstalling ? "installing" : "idle"}
                >
                  {isInstalled
                    ? `✓ ${t("i18n.installed")}`
                    : isInstalling
                      ? t("i18n.installing")
                      : t("i18n.install")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        !searchError && !searching && (
          <div className={styles.discoveryEmptyState}>
            Search{" "}
            <a
              href="https://skills.sh"
              target="_blank"
              rel="noreferrer"
              className={styles.discoveryLink}
            >
              skills.sh
            </a>{" "}
            to discover and install skills for your agent.
          </div>
        )
      )}
    </div>
  );
}
