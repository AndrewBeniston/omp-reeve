"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { useI18n } from "@/hooks/useI18n";
import styles from "./navigation/navigation.module.css";

interface DirectoryEntry {
  name: string;
  path: string;
}

interface BrowseResponse {
  path?: string;
  parentPath?: string | null;
  directories?: DirectoryEntry[];
  drives?: DirectoryEntry[];
  error?: string;
}

async function loadDirectories(directory?: string): Promise<BrowseResponse> {
  const query = directory ? `?path=${encodeURIComponent(directory)}` : "";
  const response = await fetch(`/api/cwd/browse${query}`);
  const data = await response.json() as BrowseResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function FolderIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M1.5 3h4l1.5 2h7.5v7.5h-13z" /></svg>;
}

function DriveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 9h12" />
      <circle cx="11.5" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function isWindowsDriveRoot(directory: string): boolean {
  return /^[a-zA-Z]:[\\/]?$/.test(directory);
}

export interface DirectoryPickerProps {
  onCancel: () => void;
  onSelect: (path: string) => void;
  busy?: boolean;
  error?: string | null;
}

export function DirectoryPicker({ onCancel, onSelect, busy = false, error }: DirectoryPickerProps) {
  const { t } = useI18n();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const [parentDirectory, setParentDirectory] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [drives, setDrives] = useState<DirectoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const navigateTo = useCallback(async (directory?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadDirectories(directory);
      const nextPath = data.path ?? directory ?? "/";
      setCurrentPath(nextPath);
      setParentDirectory(data.parentPath ?? null);
      setPathInput(nextPath);
      setDirectories(data.directories ?? []);
      setDrives(data.drives ?? null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPortalTarget(document.body);
    void navigateTo();
  }, [navigateTo]);

  const handlePathSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = pathInput.trim();
    if (candidate) void navigateTo(candidate);
  };
  const hasUncommittedPath = pathInput.trim() !== currentPath;
  const canSelect = Boolean(currentPath) && !hasUncommittedPath && !busy;
  const canNavigateUp = Boolean(parentDirectory) || isWindowsDriveRoot(currentPath);

  if (!portalTarget) return null;

  return createPortal(
    <Dialog
      open
      title={t("directoryPicker.selectDirectory")}
      size="md"
      dismissible={!busy}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      className={styles.directoryPicker}
    >
      <IconButton className={styles.directoryPickerClose} label={t("i18n.close")} onClick={onCancel} disabled={busy}>
        <span aria-hidden="true">×</span>
      </IconButton>

      <form onSubmit={handlePathSubmit} className={styles.directoryPickerPathForm}>
        <IconButton
          className={styles.directoryPickerBack}
          label={t("directoryPicker.goToParent")}
          onClick={() => void navigateTo(parentDirectory ?? undefined)}
          disabled={loading || !canNavigateUp}
          size="md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
        </IconButton>
        <label htmlFor="directory-path"><VisuallyHidden>{t("directoryPicker.directoryPath")}</VisuallyHidden></label>
        <input
          className={styles.directoryPickerPath}
          id="directory-path"
          type="text"
          value={pathInput}
          placeholder="/path/to/project or ~/project"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setPathInput(event.target.value);
            setLoadError(null);
          }}
        />
        <Button type="submit" disabled={loading || !pathInput.trim()} size="md">{t("directoryPicker.go")}</Button>
      </form>

      <div className={styles.directoryPickerList}>
        {loading ? (
          <div className={styles.navigationEmpty}>{t("directoryPicker.loadingDirectories")}</div>
        ) : drives !== null ? (
          drives.length > 0 ? drives.map((drive) => (
            <button key={drive.path} className={styles.directoryPickerEntry} type="button" onClick={() => void navigateTo(drive.path)} title={drive.path}>
              <DriveIcon />
              <span>{drive.name}</span>
            </button>
          )) : <div className={styles.navigationEmpty}>{t("directoryPicker.noDrives")}</div>
        ) : directories.length > 0 ? (
          directories.map((entry) => (
            <button key={entry.path} className={styles.directoryPickerEntry} type="button" onClick={() => void navigateTo(entry.path)} title={entry.path}>
              <FolderIcon />
              <span className={styles.ellipsis}>{entry.name}</span>
            </button>
          ))
        ) : <div className={styles.navigationEmpty}>{t("directoryPicker.noSubdirectories")}</div>}
        {(loadError || error) && <div role="alert" className={styles.navigationError}>{loadError ?? error}</div>}
      </div>

      <div className={styles.directoryPickerFooter}>
        <Button onClick={onCancel} disabled={busy} tone="ghost">{t("i18n.cancel")}</Button>
        <Button
          onClick={() => onSelect(currentPath)}
          disabled={!canSelect}
          tone="primary"
          title={hasUncommittedPath ? t("directoryPicker.openBeforeSelecting") : t("directoryPicker.selectCurrentDirectory")}
        >
          {busy ? t("i18n.checking") : t("directoryPicker.selectThisFolder")}
        </Button>
      </div>
    </Dialog>,
    portalTarget,
  );
}
