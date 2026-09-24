"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComposerSuggestionSection, ComposerSuggestion } from "@/lib/composer-intelligence";
import { Menu, MenuItem } from "../ui/Menu";
import { ComposerFloatingGeometry } from "./ComposerFrame";
import { SlashCommandIcon } from "./SlashCommandIcon";
import styles from "./composer-add-menu.module.css";

interface ComposerAddMenuLabels {
  add: string;
  images: string;
  files: string;
  folder: string;
  planMode: string;
  voiceChat: string;
  unavailable: string;
  keyboardEquivalent?: string;
  back?: string;
  loading?: string;
  groups?: Record<string, string>;
}

export function ComposerAddMenu({
  sections,
  onSelect,
  onAttachImages,
  onBrowseFiles,
  onBrowseFolder,
  folderDisabledReason,
  onPlanMode,
  childrenFor,
  onOpen,
  loading,
  labels,
}: {
  onOpen?: () => void;
  loading?: boolean;
  sections: ComposerSuggestionSection[];
  onSelect: (item: ComposerSuggestion) => void;
  onAttachImages: () => void;
  onBrowseFiles?: () => void;
  onBrowseFolder?: () => void;
  folderDisabledReason?: string | null;
  onPlanMode: () => void;
  childrenFor?: (item: ComposerSuggestion) => ComposerSuggestionSection[];
  labels: ComposerAddMenuLabels;
}) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<ComposerSuggestion | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ left: 8, bottom: 8, maxHeight: 360 });

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const anchor = trigger.current;
    const measure = () => {
      if (typeof anchor.getBoundingClientRect !== "function") return;
      const rect = anchor.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const popupWidth = Math.min(320, Math.max(0, viewportWidth - 16));
      setGeometry({
        left: Math.max(8, Math.min(rect.left, viewportWidth - popupWidth - 8)),
        bottom: Math.max(8, viewportHeight - rect.top + 6),
        maxHeight: Math.max(0, Math.min(360, rect.top - 8, viewportHeight * 0.6)),
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(anchor);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const select = (action: () => void) => {
    setOpen(false);
    action();
  };
  const parkedAction = /^(add remote files|sketch|attach appshot|pull request|shared chat|sites|browser annotation)$/i;
  const visibleSections = (parent ? childrenFor?.(parent) ?? [] : sections)
    .map(section => ({
      ...section,
      // Plan mode has its own row. Model and effort live in the model chip.
      items: section.items.filter(item => !["/plan", "/model", "/reasoning"].includes(item.raw ?? "") && !parkedAction.test(item.label)),
    }))
    .filter(section => section.items.length > 0);
  const folderDisabled = Boolean(folderDisabledReason || !onBrowseFolder);
  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "ArrowLeft") {
      if (!parent) return;
      event.preventDefault();
      event.stopPropagation();
      setParent(null);
      return;
    }
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"));
    const current = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Enter" || event.key === " ") {
      if (current < 0 || rows[current].getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      rows[current]?.click();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    let next: number;
    if (event.key === "ArrowDown") next = current < rows.length - 1 ? current + 1 : 0;
    else if (event.key === "ArrowUp") next = current > 0 ? current - 1 : rows.length - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    rows[next]?.focus();
  };

  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" className={styles.trigger}
      aria-label={labels.add} title={labels.add} aria-keyshortcuts={labels.keyboardEquivalent}
      aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setParent(null); if (!open) onOpen?.(); setOpen(!open); }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M10 3v14M3 10h14" />
      </svg>
      <span className={styles.keyboardEquivalent} aria-hidden="true">{labels.keyboardEquivalent}</span>
    </button>
    {open && <ComposerFloatingGeometry left={geometry.left} bottom={geometry.bottom} maxHeight={geometry.maxHeight} isMobile={false}>
      <div ref={popup} className={styles.popup} data-add-menu-popup>
        <Menu key={parent?.id ?? "root"} open label={parent?.label ?? labels.add} onClose={() => setOpen(false)} triggerRef={trigger}
          onKeyDown={moveFocus} className={styles.menu} surface="plain">
          {loading && <div role="status" className={styles.heading}>{labels.loading}</div>}
          {parent ? <MenuItem surface="plain" className={styles.item} onClick={() => setParent(null)}>
            <span aria-hidden="true">←</span>{labels.back ?? labels.add}
          </MenuItem> : <>
            <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="image" />}
              onClick={() => select(onAttachImages)}>
              <span className={styles.label}>{labels.images}</span>
            </MenuItem>
            <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="file" />}
              aria-disabled={!onBrowseFiles || undefined} data-disabled={!onBrowseFiles || undefined}
              aria-description={!onBrowseFiles ? labels.unavailable : undefined}
              onClick={() => onBrowseFiles && select(onBrowseFiles)}>
              <span className={styles.row}>
                <span className={styles.label}>{labels.files}</span>
                {!onBrowseFiles && <span className={styles.status}>{labels.unavailable}</span>}
              </span>
            </MenuItem>
            <MenuItem aria-disabled={folderDisabled || undefined}
              aria-description={folderDisabledReason ?? undefined} data-disabled={folderDisabled || undefined} surface="plain" className={styles.item}
              icon={<SlashCommandIcon name="folder" />} onClick={() => {
                if (!folderDisabled && onBrowseFolder) select(onBrowseFolder);
              }}>
              <span className={styles.row}>
                <span className={styles.label}>{labels.folder}</span>
                {folderDisabled && folderDisabledReason && <span className={styles.reason}>{folderDisabledReason}</span>}
                {folderDisabled && <span className={styles.status}>{labels.unavailable}</span>}
              </span>
            </MenuItem>
            <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="plan" />}
              onClick={() => select(onPlanMode)}>
              <span className={styles.label}>{labels.planMode}</span>
            </MenuItem>
            <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="voice" />}
              aria-disabled="true" data-disabled="true" aria-description={labels.unavailable}>
              <span className={styles.row}>
                <span className={styles.label}>{labels.voiceChat}</span>
                <span className={styles.status}>{labels.unavailable}</span>
              </span>
            </MenuItem>
          </>}
          {visibleSections.map(section => <div key={`${section.id}:${section.title ?? ""}`}>
            {section.showTitle === false ? null : <div className={styles.heading}>{section.title ?? labels.groups?.[section.id]}</div>}
            {section.items.map(item => {
              const children = childrenFor?.(item) ?? [];
              return <MenuItem key={item.id} surface="plain" className={styles.item}
                aria-haspopup={children.length ? "menu" : undefined}
                icon={<SlashCommandIcon name={item.icon} />} onClick={() => {
                  if (children.length) setParent(item);
                  else select(() => onSelect(item));
                }}>
                <span className={styles.label}>{item.label}</span>
                {item.detail && <span className={styles.detail}>{item.detail}</span>}
                {children.length ? <span className={styles.chevron} aria-hidden="true">›</span> : null}
              </MenuItem>;
            })}
          </div>)}
        </Menu>
      </div>
    </ComposerFloatingGeometry>}
  </div>;
}
