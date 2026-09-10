"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DynamicStyleVars } from "@/components/ui/DynamicStyleVars";
import type { BranchPreview, SessionEntry, SessionTreeNode } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { HeaderAction } from "./shell/AppHeader";
import styles from "./navigation/navigation.module.css";

export interface BranchNavigatorProps {
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  onLeafChange: (leafId: string | null) => void;
  embedded?: boolean;
  inline?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
  open?: boolean;
  onToggle?: () => void;
  hasSession?: boolean;
  compact?: boolean;
  triggerClassName?: string;
}

export function buildActivePath(nodes: SessionTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  const target = targetId;
  function search(items: SessionTreeNode[], path: string[]): string[] | null {
    for (const node of items) {
      const next = [...path, node.entry.id];
      if (node.entry.id === target || node.compressedEntryIds?.includes(target)) return next;
      const found = search(node.children, next);
      if (found) return found;
    }
    return null;
  }
  return new Set(search(nodes, []) ?? []);
}

function isMessageEntry(entry: SessionEntry): boolean {
  return entry.type === "message" && "message" in entry;
}

export function compressChain(node: SessionTreeNode): {
  node: SessionTreeNode;
  skipped: number;
  branchPreview?: BranchPreview;
  labelEntry: SessionEntry;
} {
  let current = node;
  let branchPreview = current.branchPreview;
  let labelEntry: SessionEntry | null = isMessageEntry(current.entry) ? current.entry : null;
  let skipped = current.compressedEntryIds?.length ?? 0;
  while (current.children.length === 1) {
    current = current.children[0];
    branchPreview ??= current.branchPreview;
    if (!labelEntry && isMessageEntry(current.entry)) labelEntry = current.entry;
    skipped += 1 + (current.compressedEntryIds?.length ?? 0);
  }
  return { node: current, skipped, branchPreview, labelEntry: labelEntry ?? current.entry };
}

export function selectTopLevelBranches(tree: SessionTreeNode[]): SessionTreeNode[] {
  if (tree.length > 1) return tree;
  if (tree.length === 0) return [];
  const first = compressChain(tree[0]).node;
  return first.children.length > 1 ? first.children : [];
}

function getLabel(entry: SessionEntry): string {
  if (entry.type === "message" && "message" in entry) {
    const message = entry.message as { role: string; content: unknown };
    const text = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.filter((block): block is { type: "text"; text: string } => block.type === "text").map((block) => block.text).join(" ")
        : "";
    if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text;
    if (message.role === "assistant") return "[assistant]";
  }
  return entry.type;
}

function hasBranch(nodes: SessionTreeNode[]): boolean {
  if (nodes.length > 1) return true;
  return nodes.some((node) => node.children.length > 1 || hasBranch(node.children));
}

interface TreeNodeProps {
  node: SessionTreeNode;
  activePathIds: Set<string>;
  isLast: boolean;
  parentLines: boolean[];
  onSelect: (id: string) => void;
}

function TreeNodeView({ node, activePathIds, isLast, parentLines, onSelect }: TreeNodeProps) {
  const { node: representative, skipped, branchPreview, labelEntry } = compressChain(node);
  const isActive = activePathIds.has(representative.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || isActive;
  const label = branchPreview?.text ?? getLabel(labelEntry);
  const role = branchPreview?.role ?? (isMessageEntry(labelEntry) ? (labelEntry as { message: { role: string } }).message.role : null);

  return (
    <div className={styles.branchTreeNode}>
      <button
        type="button"
        className={styles.branchTreeRow}
        data-active={isActive}
        data-on-path={isOnPath}
        aria-current={isActive ? "true" : undefined}
        onClick={() => onSelect(representative.entry.id)}
      >
        {parentLines.map((hasLine, index) => <span key={index} className={styles.branchGuide} data-line={hasLine} aria-hidden="true" />)}
        <span className={styles.branchConnector} data-last={isLast} aria-hidden="true" />
        <span className={styles.branchNodeDot} aria-hidden="true" />
        {role && <span className={styles.branchRole} data-role={role}>{role === "user" ? "U" : "A"}</span>}
        {skipped > 0 && <span className={styles.branchSkipped}>+{skipped}</span>}
        <span className={styles.branchLabel}>{label}</span>
      </button>
      {representative.children.map((child, index) => (
        <TreeNodeView
          key={child.entry.id}
          node={child}
          activePathIds={activePathIds}
          isLast={index === representative.children.length - 1}
          parentLines={[...parentLines, !isLast]}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function BranchTree({ nodes, activePathIds, onSelect }: { nodes: SessionTreeNode[]; activePathIds: Set<string>; onSelect: (id: string) => void }) {
  return (
    <div className={styles.branchTree}>
      {nodes.map((child, index) => (
        <TreeNodeView key={child.entry.id} node={child} activePathIds={activePathIds} isLast={index === nodes.length - 1} parentLines={[]} onSelect={onSelect} />
      ))}
    </div>
  );
}

function BranchIcon({ available }: { available: boolean }) {
  return (
    <svg className={styles.branchIcon} data-available={available} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function BranchNavigator({ tree, activeLeafId, onLeafChange, embedded, inline, containerRef, open: openProp, onToggle, hasSession, compact, triggerClassName }: BranchNavigatorProps) {
  const { t } = useI18n();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open || !inline) return;
    const anchor = containerRef?.current ?? buttonRef.current;
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [containerRef, inline, open]);

  const activePathIds = useMemo(() => buildActivePath(tree, activeLeafId), [activeLeafId, tree]);
  const handleSelect = useCallback((id: string) => onLeafChange(id), [onLeafChange]);
  const noBranchReason = !hasSession ? t("i18n.noActiveSession") : !hasBranch(tree) ? t("i18n.noBranches") : null;
  const topLevel = selectTopLevelBranches(tree);
  const hasContent = !noBranchReason && topLevel.length > 0;
  const toggle = () => onToggle ? onToggle() : setOpenInternal((value) => !value);
  const panelContent = hasContent
    ? <BranchTree nodes={topLevel} activePathIds={activePathIds} onSelect={handleSelect} />
    : <div className={styles.branchEmpty}>{noBranchReason ?? t("i18n.noBranches")}</div>;

  if (embedded) return panelContent;

  if (inline) {
    return (
      <div className={styles.branchInline}>
        <HeaderAction ref={buttonRef} className={triggerClassName} onClick={toggle} title={t("i18n.branches")} aria-label={t("i18n.branches")} aria-pressed={open} aria-expanded={open}>
          <span className={styles.branchActionContent}>
            <BranchIcon available={hasContent} />
            {!compact && <span>{t("i18n.branches")}</span>}
          </span>
        </HeaderAction>
        {open && dropdownPosition && (
          <DynamicStyleVars
            className={styles.branchFixedPanel}
            variables={{
              "--ui-animation-origin-y": `${dropdownPosition.top}px`,
              "--ui-animation-origin-x": `${dropdownPosition.left}px`,
              "--ui-panel-width": `${dropdownPosition.width}px`,
            }}
          >
            {panelContent}
          </DynamicStyleVars>
        )}
      </div>
    );
  }

  return (
    <div className={styles.branchNavigator}>
      <button type="button" className={styles.branchHeader} onClick={toggle} aria-expanded={open}>
        <BranchIcon available={hasContent} />
        <span>{t("i18n.branches")}</span>
        <svg className={styles.branchChevron} width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="2 3.5 5 6.5 8 3.5" /></svg>
      </button>
      {open && <div className={styles.branchPanel}>{panelContent}</div>}
    </div>
  );
}
