"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { SessionInfo } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { Dialog } from "../ui/Dialog";
import { SlashCommandIcon } from "../chat/SlashCommandIcon";
import styles from "./command-palette.module.css";

export interface PaletteAction {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  icon?: string;
  run: () => void;
}

export function CommandPalette({ actions, onSelectSession, onClose, fileSearchCwd, onOpenFile, onBack }: {
  onBack?: () => void;
  fileSearchCwd?: string;
  onOpenFile?: (path: string) => void;
  actions: PaletteAction[];
  onSelectSession: (session: SessionInfo) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const id = useId();
  useEffect(() => {
    if (fileSearchCwd) return;
    const controller = new AbortController();
    fetch("/api/sessions", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        if (!controller.signal.aborted) setSessions(data.sessions ?? []);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fileSearchCwd]);
  useEffect(() => {
    if (!fileSearchCwd) return;
    const controller = new AbortController();
    setLoading(true); setError(false); setFiles([]);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ cwd: fileSearchCwd });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/file-index?${params}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error(String(response.status));
          const data = await response.json();
          if (!controller.signal.aborted) setFiles(data.matches
            ? data.matches.filter((item: { isDir: boolean }) => !item.isDir).map((item: { path: string }) => item.path)
            : data.files ?? []);
        })
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fileSearchCwd, query]);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => terms.every(term => text.toLocaleLowerCase().includes(term));
  const chats: PaletteAction[] = [...sessions]
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified))
    .filter(session => matches(`${session.name ?? ""} ${session.firstMessage} ${session.projectRoot ?? session.cwd}`))
    .slice(0, query.trim() ? 50 : 7)
    .map(session => ({
      id: `chat:${session.id}`,
      label: session.name?.trim() || session.firstMessage?.trim() || t("sidebar.newChat"),
      group: t(query.trim() ? "commandMenu.chats" : "quickChat.recent"),
      shortcut: (session.projectRoot ?? session.cwd).split("/").filter(Boolean).at(-1),
      run: () => onSelectSession(session),
    }));
  const rows = fileSearchCwd ? files.slice(0, 100).map(path => ({
    id: `file:${path}`, label: path, group: t("composer.autocomplete.files"), shortcut: undefined,
    run: () => onOpenFile?.(`${fileSearchCwd.replace(/[\\/]$/, "")}/${path}`),
  })) : [...chats, ...actions.filter(action => matches(`${action.label} ${action.group}`))];
  const selectedIndex = rows.findIndex(row => row.id === activeId);
  const current = selectedIndex >= 0 ? selectedIndex : Math.min(active, Math.max(0, rows.length - 1));
  const highlight = (index: number) => {
    setActive(index);
    setActiveId(rows[index]?.id ?? null);
  };
  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);
  const select = (row: PaletteAction) => { onClose(); row.run(); };
  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    let next: number;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (fileSearchCwd && onBack) onBack(); else onClose();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); event.stopPropagation(); onClose(); return;
    }
    if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      if (rows[current]) select(rows[current]);
      return;
    }
    switch (event.key) {
      case "ArrowDown": next = rows.length ? (current + 1) % rows.length : 0; break;
      case "ArrowUp": next = rows.length ? (current + rows.length - 1) % rows.length : 0; break;
      case "Tab": next = rows.length ? (current + (event.shiftKey ? rows.length - 1 : 1)) % rows.length : 0; break;
      case "Home": next = 0; break;
      case "End": next = rows.length - 1; break;
      case "PageDown": next = Math.min(rows.length - 1, current + 8); break;
      case "PageUp": next = Math.max(0, current - 8); break;
      default: return;
    }
    event.preventDefault(); event.stopPropagation();
    highlight(Math.max(0, next));
    input.current?.focus({ preventScroll: true });
  };

  return <Dialog open title={t("commandMenu.title")} initialFocus={input} onOpenChange={open => { if (!open) onClose(); }}
    className={styles.dialog}>
    <div onKeyDown={handleKeyboard}>
    <input ref={input} className={styles.search} placeholder={t(fileSearchCwd ? "commandMenu.files" : "commandMenu.search")}
      aria-label={t(fileSearchCwd ? "commandMenu.files" : "commandMenu.search")} role="combobox" aria-expanded="true" aria-controls={id}
      aria-activedescendant={rows[current] ? `${id}-${current}` : undefined}
      value={query} onChange={event => { setQuery(event.target.value); setActive(0); setActiveId(null); }} />
    <div ref={list} id={id} role="listbox" aria-label={t("commandMenu.results")} className={styles.results}>
      {loading && <p role="status">{t("composer.autocomplete.loading")}</p>}
      {error && <p role="alert">{t("commandMenu.error")}</p>}
      {!loading && rows.length === 0 && <p>{t("composer.autocomplete.noResults")}</p>}
      {rows.map((row, index) => <div key={row.id}>
        {(index === 0 || rows[index - 1].group !== row.group) && <div className={styles.heading}>{row.group}</div>}
        <button type="button" role="option" id={`${id}-${index}`} data-index={index}
          aria-selected={current === index} tabIndex={-1} className={styles.row}
          onFocus={() => highlight(index)}
          onMouseMove={event => {
            const previous = pointer.current;
            if (previous?.x === event.clientX && previous.y === event.clientY) return;
            pointer.current = { x: event.clientX, y: event.clientY };
            highlight(index);
          }} onClick={() => select(row)}>
          <span className={styles.icon} aria-hidden="true">
            {row.id.startsWith("chat:") ? null : <SlashCommandIcon name={"icon" in row ? row.icon : "file"} />}
          </span>
          <span className={styles.label}>{row.label}</span>
          {row.shortcut && <span className={styles.detail}>{row.shortcut}</span>}
        </button>
      </div>)}
    </div>
    </div>
  </Dialog>;
}
