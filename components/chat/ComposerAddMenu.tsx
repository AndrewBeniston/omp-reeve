"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import type { ComposerSuggestionSection, ComposerSuggestion } from "@/lib/composer-intelligence";
import { Menu, MenuItem } from "../ui/Menu";
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
  labels: { add: string; images: string; files: string; moreCommands?: string; back?: string; loading?: string; groups: Record<string, string> };
}) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<ComposerSuggestion | null>(null);
  const [page, setPage] = useState<"root" | "files" | "commands">("root");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [geometry, setGeometry] = useState({ left: 0, bottom: 0, width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = root.current?.closest("form") ?? root.current;
    if (!anchor) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(rect.width, Math.max(0, window.innerWidth - 16));
      setGeometry({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        width,
        height: Math.max(0, Math.min(420, rect.top - 14)),
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
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const select = (action: () => void) => {
    setOpen(false);
    action();
  };
  const contextual = (item: ComposerSuggestion) => ["/project", "/goal", "/plan"].includes(item.raw);
  const commandItems = sections.filter(section => section.id === "commands").flatMap(section => section.items);
  const generalCommands = commandItems.filter(item => !contextual(item));
  const rootSections: ComposerSuggestionSection[] = [
    { id: "commands" as const, showTitle: false, items: commandItems.filter(contextual) },
    ...sections.filter(section => section.id !== "commands"),
  ].filter(section => section.items.length > 0);
  const visibleSections = parent ? childrenFor?.(parent) ?? []
    : page === "commands" ? [{ id: "commands" as const, items: generalCommands }]
      : page === "files" ? [] : rootSections;
  const goBack = () => { if (parent) setParent(null); else setPage("root"); };
  const pageTitle = page === "files" ? labels.files : page === "commands" ? labels.groups.commands : labels.add;

  return <div ref={root} className={styles.root}>
    <button ref={trigger} type="button" className={styles.trigger}
      aria-label={labels.add} title={labels.add} aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setParent(null); setPage("root"); if (!open) onOpen?.(); setOpen(!open); }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M10 3v14M3 10h14" />
      </svg>
    </button>
    {open && <DynamicStyleVars className={styles.geometry} variables={{
      "--ui-animation-origin-x": `${geometry.left}px`,
      "--ui-animation-origin-y": `${geometry.bottom}px`,
      "--ui-panel-width": `${geometry.width}px`,
      "--ui-scroll-offset": `${geometry.height}px`,
    }}><Menu key={parent?.id ?? page} open label={parent?.label ?? pageTitle} onClose={() => setOpen(false)} triggerRef={trigger}
      onKeyDown={event => {
        if ((parent || page !== "root") && (event.key === "Escape" || event.key === "ArrowLeft")) {
          event.preventDefault();
          event.stopPropagation();
          goBack();
        }
      }}
      className={styles.menu} surface="plain">
      {loading && <div role="status" className={styles.heading}>{labels.loading}</div>}
      {parent || page !== "root" ? <MenuItem surface="plain" aria-haspopup="menu" className={styles.item} onClick={goBack}>
        <span aria-hidden="true">←</span>{parent ? pageTitle : labels.back ?? labels.add}
      </MenuItem> : <>
      <div className={styles.heading}>{labels.add}</div>
      <MenuItem surface="plain" aria-haspopup="menu" className={styles.item}
        icon={<SlashCommandIcon name="paperclip" />} onClick={() => setPage("files")}>
        {labels.files}<span className={styles.chevron} aria-hidden="true">›</span>
      </MenuItem>
      </>}
      {page === "files" && <>
      <div className={styles.heading}>{labels.files}</div>
      {onBrowseFiles && <MenuItem surface="plain" className={styles.item}
        icon={<SlashCommandIcon name="folder" />} onClick={() => select(onBrowseFiles)}>{labels.files}</MenuItem>}
      <MenuItem surface="plain" className={styles.item} icon={<SlashCommandIcon name="image" />}
        onClick={() => select(onAttachImages)}>{labels.images}</MenuItem>
      </>}
      {visibleSections.map(section => <div key={section.id}>
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
      {!parent && page === "root" && generalCommands.length > 0 && <MenuItem surface="plain" aria-haspopup="menu"
        className={styles.item} icon={<SlashCommandIcon name="action" />} onClick={() => setPage("commands")}>
        {labels.moreCommands ?? labels.groups.commands}<span className={styles.chevron} aria-hidden="true">›</span>
      </MenuItem>}
    </Menu></DynamicStyleVars>}
  </div>;
}
