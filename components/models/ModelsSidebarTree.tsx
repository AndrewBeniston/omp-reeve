"use client";

import { Fragment, useCallback, useId, useMemo, useRef, useState } from "react";
import { ProviderIcon } from "./provider-icons";
import {
  buildModelsTree,
  resolveTreeNavigation,
  treeNodeIdForSelection,
  type ModelsTreeNode,
} from "./models-tree-navigation";
import type { ApiKeyProvider, ModelEntry, OAuthProvider, ProviderEntry, Selection } from "./types";
import { useI18n } from "@/hooks/useI18n";
import styles from "./models-sidebar-tree.module.css";

export interface ModelsSidebarTreeProps {
  loading: boolean;
  selection: Selection | null;
  activeOAuth: OAuthProvider[];
  activeApiKey: ApiKeyProvider[];
  providers: [string, ProviderEntry][];
  onSelect: (selection: Selection) => void;
  onAddModel: (providerName: string) => void;
}

export function ModelsSidebarTree({
  loading,
  selection,
  activeOAuth,
  activeApiKey,
  providers,
  onSelect,
  onAddModel,
}: ModelsSidebarTreeProps) {
  const { t } = useI18n();
  const domId = useId();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [collapsedProviders, setCollapsedProviders] = useState<ReadonlySet<string>>(() => new Set<string>());

  const nodes = useMemo(() => buildModelsTree({
    oauthProviders: activeOAuth,
    apiKeyProviders: activeApiKey,
    providers: loading ? [] : providers,
    collapsedProviders,
  }), [activeOAuth, activeApiKey, providers, loading, collapsedProviders]);

  const setProviderExpanded = useCallback((providerName: string, expanded: boolean) => {
    setCollapsedProviders((previous) => {
      const collapsed = previous.has(providerName);
      if (collapsed === !expanded) return previous;
      const next = new Set(previous);
      if (expanded) next.delete(providerName);
      else next.add(providerName);
      return next;
    });
  }, []);

  const selectedId = treeNodeIdForSelection(nodes, selection);
  const knownFocus = focusedId !== null && nodes.some((node) => node.id === focusedId) ? focusedId : null;
  const tabbableId = knownFocus ?? selectedId ?? nodes[0]?.id ?? null;

  const rowDomId = useCallback((nodeId: string) => `${domId}-${nodeId}`, [domId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const command = resolveTreeNavigation(nodes, tabbableId, event.key);
    if (!command) return;
    event.preventDefault();
    if (command.action === "focus") {
      setFocusedId(command.nodeId);
      rowRefs.current.get(command.nodeId)?.focus();
      return;
    }
    const branch = nodes.find((node) => node.id === command.nodeId);
    if (branch?.providerName) setProviderExpanded(branch.providerName, command.action === "expand");
  }, [nodes, tabbableId, setProviderExpanded]);

  const registerRow = useCallback((nodeId: string) => (element: HTMLButtonElement | null) => {
    if (element) rowRefs.current.set(nodeId, element);
    else rowRefs.current.delete(nodeId);
  }, []);

  const renderRow = (node: ModelsTreeNode, content: React.ReactNode, extra: {
    className: string;
    selected?: boolean;
    onActivate: () => void;
    sectionStart?: boolean;
    label?: string;
  }) => (
    <button
      key={node.id}
      type="button"
      ref={registerRow(node.id)}
      id={rowDomId(node.id)}
      role="treeitem"
      aria-level={node.level}
      aria-posinset={node.posInSet}
      aria-setsize={node.setSize}
      aria-selected={extra.selected}
      aria-expanded={node.expanded}
      aria-label={extra.label}
      tabIndex={node.id === tabbableId ? 0 : -1}
      className={extra.className}
      data-selected={extra.selected}
      data-section-start={extra.sectionStart || undefined}
      onFocus={() => setFocusedId(node.id)}
      onClick={extra.onActivate}
    >
      {content}
    </button>
  );

  const providerNodes = new Map(nodes.filter((node) => node.kind === "provider").map((node) => [node.providerName, node]));
  const modelNodes = new Map(nodes.flatMap((node) => (
    node.kind === "model" && node.selection?.type === "model"
      ? [[`${node.providerName}:${node.selection.index}`, node] as const]
      : []
  )));
  const addModelNodes = new Map(nodes.filter((node) => node.kind === "add-model").map((node) => [node.providerName, node]));
  const rolesNode = nodes[0];
  const oauthNodes = nodes.filter((node) => node.kind === "oauth");
  const apiKeyNodes = nodes.filter((node) => node.kind === "apikey");
  const managedCount = oauthNodes.length + apiKeyNodes.length;

  return (
    <div className={styles.treeScroll}>
      <div
        role="tree"
        aria-label={t("common.models")}
        className={styles.tree}
        onKeyDown={handleKeyDown}
      >
        {/* omp routes work by role; keep that the first thing in the panel. */}
        {renderRow(rolesNode, (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.rolesIcon} aria-hidden="true">
              <line x1="4" y1="7" x2="20" y2="7" /><circle cx="9" cy="7" r="2.2" />
              <line x1="4" y1="17" x2="20" y2="17" /><circle cx="15" cy="17" r="2.2" />
            </svg>
            <span className={styles.rowLabel}>{t("roles.title")}</span>
          </>
        ), {
          className: styles.treeRow,
          selected: selection?.type === "roles",
          onActivate: () => onSelect({ type: "roles" }),
        })}

        {oauthNodes.map((node, index) => {
          if (node.selection?.type !== "oauth") return null;
          const providerId = node.selection.providerId;
          const provider = activeOAuth.find((entry) => entry.id === providerId);
          if (!provider) return null;
          return renderRow(node, (
            <>
              <ProviderIcon id={provider.id} size={16} />
              <span className={styles.rowLabelTruncated}>{provider.name}</span>
            </>
          ), {
            className: styles.treeRow,
            selected: selection?.type === "oauth" && selection.providerId === provider.id,
            onActivate: () => onSelect({ type: "oauth", providerId: provider.id }),
            sectionStart: index === 0,
          });
        })}

        {apiKeyNodes.map((node, index) => {
          if (node.selection?.type !== "apikey") return null;
          const providerId = node.selection.providerId;
          const provider = activeApiKey.find((entry) => entry.id === providerId);
          if (!provider) return null;
          return renderRow(node, (
            <>
              <ProviderIcon id={provider.id} size={16} />
              <span className={styles.rowLabelTruncated}>{provider.displayName}</span>
            </>
          ), {
            className: styles.treeRow,
            selected: selection?.type === "apikey" && selection.providerId === provider.id,
            onActivate: () => onSelect({ type: "apikey", providerId: provider.id }),
            sectionStart: oauthNodes.length === 0 && index === 0,
          });
        })}

        {loading ? null : providers.map(([pName, pData], providerIndex) => {
          const providerNode = providerNodes.get(pName);
          if (!providerNode) return null;
          const isProviderSelected = selection?.type === "provider" && selection.name === pName;
          const models: ModelEntry[] = pData.models ?? [];
          const addNode = addModelNodes.get(pName);
          return (
            <Fragment key={pName}>
              {renderRow(providerNode, (
                <>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={styles.providerChevron} data-expanded={providerNode.expanded} aria-hidden="true">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.providerIcon} aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                  </svg>
                  <span className={styles.providerName} data-selected={isProviderSelected}>
                    {pName}
                  </span>
                </>
              ), {
                className: styles.treeRow,
                selected: isProviderSelected,
                onActivate: () => {
                  onSelect({ type: "provider", name: pName });
                  setProviderExpanded(pName, !providerNode.expanded);
                },
                sectionStart: managedCount > 0 && providerIndex === 0,
              })}

              {models.map((m, i) => {
                const modelNode = modelNodes.get(`${pName}:${i}`);
                if (!modelNode) return null;
                const isModelSelected = selection?.type === "model" && selection.providerName === pName && selection.index === i;
                return renderRow(modelNode, (
                  <>
                    <span className={styles.modelName} data-has-id={Boolean(m.id)}>
                      {m.id || t("i18n.newModel")}
                    </span>
                    {m.reasoning && (
                      <span className={styles.reasoningTag}>T</span>
                    )}
                  </>
                ), {
                  className: styles.modelRow,
                  selected: isModelSelected,
                  onActivate: () => onSelect({ type: "model", providerName: pName, index: i }),
                });
              })}

              {addNode && renderRow(addNode, (
                <span className={styles.addModelLabel}>+ {t("i18n.model")}</span>
              ), {
                className: styles.addModelRow,
                onActivate: () => onAddModel(pName),
                label: `+ ${t("i18n.model")} · ${pName}`,
              })}
            </Fragment>
          );
        })}
      </div>

      {loading && (
        <div className={styles.loadingRow}>{t("i18n.loading")}</div>
      )}
    </div>
  );
}
