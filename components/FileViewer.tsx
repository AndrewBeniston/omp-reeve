"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
import {
  Prism as SyntaxHighlighter,
  createElement as renderSyntaxNode,
  type SyntaxHighlighterProps,
} from "react-syntax-highlighter";
import ReactMarkdown from "react-markdown";
import {
  DOCX_PREVIEW_MAX_BYTES,
  getFileExt,
  isAudioPath,
  isDocumentPreviewPath,
  isImagePath,
} from "@/lib/file-types";
import {
  encodeFilePathForApi,
  getFileDirectory,
  getFileName,
  getRelativeFilePath,
} from "@/lib/file-paths";
import { resolveLocalFileHref } from "@/lib/file-links";
import { parseFrontmatter } from "@/lib/frontmatter";
import {
  markdownPreviewRehypePlugins,
  markdownPreviewRemarkPlugins,
  normalizeDisplayMath,
} from "@/lib/markdown";
import { CodeBlock, MermaidBlock } from "./MermaidBlock";
import { FrontmatterCard } from "./FrontmatterCard";
import { parseUnifiedPatch } from "@/lib/patch";
import type { GitFileDiffResponse } from "@/lib/git-types";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { IconButton } from "@/components/ui/IconButton";
import styles from "./file-viewer/file-viewer.module.css";

interface Props {
  filePath: string;
  cwd?: string;
  sourceSessionId?: string | null;
  onOpenFile?: (filePath: string) => void;
  onMentionLines?: (relativePath: string, startLine: number, endLine: number) => void;
  /** Insert this file's relative path into the chat input (@ mention). */
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  onClose?: () => void;
  gitRefreshKey?: number;
  initialDisplayMode?: DisplayMode;
}

interface FileData {
  content: string;
  language: string;
  size: number;
}

type DisplayMode = "source" | "preview" | "diff";

const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  source: "Source",
  preview: "Preview",
  diff: "Diff",
};

type SourceCodeRendererProps = Parameters<NonNullable<SyntaxHighlighterProps["renderer"]>>[0] & {
  wrapLines: boolean;
};

interface SelectedLineRange {
  startLine: number;
  endLine: number;
}

function UnstyledCodeTag({ children, className }: ComponentPropsWithoutRef<"code">) {
  return <code className={className}>{children}</code>;
}

function MentionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WrapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
      <path d="m16 16-2 2 2 2" />
      <path d="M3 18h7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function closestSourceLine(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
  return element?.closest<HTMLElement>(".file-source-line[data-line-number]") ?? null;
}

function getSelectedSourceLineRange(root: HTMLElement, selection: Selection | null): SelectedLineRange | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

  let startElement = closestSourceLine(range.startContainer);
  let endElement = closestSourceLine(range.endContainer);
  if (!startElement || !endElement || !root.contains(startElement) || !root.contains(endElement)) return null;

  let startLine = Number(startElement.dataset.lineNumber);
  let endLine = Number(endElement.dataset.lineNumber);
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return null;

  if (startLine < endLine) {
    // Browser ranges can start at the end of the preceding line or end at the
    // start of the following line. Exclude either boundary line when none of
    // its source text is actually selected.
    const startContent = startElement.querySelector<HTMLElement>(".file-source-line-content");
    if (startContent?.contains(range.startContainer)) {
      const selectedSuffix = document.createRange();
      selectedSuffix.selectNodeContents(startContent);
      selectedSuffix.setStart(range.startContainer, range.startOffset);
      if (selectedSuffix.toString().length === 0) {
        const nextLine = startElement.nextElementSibling;
        if (nextLine instanceof HTMLElement && nextLine.matches(".file-source-line[data-line-number]")) {
          startElement = nextLine;
          startLine = Number(startElement.dataset.lineNumber);
        }
      }
    }

    const endContent = endElement.querySelector<HTMLElement>(".file-source-line-content");
    if (endContent?.contains(range.endContainer)) {
      const selectedPrefix = document.createRange();
      selectedPrefix.selectNodeContents(endContent);
      selectedPrefix.setEnd(range.endContainer, range.endOffset);
      if (selectedPrefix.toString().length === 0) {
        const previousLine = endElement.previousElementSibling;
        if (previousLine instanceof HTMLElement && previousLine.matches(".file-source-line[data-line-number]")) {
          endElement = previousLine;
          endLine = Number(endElement.dataset.lineNumber);
        }
      }
    }
  }

  if (startLine > endLine) return null;
  return { startLine, endLine };
}

export function SourceCodeRenderer({ rows, stylesheet, useInlineStyles, wrapLines }: SourceCodeRendererProps) {
  return rows.map((row, lineIndex) => {
    const children = row.children ?? [];
    const firstChildClasses = children[0]?.properties?.className;
    const hasLineNumber = Array.isArray(firstChildClasses)
      && firstChildClasses.includes("react-syntax-highlighter-line-number");
    const contentNodes = hasLineNumber ? children.slice(1) : children;

    return (
      <span
        className={`file-source-line ${styles.sourceLine}`}
        data-line-number={lineIndex + 1}
        key={`source-line-${lineIndex}`}
      >
        {hasLineNumber && (
          <span className="react-syntax-highlighter-line-number" aria-hidden="true">
            {lineIndex + 1}
          </span>
        )}
        <span
          className={`file-source-line-content ${styles.sourceLineContent}`}
          data-wrap={wrapLines ? "true" : "false"}
        >
          {contentNodes.map((node, tokenIndex) => renderSyntaxNode({
            node,
            stylesheet,
            useInlineStyles,
            key: `source-token-${lineIndex}-${tokenIndex}`,
          }))}
        </span>
      </span>
    );
  });
}

export function SourceView({ content, language, wrapLines }: {
  content: string;
  language: string;
  wrapLines: boolean;
}) {
  return (
    <SyntaxHighlighter
      className={wrapLines ? `file-source-view is-wrapped ${styles.sourceView}` : `file-source-view ${styles.sourceView}`}
      CodeTag={UnstyledCodeTag}
      language={language === "text" ? "plaintext" : language}
      showLineNumbers
      useInlineStyles={false}
      renderer={(rendererProps) => (
        <SourceCodeRenderer {...rendererProps} wrapLines={wrapLines} />
      )}
      wrapLongLines={wrapLines}
    >
      {content}
    </SyntaxHighlighter>
  );
}

function getFileApiUrl(
  filePath: string,
  type: "read" | "download" | "meta" | "preview" | "watch",
  sourceSessionId?: string | null,
  params: Record<string, string | number | undefined> = {},
): string {
  const encoded = encodeFilePathForApi(filePath);
  const searchParams = new URLSearchParams({ type });
  if (sourceSessionId) searchParams.set("sessionId", sourceSessionId);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, String(value));
  }
  return `/api/files/${encoded}?${searchParams.toString()}`;
}

function DownloadLink({ filePath, sourceSessionId }: { filePath: string; sourceSessionId?: string | null }) {
  const { t } = useI18n();
  return (
    <a
      href={getFileApiUrl(filePath, "download", sourceSessionId)}
      download={getFileName(filePath)}
      title={t("i18n.downloadFile")}
      aria-label={t("i18n.downloadFile")}
      className={styles.iconButton}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  );
}

type DiffLine = {
  type: "unchanged" | "removed" | "added";
  text: string;
  oldLineNo: number | null;
  newLineNo: number | null;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function diffLines(patch: string): DiffLine[] {
  const files = parseUnifiedPatch(patch);
  if (!files) return [];

  return files.flatMap((file) => file.rows.flatMap((row): DiffLine[] => {
    if (row.type === "hunk") return [];
    if (row.left.type === "context" && row.right.type === "context") {
      return [{
        type: "unchanged",
        text: row.right.text,
        oldLineNo: row.left.lineNo,
        newLineNo: row.right.lineNo,
      }];
    }

    const lines: DiffLine[] = [];
    if (row.left.type === "removed") {
      lines.push({
        type: "removed",
        text: row.left.text,
        oldLineNo: row.left.lineNo,
        newLineNo: null,
      });
    }
    if (row.right.type === "added") {
      lines.push({
        type: "added",
        text: row.right.text,
        oldLineNo: null,
        newLineNo: row.right.lineNo,
      });
    }
    return lines;
  }));
}

export function DiffView({ patch }: { patch: string }) {
  const { t } = useI18n();
  const diff = diffLines(patch);

  const hasChanges = diff.some((l) => l.type !== "unchanged");
  if (!hasChanges) {
    return (
      <div className={styles.noChanges}>
        {t("i18n.noChanges")}
      </div>
    );
  }

  // Render with context: show 3 lines around each change, collapse the rest
  const CONTEXT = 3;
  const changed = new Set(diff.flatMap((l, i) => (l.type !== "unchanged" ? [i] : [])));
  const visible = new Set<number>();
  for (const ci of changed) {
    for (let j = Math.max(0, ci - CONTEXT); j <= Math.min(diff.length - 1, ci + CONTEXT); j++) {
      visible.add(j);
    }
  }

  const segments: Array<{ hidden: true; count: number } | { hidden: false; lines: DiffLine[] }> = [];
  let i = 0;
  while (i < diff.length) {
    if (visible.has(i)) {
      const block: DiffLine[] = [];
      while (i < diff.length && visible.has(i)) {
        block.push(diff[i]);
        i++;
      }
      segments.push({ hidden: false, lines: block });
    } else {
      let count = 0;
      while (i < diff.length && !visible.has(i)) {
        count++;
        i++;
      }
      segments.push({ hidden: true, count });
    }
  }

  return (
    <div className={`file-diff-view ${styles.diffView}`}>
      {segments.map((seg, si) => {
        if (seg.hidden) {
          return (
            <div key={si} className={styles.diffCollapsed}>
              ... {seg.count} unchanged lines ...
            </div>
          );
        }
        const lines = seg.lines.map((line, li) => {
          const prefix =
            line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";

          return (
            <div
              key={li}
              className={`file-diff-line ${styles.diffLine}`}
              data-type={line.type}
            >
              <span className={styles.diffLineNumber}>
                {line.type === "removed" ? line.oldLineNo : line.newLineNo}
              </span>
              <span className={styles.diffPrefix} data-type={line.type}>
                {prefix}
              </span>
              <span className={`file-diff-line-content ${styles.diffLineContent}`}>
                {line.text || "\u00a0"}
              </span>
            </div>
          );
        });
        return <div key={si}>{lines}</div>;
      })}
    </div>
  );
}

export function ImageViewer({ filePath, cwd, sourceSessionId }: Props) {
  const { t } = useI18n();
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileName(filePath).toLowerCase().split(".").pop() ?? "";

  useEffect(() => {
    setBust(0);
    setSize(null);
    setNaturalSize(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(getFileApiUrl(filePath, "watch", sourceSessionId));
    esRef.current = es;

    es.addEventListener("connected", () => setWatching(true));
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") setSize(d.size);
      } catch { /* ignore */ }
      setBust((b) => b + 1);
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [filePath, sourceSessionId]);

  const src = getFileApiUrl(filePath, "read", sourceSessionId, bust ? { v: bust } : undefined);
  const formatSizeStr = size != null ? formatSize(size) : null;

  return (
    <div className={styles.viewerShell}>
      <div className={styles.mediaToolbar}>
        <span className={styles.filePath} title={filePath}>
          {getRelativeFilePath(filePath, cwd)}
        </span>
        <span className={styles.fileExt}>{ext || "image"}</span>
        {naturalSize && <span>{naturalSize.w} × {naturalSize.h}</span>}
        {formatSizeStr && <span>{formatSizeStr}</span>}
        <span
          title={watching ? t("i18n.liveSync") : t("i18n.notWatching")}
          className={styles.liveStatus}
          data-watching={watching ? "true" : "false"}
        >
          <span className={styles.liveDot} data-watching={watching ? "true" : "false"} />
          {watching ? "live" : "static"}
        </span>
        <DownloadLink filePath={filePath} sourceSessionId={sourceSessionId} />
      </div>
      <div className={styles.imageContainer}>
        {error ? (
          <div className={styles.mediaError} data-state="error">{error}</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={filePath}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            onError={() => setError("Failed to load image")}
            className={styles.imageElement}
          />
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function AudioViewer({ filePath, cwd, sourceSessionId }: Props) {
  const { t } = useI18n();
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileName(filePath).toLowerCase().split(".").pop() ?? "";

  useEffect(() => {
    setBust(0);
    setSize(null);
    setDuration(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(getFileApiUrl(filePath, "watch", sourceSessionId));
    esRef.current = es;

    es.addEventListener("connected", () => setWatching(true));
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") setSize(d.size);
      } catch { /* ignore */ }
      setDuration(null);
      setError(null);
      setBust((b) => b + 1);
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [filePath, sourceSessionId]);

  const src = getFileApiUrl(filePath, "read", sourceSessionId, bust ? { v: bust } : undefined);

  return (
    <div className={styles.viewerShell}>
      <div className={styles.mediaToolbar}>
        <span className={styles.filePath} title={filePath}>
          {getRelativeFilePath(filePath, cwd)}
        </span>
        <span className={styles.fileExt}>{ext || "audio"}</span>
        {duration != null && <span>{formatDuration(duration)}</span>}
        {size != null && <span>{formatSize(size)}</span>}
        <span
          title={watching ? t("i18n.liveSync") : t("i18n.notWatching")}
          className={styles.liveStatus}
          data-watching={watching ? "true" : "false"}
        >
          <span className={styles.liveDot} data-watching={watching ? "true" : "false"} />
          {watching ? "live" : "static"}
        </span>
        <DownloadLink filePath={filePath} sourceSessionId={sourceSessionId} />
      </div>
      <div className={styles.audioContainer}>
        <div className={styles.audioWrapper}>
          {error && (
            <div className={styles.audioError} data-state="error">
              {error}
            </div>
          )}
          <audio
            key={src}
            controls
            preload="metadata"
            src={src}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setError("Failed to load audio")}
            className={styles.audioElement}
          />
        </div>
      </div>
    </div>
  );
}

export function DocumentViewer({ filePath, cwd, sourceSessionId }: Props) {
  const { t } = useI18n();
  const [watching, setWatching] = useState(false);
  const [bust, setBust] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const ext = getFileExt(filePath);
  const isPdf = ext === "pdf";
  const previewUrl = isPdf
    ? getFileApiUrl(filePath, "read", sourceSessionId, bust ? { v: bust } : undefined)
    : getFileApiUrl(filePath, "preview", sourceSessionId, bust ? { v: bust } : undefined);

  useEffect(() => {
    setBust(0);
    setSize(null);
    setError(null);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    fetch(getFileApiUrl(filePath, "meta", sourceSessionId))
      .then((r) => r.json())
      .then((d: { size?: number; error?: string }) => {
        if (d.error) setError(d.error);
        if (typeof d.size === "number") {
          setSize(d.size);
          if (!isPdf && d.size > DOCX_PREVIEW_MAX_BYTES) {
            setError("DOCX too large for preview (>10MB)");
          }
        }
      })
      .catch((e) => setError(String(e)));

    const es = new EventSource(getFileApiUrl(filePath, "watch", sourceSessionId));
    esRef.current = es;

    es.addEventListener("connected", () => setWatching(true));
    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { size?: number };
        if (typeof d.size === "number") {
          setSize(d.size);
          if (!isPdf && d.size > DOCX_PREVIEW_MAX_BYTES) {
            setError("DOCX too large for preview (>10MB)");
            return;
          }
        }
      } catch { /* ignore */ }
      setError(null);
      setBust((b) => b + 1);
    });
    es.addEventListener("error", () => setWatching(false));
    es.onerror = () => setWatching(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [filePath, isPdf, sourceSessionId]);

  return (
    <div className={styles.viewerShell}>
      <div className={styles.mediaToolbar}>
        <span className={styles.filePath} title={filePath}>
          {getRelativeFilePath(filePath, cwd)}
        </span>
        <span className={styles.fileExt}>{ext === "docx" ? "docx preview" : "pdf"}</span>
        {size != null && <span>{formatSize(size)}</span>}
        <DownloadLink filePath={filePath} sourceSessionId={sourceSessionId} />
        <span
          title={watching ? t("i18n.liveSync") : t("i18n.notWatching")}
          className={styles.liveStatus}
          data-watching={watching ? "true" : "false"}
        >
          <span className={styles.liveDot} data-watching={watching ? "true" : "false"} />
          {watching ? "live" : "static"}
        </span>
      </div>
      <div className={styles.documentContainer}>
        {error ? (
          <div className={`${styles.statusMessage} ${styles.documentError}`} data-state="error">
            {error}
          </div>
        ) : (
          <iframe
            key={previewUrl}
            src={previewUrl}
            sandbox={isPdf ? undefined : "allow-same-origin"}
            title={t("i18n.previewFile", { file: getFileName(filePath) })}
            className={styles.documentIframe}
            data-type={isPdf ? "pdf" : "preview"}
          />
        )}
      </div>
    </div>
  );
}

export function FileViewer({
  filePath,
  cwd,
  sourceSessionId,
  onOpenFile,
  onMentionLines,
  onAtMention,
  onClose,
  gitRefreshKey,
  initialDisplayMode,
}: Props) {
  if (isImagePath(filePath)) {
    return <ImageViewer filePath={filePath} cwd={cwd} sourceSessionId={sourceSessionId} />;
  }
  if (isAudioPath(filePath)) {
    return <AudioViewer filePath={filePath} cwd={cwd} sourceSessionId={sourceSessionId} />;
  }
  if (isDocumentPreviewPath(filePath)) {
    return <DocumentViewer filePath={filePath} cwd={cwd} sourceSessionId={sourceSessionId} />;
  }
  return (
    <TextFileViewer
      filePath={filePath}
      cwd={cwd}
      sourceSessionId={sourceSessionId}
      onOpenFile={onOpenFile}
      onMentionLines={onMentionLines}
      onAtMention={onAtMention}
      onClose={onClose}
      gitRefreshKey={gitRefreshKey}
      initialDisplayMode={initialDisplayMode}
    />
  );
}

export function TextFileViewer({
  filePath,
  cwd,
  sourceSessionId,
  onOpenFile,
  onMentionLines,
  onAtMention,
  onClose,
  gitRefreshKey,
  initialDisplayMode,
}: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<FileData | null>(null);
  const [gitDiff, setGitDiff] = useState<GitFileDiffResponse | null>(null);
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("source");
  const [wrapLines, setWrapLines] = useState(false);
  const [watching, setWatching] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const gitDiffRequestRef = useRef(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [selectedLineRange, setSelectedLineRange] = useState<SelectedLineRange | null>(null);

  const fetchContent = useCallback((filePath: string) => {
    return fetch(getFileApiUrl(filePath, "read", sourceSessionId))
      .then((r) => r.json())
      .then((d: FileData & { error?: string }) => {
        if (d.error) {
          setError(d.error);
          return null;
        }
        setError(null);
        setData(d);
        return d;
      })
      .catch((e) => {
        setError(String(e));
        return null;
      });
  }, [sourceSessionId]);

  const fetchGitDiff = useCallback(async (targetPath: string) => {
    const requestId = ++gitDiffRequestRef.current;
    setGitDiffLoading(true);
    if (!cwd) {
      setGitDiff(null);
      setGitDiffLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ cwd, path: targetPath });
      const response = await fetch(`/api/git/diff?${params.toString()}`);
      const next = await response.json() as GitFileDiffResponse & { error?: string };
      if (requestId !== gitDiffRequestRef.current) return;
      setGitDiff(response.ok && next.supported && typeof next.patch === "string" ? next : null);
    } catch {
      if (requestId === gitDiffRequestRef.current) setGitDiff(null);
    } finally {
      if (requestId === gitDiffRequestRef.current) setGitDiffLoading(false);
    }
  }, [cwd]);

  // Initial load + SSE watch setup
  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    setGitDiff(null);
    setDisplayMode("source");
    setWrapLines(false);
    setWatching(false);

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    fetchContent(filePath).finally(() => setLoading(false));

    // Set up SSE watch
    const es = new EventSource(getFileApiUrl(filePath, "watch", sourceSessionId));
    esRef.current = es;

    es.addEventListener("connected", () => {
      setWatching(true);
    });

    es.addEventListener("change", () => {
      void fetchContent(filePath);
      void fetchGitDiff(filePath);
    });

    es.addEventListener("error", () => {
      setWatching(false);
    });

    es.onerror = () => {
      setWatching(false);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [filePath, fetchContent, fetchGitDiff, sourceSessionId]);

  useEffect(() => {
    void fetchGitDiff(filePath);
  }, [fetchGitDiff, filePath, gitRefreshKey]);

  useEffect(() => {
    // HTML gets the same rendered-first treatment as markdown: a generated page
    // is usually more useful viewed than read as source. Both have a preview
    // mode already; the source tab stays one click away.
    if ((data?.language === "markdown" || data?.language === "html") && initialDisplayMode !== "diff") {
      setDisplayMode("preview");
    }
  }, [data?.language, initialDisplayMode]);

  const hasGitDiff = gitDiff?.supported === true && typeof gitDiff.patch === "string";
  const isDeletedDiff = hasGitDiff && gitDiff.status === "deleted";

  useEffect(() => {
    if (!hasGitDiff && displayMode === "diff") setDisplayMode("source");
  }, [displayMode, hasGitDiff]);

  useEffect(() => {
    if (!isDeletedDiff || !esRef.current) return;
    esRef.current.close();
    esRef.current = null;
    setWatching(false);
  }, [isDeletedDiff]);

  // Opened from the Changes list (initialDisplayMode === "diff"): switch to the
  // diff view once the git diff has resolved. We do this after the diff loads
  // rather than at mount so files without a diff never flash an empty diff view.
  const autoDiffAppliedRef = useRef(false);
  useEffect(() => {
    autoDiffAppliedRef.current = false;
  }, [filePath]);
  useEffect(() => {
    if (initialDisplayMode === "diff" && hasGitDiff && !autoDiffAppliedRef.current) {
      autoDiffAppliedRef.current = true;
      setDisplayMode("diff");
    }
  }, [initialDisplayMode, hasGitDiff]);

  const markdownPreview = useMemo(
    () => (data?.language === "markdown" ? normalizeDisplayMath(data.content) : ""),
    [data],
  );

  const frontmatter = useMemo(
    () => (data?.language === "markdown" ? parseFrontmatter(data.content) : null),
    [data],
  );

  useEffect(() => {
    const updateSelectedLineRange = () => {
      const root = contentRef.current;
      setSelectedLineRange(
        onMentionLines && displayMode === "source" && root
          ? getSelectedSourceLineRange(root, window.getSelection())
          : null,
      );
    };

    updateSelectedLineRange();
    if (!onMentionLines || displayMode !== "source") return;

    document.addEventListener("selectionchange", updateSelectedLineRange);
    return () => document.removeEventListener("selectionchange", updateSelectedLineRange);
  }, [data?.content, displayMode, onMentionLines]);

  const mentionLineRange = useCallback((lineRange: SelectedLineRange | null) => {
    if (!onMentionLines || !lineRange) return;
    onMentionLines(
      getRelativeFilePath(filePath, cwd),
      lineRange.startLine,
      lineRange.endLine,
    );
  }, [cwd, filePath, onMentionLines]);

  useEffect(() => {
    if (!onMentionLines || displayMode !== "source") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== "i" || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return;

      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable='true']")) return;

      const root = contentRef.current;
      const lineRange = root ? getSelectedSourceLineRange(root, window.getSelection()) : null;
      if (!lineRange) return;

      event.preventDefault();
      mentionLineRange(lineRange);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [displayMode, mentionLineRange, onMentionLines]);

  const fileContent = data?.content;
  const handleCopyContent = useCallback(() => {
    if (!fileContent) return;
    void copyText(fileContent).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [fileContent]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (loading || (initialDisplayMode === "diff" && gitDiffLoading && !data)) {
    return (
      <div className={styles.statusMessage} data-state="loading">
        {t("i18n.loading")}
      </div>
    );
  }

  if (error && !isDeletedDiff) {
    return (
      <div className={styles.statusMessage} data-state="error">
        {error}
      </div>
    );
  }

  if (!data && !isDeletedDiff) return null;

  const language = data?.language ?? "text";
  const content = data?.content ?? "";
  const isHtml = language === "html";
  const isMarkdown = language === "markdown";
  const hasPreview = isHtml || isMarkdown;
  const markdownDirectory = getFileDirectory(filePath);
  const lines = content.split("\n");
  const effectiveDisplayMode = isDeletedDiff ? "diff" : displayMode;
  const displayModes: DisplayMode[] = isDeletedDiff
    ? ["diff"]
    : [
        "source",
        ...(hasPreview ? ["preview" as const] : []),
        ...(hasGitDiff ? ["diff" as const] : []),
      ];
  const metadata = isDeletedDiff
    ? t("files.deleted")
    : `${language} · ${lines.length} lines · ${formatSize(data!.size)}`;

  return (
    <div className={styles.viewerShell}>
      <div className={styles.toolbar}>
        <span className={styles.filePath} title={filePath}>
          {getRelativeFilePath(filePath, cwd)}
        </span>

        <span className={styles.meta} title={metadata}>{metadata}</span>
        {!isDeletedDiff && (
          <span
            title={watching ? t("i18n.liveSync") : t("i18n.notWatching")}
            aria-label={watching ? t("i18n.liveSync") : t("i18n.notWatching")}
            className={styles.liveIndicator}
            data-watching={watching ? "true" : "false"}
          />
        )}

        <div className={styles.controls}>
          {displayModes.length > 1 && (
            <div className={styles.modeSwitch} aria-label={t("i18n.fileViewMode")}>
              {displayModes.map((mode) => {
                const active = effectiveDisplayMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDisplayMode(mode)}
                    title={mode === "diff" ? t("i18n.compareHead") : undefined}
                    aria-pressed={active}
                    data-active={active ? "true" : "false"}
                    className={styles.modeButton}
                  >
                    {DISPLAY_MODE_LABELS[mode]}
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.actions}>
            {(onAtMention || onMentionLines) && (
              <IconButton
                label={
                  selectedLineRange && onMentionLines
                    ? `${t("i18n.mentionSelectedLines")} (L${selectedLineRange.startLine}${selectedLineRange.startLine !== selectedLineRange.endLine ? `-L${selectedLineRange.endLine}` : ""})`
                    : t("files.insertPath")
                }
                title={
                  selectedLineRange && onMentionLines
                    ? `${t("i18n.mentionSelectedLines")} (L${selectedLineRange.startLine}${selectedLineRange.startLine !== selectedLineRange.endLine ? `-L${selectedLineRange.endLine}` : ""})`
                    : t("files.insertPath")
                }
                disabled={!onAtMention && !onMentionLines}
                className={styles.iconButton}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  // Mention selected lines when a range is active (and line
                  // mention is wired up); otherwise fall back to a whole-file
                  // @mention. Same button, behavior follows the selection.
                  if (selectedLineRange && onMentionLines) {
                    mentionLineRange(selectedLineRange);
                  } else {
                    onAtMention?.(getRelativeFilePath(filePath, cwd), false);
                  }
                }}
              >
                <MentionIcon />
              </IconButton>
            )}

            {!isDeletedDiff && (
              <IconButton
                label={copied ? t("i18n.copied") : t("i18n.copy")}
                title={copied ? t("i18n.copied") : t("i18n.copy")}
                onClick={handleCopyContent}
                className={styles.iconButton}
                pressed={copied}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </IconButton>
            )}

            {effectiveDisplayMode === "source" && (
              <IconButton
                label={wrapLines ? t("i18n.disableWrap") : t("i18n.enableWrap")}
                title={wrapLines ? t("i18n.disableWrap") : t("i18n.enableWrap")}
                pressed={wrapLines}
                data-active={wrapLines ? "true" : "false"}
                onClick={() => setWrapLines((value) => !value)}
                className={styles.iconButton}
              >
                <WrapIcon />
              </IconButton>
            )}

            {!isDeletedDiff && <DownloadLink filePath={filePath} sourceSessionId={sourceSessionId} />}

            {onClose && (
              <IconButton
                label={t("i18n.close")}
                title={t("i18n.close")}
                onClick={onClose}
                className={styles.iconButton}
              >
                <CloseIcon />
              </IconButton>
            )}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div ref={contentRef} className={styles.contentArea}>
        {effectiveDisplayMode === "diff" && hasGitDiff ? (
          <DiffView patch={gitDiff.patch!} />
        ) : isHtml && effectiveDisplayMode === "preview" ? (
          <iframe
            srcDoc={content}
            sandbox="allow-scripts"
            className={styles.htmlPreviewIframe}
            title={t("i18n.htmlPreview")}
          />
        ) : isMarkdown && effectiveDisplayMode === "preview" ? (
          <div className={`markdown-body markdown-file-preview ${styles.markdownPreview}`}>
            {frontmatter?.data && <FrontmatterCard data={frontmatter.data} />}
            <ReactMarkdown
              remarkPlugins={markdownPreviewRemarkPlugins}
              rehypePlugins={markdownPreviewRehypePlugins}
              components={{
                code({ className, children, ...props }) {
                  const lang = className?.replace("language-", "").toLowerCase() ?? "";
                  const raw = String(children);
                  const isBlock = className?.includes("language-") || raw.includes("\n");
                  if (isBlock) {
                    if (lang === "mermaid") {
                      return <MermaidBlock code={raw.replace(/\n$/, "")} defaultPreview />;
                    }
                    return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} />;
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                pre({ children }) {
                  // Render the code block directly — CodeBlock provides its own wrapping.
                  // For non-mermaid blocks, pass through to default pre rendering.
                  return <>{children}</>;
                },
                a({ href, children, ...props }) {
                  delete props.node;
                  const linkedFile = onOpenFile
                    ? resolveLocalFileHref(href, markdownDirectory, cwd ?? markdownDirectory)
                    : null;
                  if (!linkedFile || !onOpenFile) {
                    return <a href={href} {...props}>{children}</a>;
                  }

                  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
                    if (event.defaultPrevented || event.button !== 0) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onOpenFile(linkedFile);
                  };

                  return <a href={href} {...props} onClick={handleClick}>{children}</a>;
                },
                img({ src, alt, ...props }) {
                  delete props.node;
                  const imagePath = typeof src === "string"
                    ? resolveLocalFileHref(src, markdownDirectory, cwd ?? markdownDirectory)
                    : null;
                  const imageSrc = imagePath
                    ? getFileApiUrl(imagePath, "read", sourceSessionId)
                    : src;
                  // Dynamic local paths are served directly by the file API.
                  // eslint-disable-next-line @next/next/no-img-element
                  return <img src={imageSrc} alt={alt ?? ""} loading="lazy" {...props} />;
                },
              }}
            >
              {markdownPreview}
            </ReactMarkdown>
          </div>
        ) : (
          <SourceView content={content} language={language} wrapLines={wrapLines} />
        )}
      </div>
    </div>
  );
}
