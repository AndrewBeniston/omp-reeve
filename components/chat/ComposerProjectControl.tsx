"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Folder } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  buildProjectChoices,
  filterProjectChoices,
  loadAddedProjectPaths,
  loadRemovedProjectKeys,
  projectLabel,
  type ProjectChoice,
} from "@/lib/project-selection";
import type { SessionInfo } from "@/lib/types";
import styles from "./ComposerProjectControl.module.css";

interface SessionsResponse {
  sessions?: SessionInfo[];
  projectOrder?: string[];
  error?: string;
}

async function loadProjectChoices(selectedPath: string): Promise<ProjectChoice[]> {
  const response = await fetch("/api/sessions?force=1", { cache: "no-store" });
  const data = await response.json() as SessionsResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return buildProjectChoices({
    sessions: data.sessions ?? [],
    addedPaths: loadAddedProjectPaths(window.localStorage),
    projectOrder: data.projectOrder ?? [],
    removedProjectKeys: loadRemovedProjectKeys(window.localStorage),
    selectedPath,
  });
}

async function validateProjectPath(path: string): Promise<string> {
  const response = await fetch("/api/cwd/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd: path }),
  });
  const data = await response.json() as { cwd?: string; error?: string };
  if (!response.ok || !data.cwd) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data.cwd;
}

export interface ComposerProjectControlHandle {
  open: () => void;
}

export const ComposerProjectControl = forwardRef<ComposerProjectControlHandle, {
  selectedPath: string;
  onSelect: (path: string) => void;
}>(function ComposerProjectControl({ selectedPath, onSelect }, ref) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<ProjectChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadProjectChoices(selectedPath)
      .then(setChoices)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, selectedPath]);

  const select = useCallback(async (path: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const canonical = await validateProjectPath(path);
      setOpen(false);
      onSelect(canonical);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, onSelect]);

  const filteredChoices = useMemo(() => filterProjectChoices(choices, query), [choices, query]);
  return <div className={styles.root}>
    <Tooltip content={t("composer.project.tooltip")}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={t("composer.project.tooltip")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <Folder aria-hidden="true" size={14} />
        <span className={styles.label}>{projectLabel(selectedPath)}</span>
      </button>
    </Tooltip>
    <Menu open={open} label={t("composer.project.menu")} onClose={() => setOpen(false)} triggerRef={triggerRef} className={styles.menu}>
      <div className={styles.searchRow}>
        <input
          value={query}
          aria-label={t("composer.project.search")}
          placeholder={t("composer.project.search")}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => event.stopPropagation()}
        />
      </div>
      {loading && <p className={styles.state}>{t("composer.project.loading")}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && filteredChoices.length === 0 && !error && <p className={styles.state}>{t("composer.project.empty")}</p>}
      {filteredChoices.map(choice => <MenuItem
        key={choice.id}
        role="menuitemradio"
        checked={choice.selected}
        disabled={busy}
        icon={<Folder size={14} />}
        onClick={() => void select(choice.path)}
      >
        {choice.label}
      </MenuItem>)}
      <MenuItem disabled title={t("composer.project.cloudReason")}>
        <span className={styles.unavailableLabel}>{t("composer.project.cloud")}</span>
        <span className={styles.reason}>{t("composer.project.cloudReason")}</span>
      </MenuItem>
      <MenuItem disabled title={t("composer.project.remoteReason")}>
        <span className={styles.unavailableLabel}>{t("composer.project.remote")}</span>
        <span className={styles.reason}>{t("composer.project.remoteReason")}</span>
      </MenuItem>
    </Menu>
  </div>;
});
