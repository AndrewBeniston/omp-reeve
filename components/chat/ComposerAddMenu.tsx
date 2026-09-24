"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComposerSuggestionSection, ComposerSuggestion } from "@/lib/composer-intelligence";
import { Menu, MenuItem } from "../ui/Menu";
import { ComposerFloatingGeometry } from "./ComposerFrame";
import { SlashCommandIcon } from "./SlashCommandIcon";
import styles from "./composer-add-menu.module.css";

export function ComposerAddMenu({ sections, onSelect, onAttachImages, onBrowseFiles, childrenFor, onOpen, loading, labels }: {
  onOpen?: () => void;
  loading?: boolean;
  sections: ComposerSuggestionSection[];
  onSelect: (item: ComposerSuggestion) => void;
  onAttachImages: () => void;
  onBrowseFiles?: () => void;
  childrenFor?: (item: ComposerSuggestion) => ComposerSuggestionSection[];
  labels: { add: string; images: string; files: string; goal: string; back?: string; loading?: string; groups: Record<string, string> };
}) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<ComposerSuggestion | null>(null);
  const [page, setPage] = useState<"root" | "files" | "plugins" | "skills">("root");
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
  const commandItems = sections.filter(section => section.id === "commands").flatMap(section => section.items);
  const goal = commandItems.find(item => item.raw === "/goal");
  const visibleSections = parent ? childrenFor?.(parent) ?? []
    : page === "plugins" || page === "skills" ? sections.filter(section => section.id === page)
      : [];
  const goBack = () => { if (parent) setParent(null); else setPage("root"); };
  const pageTitle = page === "files" ? labels.files : page === "plugins" ? labels.groups.plugins : page === "skills" ? labels.groups.skills : labels.add;

  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" className={styles.trigger}
      aria-label={labels.add} title={labels.add} aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setParent(null); setPage("root"); if (!open) onOpen?.(); setOpen(!open); }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M10 3v14M3 10h14" />
      </svg>
    </button>
    {open && <ComposerFloatingGeometry left={geometry.left} bottom={geometry.bottom} maxHeight={geometry.maxHeight} isMobile={false}>
      <div ref={popup} className={styles.popup} data-add-menu-popup>
        <Menu key={parent?.id ?? page} open label={parent?.label ?? pageTitle} onClose={() => setOpen(false)} triggerRef={trigger}
          onKeyDown={event => {
            if (event.key === "Escape" && (parent || page !== "root")) {
              event.preventDefault();
              event.stopPropagation();
              goBack();
            } else if (event.key === "ArrowLeft" && (parent || page !== "root")) {
              event.preventDefault();
              event.stopPropagation();
              goBack();
            }
          }}
          className={styles.menu} surface="plain">
          {loading && <div role="status" className={styles.heading}>{labels.loading}</div>}
          {parent || page !== "root" ? <MenuItem surface="plain" aria-haspopup="menu" className={styles.item} onClick={goBack}>
            <span aria-hidden="true">←</span>{labels.back ?? labels.add}
          </MenuItem> : <>
            <div className={styles.heading}>{labels.add}</div>
            <MenuItem surface="plain" aria-haspopup="menu" className={styles.item}
              icon={<SlashCommandIcon name="paperclip" />} onClick={() => setPage("files")}>
              {labels.files}<span className={styles.chevron} aria-hidden="true">›</span>
            </MenuItem>
            <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="goal" />} disabled={!goal}
              onClick={() => goal && select(() => onSelect(goal))}>
              {labels.goal}
            </MenuItem>
            <MenuItem surface="plain" aria-haspopup="menu" className={styles.item} icon={<SlashCommandIcon name="extension" />} onClick={() => setPage("plugins")}>
              {labels.groups.plugins}<span className={styles.chevron} aria-hidden="true">›</span>
            </MenuItem>
            <MenuItem surface="plain" aria-haspopup="menu" className={styles.item} icon={<SlashCommandIcon name="skill" />} onClick={() => setPage("skills")}>
              {labels.groups.skills}<span className={styles.chevron} aria-hidden="true">›</span>
            </MenuItem>
          </>}
          {page === "files" && <>
            <div className={styles.heading}>{labels.files}</div>
            {onBrowseFiles && <MenuItem surface="plain" className={styles.item}
              icon={<SlashCommandIcon name="folder" />} onClick={() => select(onBrowseFiles)}>{labels.files}</MenuItem>}
            <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="image" />}
              onClick={() => select(onAttachImages)}>{labels.images}</MenuItem>
          </>}
          {visibleSections.map(section => <div key={`${section.id}:${section.title ?? ""}`}>
            {section.showTitle === false ? null : <div className={styles.heading}>{section.title ?? labels.groups[section.id]}</div>}
            {section.items.map(item => <MenuItem key={item.id} surface="plain" className={styles.item}
              aria-haspopup={childrenFor?.(item).length ? "menu" : undefined}
              icon={<SlashCommandIcon name={item.icon} />} onClick={() => {
                if (childrenFor?.(item).length) setParent(item);
                else select(() => onSelect(item));
              }}>
              <span className={styles.label}>{item.label}</span>
              {item.detail && <span className={styles.detail}>{item.detail}</span>}
              {childrenFor?.(item).length ? <span className={styles.chevron} aria-hidden="true">›</span> : null}
            </MenuItem>)}
          </div>)}
        </Menu>
      </div>
    </ComposerFloatingGeometry>}
  </div>;
}
