"use client";

import { forwardRef, useState, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { getFileIcon, FolderIcon } from "./FileIcons";
import {
  encodeFilePathForApi,
  getFileDirectory,
  getFileName,
  getRelativeFilePath,
  joinFilePath,
  normalizeFilePathSlashes,
} from "@/lib/file-paths";
import type { GitFileStatus, GitFileStatusKind, GitStatusResponse } from "@/lib/git-types";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/Button";
import { DynamicStyleVars } from "@/components/ui/DynamicStyleVars";
import { IconButton } from "@/components/ui/IconButton";
import styles from "./navigation/navigation.module.css";
type Translate = ReturnType<typeof useI18n>["t"];

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface FileNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  children?: FileNode[];
  loaded?: boolean;
}

interface Props {
  cwd: string;
  onOpenFile: (filePath: string, fileName: string, options?: OpenFileOptions) => void;
  refreshKey?: number;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  onAtMentions?: (relativePaths: string[]) => void;
  onUploadBusyChange?: (busy: boolean) => void;
  changesCollapsed: boolean;
  onChangesCountChange?: (count: number) => void;
}

export interface FileExplorerHandle {
  openUploadPicker: () => void;
}

type UploadPhase = "idle" | "checking" | "uploading";
type UploadConflictStrategy = "error" | "overwrite" | "skip";

interface UploadError {
  name: string;
  error: string;
}

interface UploadResponse {
  uploaded?: string[];
  skipped?: string[];
  errors?: UploadError[];
  conflicts?: string[];
  nonReplaceable?: string[];
  error?: string;
}

interface UploadSummary {
  uploaded: string[];
  skipped: string[];
  errors: UploadError[];
}

interface PendingConflict {
  files: File[];
  conflicts: string[];
  nonReplaceable: string[];
}

async function fetchEntries(dirPath: string): Promise<FileNode[]> {
  const encoded = encodeFilePathForApi(dirPath);
  const res = await fetch(`/api/files/${encoded}?type=list`);
  if (!res.ok) {
    let message = `Failed to load files (HTTP ${res.status})`;
    try {
      const data = await res.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  const data = await res.json() as { entries?: FileEntry[] };
  return (data.entries ?? []).map((e) => ({
    name: e.name,
    fullPath: joinFilePath(dirPath, e.name),
    isDir: e.isDir,
    size: e.size,
    children: e.isDir ? [] : undefined,
    loaded: !e.isDir,
  }));
}

async function fetchGitStatus(cwd: string): Promise<GitStatusResponse> {
  const params = new URLSearchParams({ cwd });
  const res = await fetch(`/api/git/status?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load Git status (HTTP ${res.status})`);
  return res.json() as Promise<GitStatusResponse>;
}

const GIT_STATUS_KEYS: Record<GitFileStatusKind, string> = {
  modified: "files.modified",
  added: "files.added",
  deleted: "files.deleted",
  renamed: "files.renamed",
  untracked: "files.untracked",
  conflict: "files.conflict",
};

function GitStatusBadge({ status, t }: { status: GitFileStatus; t: Translate }) {
  return (
    <span
      className={styles.gitStatusBadge}
      data-status={status.status}
      title={t(GIT_STATUS_KEYS[status.status])}
      aria-label={t(GIT_STATUS_KEYS[status.status])}
    >
      {status.code}
    </span>
  );
}

function uploadFiles(
  targetDirectory: string,
  files: File[],
  strategy: UploadConflictStrategy,
  onProgress: (progress: number) => void,
): Promise<{ status: number; data: UploadResponse }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file, file.name));

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/files/${encodeFilePathForApi(targetDirectory)}?type=upload&conflict=${strategy}`,
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading files"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.onload = () => {
      let data: UploadResponse = {};
      try {
        data = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        if (xhr.responseText) data.error = xhr.responseText;
      }
      resolve({ status: xhr.status, data });
    };
    xhr.send(formData);
  });
}

function MentionIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

function DismissButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <IconButton
      className={styles.fileExplorerDismissButton}
      label={title}
      onClick={onClick}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </svg>
    </IconButton>
  );
}

function TreeNode({
  node,
  depth,
  cwd,
  onOpenFile,
  onAtMention,
  expandedPaths,
  onToggleExpanded,
  refreshToken,
  highlightedPaths,
  gitStatusByPath,
  changedDirectoryPaths,
  t,
}: {
  node: FileNode;
  depth: number;
  cwd: string;
  onOpenFile: (filePath: string, fileName: string, options?: OpenFileOptions) => void;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  expandedPaths: Set<string>;
  onToggleExpanded: (fullPath: string, open: boolean) => void;
  refreshToken: string;
  highlightedPaths: Set<string>;
  gitStatusByPath: Map<string, GitFileStatus>;
  changedDirectoryPaths: Set<string>;
  t: Translate;
}) {
  const open = expandedPaths.has(node.fullPath);
  const highlighted = highlightedPaths.has(node.fullPath);
  const normalizedPath = normalizeFilePathSlashes(node.fullPath);
  const gitStatus = gitStatusByPath.get(normalizedPath);
  const containsGitChanges = node.isDir && (
    gitStatus !== undefined || changedDirectoryPaths.has(normalizedPath)
  );
  const [children, setChildren] = useState<FileNode[]>(node.children ?? []);
  const [loaded, setLoaded] = useState(node.loaded ?? false);
  const [loading, setLoading] = useState(false);

  const loadChildren = useCallback(async (force = false) => {
    if (loaded && !force) return;
    setLoading(true);
    try {
      const entries = await fetchEntries(node.fullPath);
      setChildren(entries);
      setLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loaded, node.fullPath]);

  // Re-fetch children when the tree refreshes and the directory is open.
  useEffect(() => {
    if (open && loaded) {
      loadChildren(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const handleClick = useCallback(() => {
    if (node.isDir) {
      const next = !open;
      onToggleExpanded(node.fullPath, next);
      if (next && !loaded) loadChildren();
    } else {
      onOpenFile(node.fullPath, node.name);
    }
  }, [node.isDir, node.fullPath, node.name, loaded, open, loadChildren, onOpenFile, onToggleExpanded]);

  return (
    <div className={styles.fileTreeNode}>
      <DynamicStyleVars
        className={styles.fileTreeRow}
        variables={{ "--ui-tree-depth": depth }}
        data-open={open}
        onClick={handleClick}
      >
        {node.isDir && (
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            className={styles.fileTreeChevron}
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
        )}
        {!node.isDir && <span className={styles.fileTreeChevronSpacer} />}
        <span className={styles.fileTreeIcon}>
          {node.isDir ? <FolderIcon size={14} open={open} /> : getFileIcon(node.name, 14)}
        </span>
        <span
          className={styles.fileTreeLabel}
          title={node.fullPath}
        >
          {node.name}
        </span>
        {highlighted && (
          <span className={styles.fileStateMarker}
            title={t("files.newlyUploaded")}
            aria-label={t("files.newlyUploaded")}
          >
            <span className={styles.fileStateDot} data-tone="accent" />
          </span>
        )}
        {!node.isDir && gitStatus && (
          <GitStatusBadge status={gitStatus} t={t} />
        )}
        {containsGitChanges && (
          <span className={styles.fileStateMarker}
            title={t("files.containsChangedFiles")}
            aria-label={t("files.containsChangedFiles")}
          >
            <span className={styles.fileStateDot} data-tone="warning" />
          </span>
        )}
        {loading && (
          <svg className={styles.spin} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
        )}
        {onAtMention && (
          <button
            className={styles.fileMentionButton}
            onClick={(e) => {
              e.stopPropagation();
              onAtMention(getRelativeFilePath(node.fullPath, cwd), node.isDir);
            }}
            title={t("files.insertPath")}
            data-with-download={!node.isDir}
          >
            <MentionIcon />
            {t("files.mention")}
          </button>
        )}
        {!node.isDir && (
          <a
            className={styles.fileDownloadButton}
            href={`/api/files/${encodeFilePathForApi(node.fullPath)}?type=download`}
            download
            onClick={(e) => e.stopPropagation()}
            title={t("files.download")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
        )}
      </DynamicStyleVars>
      {node.isDir && open && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              cwd={cwd}
              onOpenFile={onOpenFile}
              onAtMention={onAtMention}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
              refreshToken={refreshToken}
              highlightedPaths={highlightedPaths}
              gitStatusByPath={gitStatusByPath}
              changedDirectoryPaths={changedDirectoryPaths}
              t={t}
            />
          ))}
          {children.length === 0 && loaded && (
            <DynamicStyleVars className={styles.fileTreeEmpty} variables={{ "--ui-tree-depth": depth + 1 }}>
              empty
            </DynamicStyleVars>
          )}
        </div>
      )}
    </div>
  );
}

type OpenFileOptions = { sourceSessionId?: string | null; modeHint?: "diff" };

type OpenFileHandler = (filePath: string, fileName: string, options?: OpenFileOptions) => void;

function ChangeRow({
  status,
  cwd,
  onOpenFile,
  t,
}: {
  status: GitFileStatus;
  cwd: string;
  onOpenFile: OpenFileHandler;
  t: Translate;
}) {
  const name = getFileName(status.filePath);
  const rel = getRelativeFilePath(status.filePath, cwd);
  return (
    <button
      type="button"
      className={styles.changeRow}
      onClick={() => onOpenFile(status.filePath, name, { modeHint: "diff" })}
      title={status.filePath}
    >
      <GitStatusBadge status={status} t={t} />
      <span className={styles.changeRowIcon}>
        {getFileIcon(name, 13)}
      </span>
      <span className={styles.changeRowLabel}>
        {rel}
      </span>
    </button>
  );
}

export const FileExplorer = forwardRef<FileExplorerHandle, Props>(function FileExplorer({
  cwd,
  onOpenFile,
  refreshKey,
  onAtMention,
  onAtMentions,
  onUploadBusyChange,
  changesCollapsed,
  onChangesCountChange,
}, ref) {
  const { t } = useI18n();
  const [roots, setRoots] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [highlightedPaths, setHighlightedPaths] = useState<Set<string>>(new Set());
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [gitLineStats, setGitLineStats] = useState({ additions: 0, deletions: 0 });
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const prevCwdRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const refreshToken = `${refreshKey ?? 0}:${treeRefreshKey}`;
  const uploadBusy = uploadPhase !== "idle";

  const gitStatusByPath = useMemo(() => new Map(
    gitFiles.map((status) => [normalizeFilePathSlashes(status.filePath), status]),
  ), [gitFiles]);

  const changedDirectoryPaths = useMemo(() => {
    const directories = new Set<string>();
    const normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/$/, "");
    for (const status of gitFiles) {
      let directory = getFileDirectory(normalizeFilePathSlashes(status.filePath));
      while (directory === normalizedCwd || directory.startsWith(`${normalizedCwd}/`)) {
        directories.add(directory);
        if (directory === normalizedCwd) break;
        const parent = getFileDirectory(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
    return directories;
  }, [cwd, gitFiles]);

  const handleToggleExpanded = useCallback((fullPath: string, open: boolean) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (open) next.add(fullPath); else next.delete(fullPath);
      return next;
    });
  }, []);

  const applyUploadResult = useCallback((data: UploadResponse) => {
    const uploaded = data.uploaded ?? [];
    const skipped = data.skipped ?? [];
    const errors = data.errors ?? [];
    setUploadSummary({ uploaded, skipped, errors });

    if (uploaded.length > 0) {
      setHighlightedPaths(new Set(uploaded.map((name) => joinFilePath(cwd, name))));
      setTreeRefreshKey((key) => key + 1);
    }
  }, [cwd]);

  const performUpload = useCallback(async (
    files: File[],
    strategy: UploadConflictStrategy,
  ) => {
    setPendingConflict(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadPhase("uploading");

    try {
      const { status, data } = await uploadFiles(cwd, files, strategy, setUploadProgress);
      if (status === 409 && data.conflicts?.length) {
        setPendingConflict({
          files,
          conflicts: data.conflicts,
          nonReplaceable: data.nonReplaceable ?? [],
        });
        return;
      }
      if (status < 200 || status >= 300) {
        throw new Error(data.error ?? `Upload failed (HTTP ${status})`);
      }
      setUploadProgress(100);
      applyUploadResult(data);
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : String(uploadFailure));
    } finally {
      setUploadPhase("idle");
    }
  }, [applyUploadResult, cwd]);

  const prepareUpload = useCallback(async (files: File[]) => {
    if (files.length === 0 || uploadBusy) return;
    setUploadSummary(null);
    setHighlightedPaths(new Set());
    setPendingConflict(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadPhase("checking");

    try {
      const res = await fetch(
        `/api/files/${encodeFilePathForApi(cwd)}?type=upload-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileNames: files.map((file) => file.name) }),
        },
      );
      const data = await res.json().catch(() => ({})) as UploadResponse;
      if (!res.ok) throw new Error(data.error ?? `Upload check failed (HTTP ${res.status})`);

      if (data.conflicts?.length) {
        setPendingConflict({
          files,
          conflicts: data.conflicts,
          nonReplaceable: data.nonReplaceable ?? [],
        });
        return;
      }

      await performUpload(files, "error");
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : String(uploadFailure));
    } finally {
      setUploadPhase("idle");
    }
  }, [cwd, performUpload, uploadBusy]);

  const handleUploadInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void prepareUpload(files);
  }, [prepareUpload]);

  useImperativeHandle(ref, () => ({
    openUploadPicker() {
      if (!uploadBusy) uploadInputRef.current?.click();
    },
  }), [uploadBusy]);

  useEffect(() => {
    onUploadBusyChange?.(uploadBusy);
  }, [onUploadBusyChange, uploadBusy]);

  useEffect(() => () => onUploadBusyChange?.(false), [onUploadBusyChange]);

  useEffect(() => {
    const cwdChanged = prevCwdRef.current !== cwd;
    prevCwdRef.current = cwd;

    // Reset expanded state only when cwd changes, not on refreshKey bumps
    if (cwdChanged) {
      setExpandedPaths(new Set());
      setHighlightedPaths(new Set());
      setUploadSummary(null);
      setPendingConflict(null);
      setUploadError(null);
    }

    // Strict Mode runs this effect twice. The second run sees an unchanged cwd,
    // so loading must also stay true until the first fetch has resolved.
    setLoading(cwdChanged || !hasLoaded);
    setError(null);
    let cancelled = false;
    fetchEntries(cwd)
      .then((entries) => {
        if (cancelled) return;
        setRoots(entries);
        setHasLoaded(true);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, refreshKey, treeRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    fetchGitStatus(cwd)
      .then((status) => {
        if (!cancelled) {
          setGitFiles(status.isGitRepository ? status.files : []);
          setGitLineStats(status.isGitRepository
            ? { additions: status.additions, deletions: status.deletions }
            : { additions: 0, deletions: 0 });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGitFiles([]);
          setGitLineStats({ additions: 0, deletions: 0 });
        }
      });
    return () => { cancelled = true; };
  }, [cwd, refreshKey, treeRefreshKey]);

  useEffect(() => {
    onChangesCountChange?.(gitFiles.length);
  }, [gitFiles, onChangesCountChange]);

  const showUploadFeedback = uploadBusy || pendingConflict !== null || uploadError !== null || uploadSummary !== null;

  const addUploadedFilesToChat = useCallback(() => {
    if (!uploadSummary || uploadSummary.uploaded.length === 0) return;
    onAtMentions?.(
      uploadSummary.uploaded.map((name) => getRelativeFilePath(joinFilePath(cwd, name), cwd)),
    );
  }, [cwd, onAtMentions, uploadSummary]);

  return (
    <div className={styles.fileExplorer}>
      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleUploadInput} />
      {showUploadFeedback && (
        <div className={styles.uploadFeedback}>
        {uploadBusy && (
          <div role="status" aria-live="polite" aria-label={uploadPhase === "checking" ? t("files.checking") : t("files.uploading", { progress: uploadProgress })}>
            <div className={styles.uploadStatusRow}>
              {uploadPhase === "checking" ? (
                <svg className={styles.spin} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-5.7-8.4" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 20h14" />
                </svg>
              )}
              {uploadPhase === "uploading" && <span className={styles.uploadPercent}>{uploadProgress}%</span>}
            </div>
            {uploadPhase === "uploading" && (
              <div className={styles.uploadTrack}>
                <DynamicStyleVars className={styles.uploadProgress} variables={{ "--ui-progress": `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        )}

        {pendingConflict && (
          <div role="alert" className={styles.uploadConflict}>
            <div className={styles.uploadConflictSummary}>
              {t("files.conflictSummary", { count: pendingConflict.conflicts.length, countSuffix: pendingConflict.conflicts.length === 1 ? "" : "s", files: pendingConflict.conflicts.join(", ") })}
            </div>
            {pendingConflict.nonReplaceable.length > 0 && (
              <div className={styles.uploadConflictDetail}>
                {t("files.cannotReplace", { files: pendingConflict.nonReplaceable.join(", ") })}
              </div>
            )}
            <div className={styles.uploadConflictActions}>
              <Button size="sm" tone="danger" onClick={() => void performUpload(pendingConflict.files, "overwrite")}>
                {t("files.replace")}
              </Button>
              <Button size="sm" onClick={() => void performUpload(pendingConflict.files, "skip")}>
                {t("files.skipExisting")}
              </Button>
              <Button size="sm" tone="ghost" onClick={() => setPendingConflict(null)}>
                {t("files.cancel")}
              </Button>
            </div>
          </div>
        )}

        {uploadError && (
          <div role="alert" className={styles.uploadError}>
            <span className={styles.uploadErrorText}>{uploadError}</span>
            <DismissButton onClick={() => setUploadError(null)} title={t("files.dismissError")} />
          </div>
        )}

        {uploadSummary && (
          <div aria-live="polite">
            <div className={styles.uploadSummaryRow}>
              <div className={styles.uploadSummaryCounts}>
                {uploadSummary.uploaded.length > 0 && (
                  <span className={styles.uploadCount} data-tone="success" title={`${uploadSummary.uploaded.length} uploaded`} aria-label={`${uploadSummary.uploaded.length} uploaded`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                    <span>{uploadSummary.uploaded.length}</span>
                  </span>
                )}
                {uploadSummary.skipped.length > 0 && (
                  <span className={styles.uploadCount} data-tone="neutral" title={`${uploadSummary.skipped.length} skipped`} aria-label={`${uploadSummary.skipped.length} skipped`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 12h8" />
                    </svg>
                    <span>{uploadSummary.skipped.length}</span>
                  </span>
                )}
                {uploadSummary.errors.length > 0 && (
                  <span className={styles.uploadCount} data-tone="danger" title={`${uploadSummary.errors.length} failed`} aria-label={`${uploadSummary.errors.length} failed`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3 2.5 20h19L12 3Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    <span>{uploadSummary.errors.length}</span>
                  </span>
                )}
              </div>
              {uploadSummary.uploaded.length > 0 && onAtMentions && (
                <Button
                  className={styles.uploadMentionButton}
                  size="sm"
                  type="button"
                  onClick={addUploadedFilesToChat}
                  title={uploadSummary.uploaded.length === 1 ? t("files.addUploadedFile") : t("files.addAllUploadedFiles")}
                  aria-label={uploadSummary.uploaded.length === 1 ? t("files.addUploadedFile") : t("files.addAllUploadedFiles")}
                >
                  <MentionIcon />
                  {t("files.mention")}
                </Button>
              )}
              <DismissButton onClick={() => setUploadSummary(null)} title={t("files.dismissUploadResults")} />
            </div>
            {uploadSummary.errors.map((item) => (
              <div key={item.name} title={item.error} className={styles.uploadErrorItem}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5" />
                  <path d="M12 17h.01" />
                </svg>
                <span className={styles.ellipsis}>{item.name}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      )}

      {!changesCollapsed && gitFiles.length > 0 && (
        <div className={styles.changeList}>
          <div
            aria-label={t("files.changeStats", {
              count: gitFiles.length,
              additions: gitLineStats.additions,
              deletions: gitLineStats.deletions,
            })}
            className={styles.changeStats}
          >
            <span className={styles.changeStatsLabel}>
              {t("files.changedCount", { count: gitFiles.length })}
            </span>
            <span className={styles.changeStatsAdded}>+{gitLineStats.additions}</span>
            <span className={styles.changeStatsDeleted}>-{gitLineStats.deletions}</span>
          </div>
          {gitFiles.map((status) => (
            <ChangeRow key={status.filePath} status={status} cwd={cwd} onOpenFile={onOpenFile} t={t} />
          ))}
        </div>
      )}

      {(changesCollapsed || gitFiles.length === 0) && (
        <div className={styles.fileTree}>
          {loading ? (
            <div className={styles.navigationEmpty}>Loading files...</div>
          ) : error ? (
            <div className={styles.navigationError}>{error}</div>
          ) : (
            roots.map((node) => (
              <TreeNode
                key={node.fullPath}
                node={node}
                depth={0}
                cwd={cwd}
                onOpenFile={onOpenFile}
                onAtMention={onAtMention}
                expandedPaths={expandedPaths}
                onToggleExpanded={handleToggleExpanded}
                refreshToken={refreshToken}
                highlightedPaths={highlightedPaths}
                gitStatusByPath={gitStatusByPath}
                changedDirectoryPaths={changedDirectoryPaths}
                t={t}
              />
            ))
          )}
          {!loading && !error && hasLoaded && roots.length === 0 && (
            <div className={styles.navigationEmpty}>
              {t("files.noFiles")}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
