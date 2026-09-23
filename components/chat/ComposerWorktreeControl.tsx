"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { GitBranch, Plus } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import styles from "./ComposerWorktreeControl.module.css";

export interface ComposerWorktree {
  path: string;
  branch: string | null;
  isMain: boolean;
  isDetached: boolean;
  isDirty: boolean;
}

interface WorktreeResponse {
  isGit?: boolean;
  isTopLevel?: boolean;
  worktrees?: ComposerWorktree[];
  error?: string;
}

function worktreeName(worktree: ComposerWorktree): string {
  return worktree.branch ?? worktree.path.split(/[\\/]/).filter(Boolean).at(-1) ?? worktree.path;
}

export interface ComposerWorktreeControlHandle {
  open: () => void;
}

export const ComposerWorktreeControl = forwardRef<ComposerWorktreeControlHandle, { cwd: string; onSelect: (path: string) => void }>(function ComposerWorktreeControl({ cwd, onSelect }, ref) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worktrees, setWorktrees] = useState<ComposerWorktree[]>([]);
  const [creating, setCreating] = useState(false);
  const [branch, setBranch] = useState("");

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true);
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
  }), []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`, { signal });
      const data = await response.json() as WorktreeResponse;
      if (!response.ok || data.error || !data.isGit || !data.isTopLevel) throw new Error(data.error ?? `HTTP ${response.status}`);
      setWorktrees(data.worktrees ?? []);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const current = worktrees.find((worktree) => worktree.path === cwd) ?? worktrees.find((worktree) => worktree.isMain);
  const label = loading
    ? t("composer.worktree.loading")
    : current?.isDetached || !current?.branch
      ? t("composer.worktree.detached")
      : current.branch;

  const select = async (path: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/worktrees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, path }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setOpen(false);
      onSelect(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const nextBranch = branch.trim();
    if (!nextBranch || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/worktrees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, branch: nextBranch }),
      });
      const data = await response.json() as { path?: string; error?: string };
      if (!response.ok || data.error || !data.path) throw new Error(data.error ?? `HTTP ${response.status}`);
      setCreating(false);
      setBranch("");
      setOpen(false);
      onSelect(data.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.root}>
    <Tooltip content={t("composer.worktree.switch")}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={t("composer.worktree.switch")}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={loading || Boolean(error)}
        onClick={() => setOpen(value => !value)}
      >
        <GitBranch aria-hidden="true" size={14} />
        <span className={styles.label}>{label}</span>
        {current?.isDirty && <span className={styles.dirty} aria-label={t("composer.worktree.dirty")} title={t("composer.worktree.dirty")} />}
      </button>
    </Tooltip>
    <Menu open={open} label={t("composer.worktree.menu")} onClose={() => { if (!busy) setOpen(false); }} triggerRef={triggerRef} className={styles.menu}>
      {worktrees.map((worktree) => <MenuItem
        key={worktree.path}
        role="menuitemradio"
        checked={worktree.path === cwd}
        disabled={busy || worktree.path === cwd}
        onClick={() => void select(worktree.path)}
      >
        <span className={styles.menuLabel}>{worktreeName(worktree)}</span>
        {worktree.isDirty && <span className={styles.dirty} aria-label={t("composer.worktree.dirty")} title={t("composer.worktree.dirty")} />}
      </MenuItem>)}
      {creating ? <div className={styles.createRow}>
        <input aria-label={t("composer.worktree.branch")} value={branch} onChange={event => setBranch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void create(); } }} />
        <MenuItem disabled={busy || !branch.trim()} onClick={() => void create()} icon={<Plus size={14} />}>{t("composer.worktree.create")}</MenuItem>
      </div> : <MenuItem disabled={busy} onClick={() => setCreating(true)} icon={<Plus size={14} />}>{t("composer.worktree.new")}</MenuItem>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Menu>
  </div>;
});
