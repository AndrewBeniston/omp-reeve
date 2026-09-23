"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { projectEnvironmentFromWorktrees, type ProjectWorktreeResponse } from "@/lib/project-selection";
import styles from "./fork-dialog.module.css";

export interface ForkDialogProps {
  open: boolean;
  onClose: () => void;
  entryId?: string;
  cwd?: string;
  isWorktree?: boolean;
  isGit?: boolean;
  projectRoot?: string;
  onForkLocal: () => Promise<boolean | { forked: boolean; error?: string } | void>;
  onForkWorktree: (worktreePath: string) => Promise<boolean | { forked: boolean; error?: string } | void>;
  onCreateWorktree?: (cwd: string, branch: string) => Promise<{ path: string; branch: string }>;
  onRemoveWorktree?: (cwd: string, path: string) => Promise<void>;
  generateBranchName?: () => string;
}

export function ForkDialog({
  open,
  onClose,
  entryId,
  cwd,
  isWorktree: propIsWorktree,
  isGit: propIsGit,
  projectRoot: propProjectRoot,
  onForkLocal,
  onForkWorktree,
  onCreateWorktree,
  onRemoveWorktree,
  generateBranchName,
}: ForkDialogProps) {
  const { t } = useI18n();
  const firstRowRef = useRef<HTMLButtonElement>(null);

  const [resolvedIsWorktree, setResolvedIsWorktree] = useState<boolean>(propIsWorktree ?? false);
  const [resolvedIsGit, setResolvedIsGit] = useState<boolean>(propIsGit ?? true);
  const [busy, setBusy] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [forkError, setForkError] = useState<string | null>(null);

  useEffect(() => {
    if (propIsWorktree !== undefined) setResolvedIsWorktree(propIsWorktree);
  }, [propIsWorktree]);

  useEffect(() => {
    if (propIsGit !== undefined) setResolvedIsGit(propIsGit);
  }, [propIsGit]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setWorktreeError(null);
      setForkError(null);
      return;
    }

    if (cwd && (propIsWorktree === undefined || propIsGit === undefined)) {
      const controller = new AbortController();
      fetch(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as ProjectWorktreeResponse;
          const env = projectEnvironmentFromWorktrees(cwd, data);
          if (propIsWorktree === undefined) {
            setResolvedIsWorktree(env.environment === "Worktree");
          }
          if (propIsGit === undefined) {
            setResolvedIsGit(Boolean(data.isGit));
          }
        })
        .catch(() => {});
      return () => controller.abort();
    }
  }, [open, cwd, propIsWorktree, propIsGit]);

  const defaultBranchGenerator = () => {
    const stamp = Date.now();
    const tag = entryId ? `-${entryId.slice(0, 8)}` : "";
    return `codex/fork${tag}-${stamp}`;
  };

  const handleLocalClick = async () => {
    if (busy) return;
    setBusy(true);
    setWorktreeError(null);
    setForkError(null);
    try {
      const res = await onForkLocal();
      if (res && typeof res === "object" && "forked" in res && !res.forked) {
        setForkError(res.error || t("threadHeader.forkThreadError"));
        return;
      }
      onClose();
    } catch (err) {
      setForkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleWorktreeClick = async () => {
    if (busy || !resolvedIsGit) return;
    setBusy(true);
    setWorktreeError(null);
    setForkError(null);

    const makeBranch = generateBranchName ?? defaultBranchGenerator;
    const branch = makeBranch();
    const targetCwd = cwd || "";

    let createdPath: string | null = null;
    try {
      if (onCreateWorktree) {
        const created = await onCreateWorktree(targetCwd, branch);
        createdPath = created.path;
      } else {
        const res = await fetch("/api/worktrees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd: targetCwd, branch }),
        });
        const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
        if (!res.ok || data.error || !data.path) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        createdPath = data.path;
      }
    } catch (wtErr) {
      setWorktreeError(wtErr instanceof Error ? wtErr.message : String(wtErr));
      setBusy(false);
      return;
    }

    try {
      const res = await onForkWorktree(createdPath);
      if (res && typeof res === "object" && "forked" in res && !res.forked) {
        throw new Error(res.error || t("threadHeader.forkThreadError"));
      }
      onClose();
    } catch (fErr) {
      if (createdPath) {
        try {
          if (onRemoveWorktree) {
            await onRemoveWorktree(targetCwd, createdPath);
          } else {
            await fetch("/api/worktrees", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cwd: targetCwd, path: createdPath, force: true }),
            });
          }
        } catch (cleanupErr) {
          console.error("Failed to remove worktree after fork failure:", cleanupErr);
        }
      }
      setForkError(fErr instanceof Error ? fErr.message : String(fErr));
    } finally {
      setBusy(false);
    }
  };

  const localLabel = resolvedIsWorktree
    ? t("localConversation.forkFromOlderTurnDialog.local.label")
    : t("localConversation.forkFromOlderTurnDialog.local.workspaceLabel");

  const localDescription = resolvedIsWorktree
    ? t("localConversation.forkFromOlderTurnDialog.local.sameWorktreeDescription")
    : t("localConversation.forkFromOlderTurnDialog.local.description");

  const worktreeLabel = t("localConversation.forkFromOlderTurnDialog.worktree.label");

  const worktreeDescription = resolvedIsGit
    ? t("localConversation.forkFromOlderTurnDialog.worktree.description")
    : t("localConversation.forkFromOlderTurnDialog.worktree.blockedDescription");

  return (
    <Dialog
      open={open}
      title={t("localConversation.forkFromOlderTurnDialog.title")}
      size="md"
      dismissible={!busy}
      initialFocus={firstRowRef}
      className={styles.dialog}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <div className={styles.destinations}>
        <button
          ref={firstRowRef}
          type="button"
          disabled={busy}
          className={styles.destinationRow}
          onClick={handleLocalClick}
        >
          <span className={styles.destinationLabel}>{localLabel}</span>
          <span className={styles.destinationDescription}>{localDescription}</span>
        </button>

        <button
          type="button"
          disabled={busy || !resolvedIsGit}
          className={styles.destinationRow}
          onClick={handleWorktreeClick}
        >
          <span className={styles.destinationLabel}>{worktreeLabel}</span>
          <span className={styles.destinationDescription}>{worktreeDescription}</span>
        </button>
      </div>

      {worktreeError ? (
        <div role="alert" className={styles.error}>
          {t("threadHeader.forkWorktreeError")}: {worktreeError}
        </div>
      ) : null}

      {forkError ? (
        <div role="alert" className={styles.error}>
          {t("threadHeader.forkThreadError")}: {forkError}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          type="button"
          tone="neutral"
          size="md"
          disabled={busy}
          onClick={onClose}
        >
          {t("chat.cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
