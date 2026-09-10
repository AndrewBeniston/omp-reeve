"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { DirectoryPicker } from "../DirectoryPicker";
import { Menu, MenuItem } from "../ui/Menu";
import { useI18n } from "@/hooks/useI18n";
import {
  buildProjectChoices,
  filterProjectChoices,
  loadAddedProjectPaths,
  loadRemovedProjectKeys,
  projectEnvironmentFromWorktrees,
  projectLabel,
  rememberAddedProjectPath,
  type ProjectChoice,
  type ProjectEnvironment,
  type ProjectWorktreeResponse,
} from "@/lib/project-selection";
import type { SessionInfo } from "@/lib/types";
import styles from "./project-context-bar.module.css";

declare global {
  interface Window {
    ompDesktop?: {
      selectDirectory?: () => Promise<string | null>;
    };
  }
}

interface SessionsResponse {
  sessions?: SessionInfo[];
  projectOrder?: string[];
  error?: string;
}

async function loadProjectChoices(selectedPath: string | null): Promise<ProjectChoice[]> {
  const response = await fetch("/api/sessions?force=1", { cache: "no-store" });
  const data = await response.json() as SessionsResponse;
  if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
  const storage = typeof window === "undefined" ? null : window.localStorage;
  return buildProjectChoices({
    sessions: data.sessions ?? [],
    addedPaths: loadAddedProjectPaths(storage),
    projectOrder: data.projectOrder ?? [],
    removedProjectKeys: loadRemovedProjectKeys(storage),
    selectedPath,
  });
}

async function validateProjectPath(project: string): Promise<string> {
  const response = await fetch("/api/cwd/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd: project }),
  });
  const data = await response.json() as { cwd?: string; error?: string };
  if (!response.ok || !data.cwd) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data.cwd;
}

export function ProjectContextBar({
  contextLabel,
  projectless,
  selectedPath,
  onProjectSelected,
  onProjectlessSelected,
}: {
  contextLabel: string;
  projectless: boolean;
  selectedPath: string | null;
  onProjectSelected: (path: string) => void;
  onProjectlessSelected: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<ProjectChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserPickerOpen, setBrowserPickerOpen] = useState(false);
  const [environment, setEnvironment] = useState<ProjectEnvironment>({ environment: "Local", branch: null, projectRoot: null });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshChoices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setChoices(await loadProjectChoices(environment.projectRoot ?? selectedPath));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [environment.projectRoot, selectedPath]);

  useEffect(() => {
    if (!open) return;
    void refreshChoices();
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, refreshChoices]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (projectless || !selectedPath) {
      setEnvironment({ environment: "Local", branch: null, projectRoot: null });
      return;
    }
    setEnvironment({ environment: "Local", branch: null, projectRoot: null });
    const controller = new AbortController();
    fetch(`/api/worktrees?cwd=${encodeURIComponent(selectedPath)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as ProjectWorktreeResponse & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        return data;
      })
      .then((data) => setEnvironment(projectEnvironmentFromWorktrees(selectedPath, data)))
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setEnvironment({ environment: "Local", branch: null, projectRoot: null });
        }
      });
    return () => controller.abort();
  }, [projectless, selectedPath]);

  const selectProject = useCallback(async (project: string, remember = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const canonical = await validateProjectPath(project);
      if (remember) rememberAddedProjectPath(window.localStorage, canonical);
      setOpen(false);
      setQuery("");
      onProjectSelected(canonical);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onProjectSelected]);

  const chooseNewProject = useCallback(async () => {
    setOpen(false);
    const selectDirectory = window.ompDesktop?.selectDirectory;
    if (!selectDirectory) {
      setBrowserPickerOpen(true);
      return;
    }
    try {
      const project = await selectDirectory();
      if (project) await selectProject(project, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setOpen(true);
    }
  }, [selectProject]);

  const filteredChoices = useMemo(() => filterProjectChoices(choices, query), [choices, query]);
  const displayLabel = projectless
    ? t("workspace.chooseProjectShort")
    : selectedPath
      ? projectLabel(environment.projectRoot ?? selectedPath)
      : contextLabel;
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      menuRef.current?.querySelector<HTMLElement>("[role='menuitemradio']:not(:disabled)")?.focus();
      return;
    }
    event.stopPropagation();
  };

  return (
    <>
      <div className={styles.projectPicker} ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.contextButton}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={displayLabel}
          onClick={() => setOpen((value) => !value)}
        >
          <FolderIcon data-project-context-icon="folder" />
          <span className={styles.contextValue}>{displayLabel}</span>
        </button>
        <Menu
          open={open}
          label={t("workspace.chooseContext")}
          onClose={() => setOpen(false)}
          triggerRef={triggerRef}
          className={styles.projectMenu}
        >
          <div className={styles.searchRow}>
            <SearchIcon />
            <input
              ref={searchRef}
              className={styles.searchInput}
              value={query}
              placeholder={t("workspace.searchProjects")}
              aria-label={t("workspace.searchProjects")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={styles.projectList}>
            {loading ? (
              <div className={styles.menuState} role="status">{t("workspace.loadingProjects")}</div>
            ) : loadError ? (
              <div className={styles.loadFailure} role="alert">
                <span>{t("workspace.projectsUnavailable")}</span>
                <button type="button" className={styles.retryButton} onClick={() => void refreshChoices()}>
                  {t("workspace.retryProjects")}
                </button>
              </div>
            ) : filteredChoices.length > 0 ? (
              filteredChoices.map((choice) => (
                <MenuItem
                  key={choice.id}
                  role="menuitemradio"
                  checked={choice.selected}
                  disabled={busy}
                  icon={<FolderIcon />}
                  className={styles.projectItem}
                  title={choice.path}
                  onClick={() => void selectProject(choice.path)}
                >
                  <span className={styles.projectChoiceContent}>
                    <span className={styles.projectChoiceLabel}>{choice.label}</span>
                    {choice.label !== choice.slug && (
                      <span className={styles.projectChoiceSlug}>{choice.slug}</span>
                    )}
                  </span>
                  {choice.selected && <CheckIcon />}
                </MenuItem>
              ))
            ) : (
              <div className={styles.menuState}>
                {query ? t("sidebar.noMatchingProjects") : t("workspace.noProjects")}
              </div>
            )}
          </div>
          <div className={styles.separator} />
          <MenuItem icon={<PlusIcon />} disabled={busy} onClick={() => void chooseNewProject()}>
            {t("workspace.newProject")}
          </MenuItem>
          <MenuItem
            icon={<ClearIcon />}
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setQuery("");
              onProjectlessSelected();
            }}
          >
            {t("workspace.noProject")}
          </MenuItem>
          {error && <div className={styles.menuError} role="alert">{error}</div>}
        </Menu>
      </div>
      {!projectless && selectedPath && (
        <div className={styles.contextMetadata} aria-label={t("workspace.projectEnvironment")}>
          <span className={styles.contextMetadataItem}>
            <LocalIcon />
            {t(environment.environment === "Worktree" ? "workspace.worktree" : "workspace.local")}
          </span>
          {environment.branch && (
            <span className={styles.contextMetadataItem}><BranchIcon />{environment.branch}</span>
          )}
        </div>
      )}
      {browserPickerOpen && (
        <DirectoryPicker
          busy={busy}
          error={error}
          onCancel={() => setBrowserPickerOpen(false)}
          onSelect={(path) => {
            setBrowserPickerOpen(false);
            void selectProject(path, true);
          }}
        />
      )}
    </>
  );
}

function SvgIcon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

function FolderIcon(props: { "data-project-context-icon"?: string } = {}) {
  return (
    <svg {...props} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.8 4h4l1.4 1.5h7v7H1.8z" />
    </svg>
  );
}
function SearchIcon() { return <SvgIcon><circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3 3" /></SvgIcon>; }
function PlusIcon() { return <SvgIcon><path d="M8 2.5v11M2.5 8h11" /></SvgIcon>; }
function ClearIcon() { return <SvgIcon><path d="m3.5 3.5 9 9m0-9-9 9" /></SvgIcon>; }
function CheckIcon() { return <SvgIcon><path d="m3 8.2 3 3 7-7" /></SvgIcon>; }
function LocalIcon() { return <SvgIcon><rect x="2" y="3" width="12" height="8" rx="1.2" /><path d="M5 13h6" /></SvgIcon>; }
function BranchIcon() { return <SvgIcon><circle cx="4" cy="3.5" r="1.2" /><circle cx="4" cy="12.5" r="1.2" /><circle cx="12" cy="4.5" r="1.2" /><path d="M4 4.7v6.6M5.2 8.2h2.1A4.7 4.7 0 0 0 12 5.7" /></SvgIcon>; }
