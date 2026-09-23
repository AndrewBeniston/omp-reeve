"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { getFileIcon } from "./FileIcons";
import styles from "./FileCitationChip.module.css";

interface FileCitationChipProps {
  href: string;
  filePath: string | null;
  title?: string;
  onOpenFile?: (filePath: string) => void;
}

export function isFileCitationHref(href: string | undefined, title: string | undefined): boolean {
  return Boolean(title && /^citation(?::(?:code|document|file|image|presentation|spreadsheet))?$/.test(title)
    || href && /(?::\d+(?::\d+)?|#(?:L\d+(?:-L?\d+)?|(?:line|page|slide|sheet)=.+))$/.test(href));
}

type ArtifactType = "code" | "document" | "file" | "image" | "presentation" | "spreadsheet";

function getArtifactType(name: string, title?: string): ArtifactType {
  const explicitType = title?.match(/^citation:(code|document|file|image|presentation|spreadsheet)$/)?.[1] as ArtifactType | undefined;
  if (explicitType) return explicitType;
  const extension = name.toLowerCase().split(".").pop();
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "java", "c", "h", "cpp", "cs", "sh", "css", "html", "json", "yaml", "yml"].includes(extension ?? "")) return "code";
  if (["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "mdx"].includes(extension ?? "")) return "document";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "tif", "tiff"].includes(extension ?? "")) return "image";
  if (["ppt", "pptx", "key", "odp"].includes(extension ?? "")) return "presentation";
  if (["xls", "xlsx", "ods", "csv", "tsv"].includes(extension ?? "")) return "spreadsheet";
  return "file";
}

function locationFromHref(href: string, type: ArtifactType, t: (key: string, params?: Record<string, string | number>) => string): string | null {
  const line = href.match(/(?:#L|#line=|:)(\d+)(?:-L?(\d+)|:(\d+))?$/);
  if (line && Number(line[1]) > 0) {
    const endLine = line[2] ?? line[3];
    return endLine && Number(endLine) >= Number(line[1])
      ? t("markdown.fileCitation.linesLabel", { line: line[1], endLine })
      : t("markdown.fileCitation.lineLabel", { line: line[1] });
  }
  const fragment = href.split("#", 2)[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  if (type === "document") {
    const pageNumber = params.get("page");
    if (pageNumber && /^[1-9]\d*$/.test(pageNumber)) return t("markdown.fileCitation.documentPageLabel", { pageNumber });
  }
  if (type === "presentation") {
    const slideNumber = params.get("slide");
    if (!slideNumber || !/^[1-9]\d*$/.test(slideNumber)) return null;
    const slideLabel = t("markdown.fileCitation.presentationSlideNumberLabel", { slideNumber });
    const label = safeLabel(params.get("object"));
    return label ? t("markdown.fileCitation.presentationObjectLabel", { slideLabel, label }) : slideLabel;
  }
  if (type === "spreadsheet") {
    const sheet = safeLabel(params.get("sheet"));
    const label = safeLabel(params.get("object"));
    return sheet && label ? t("markdown.fileCitation.workbookObjectLabel", { sheet, label }) : sheet;
  }
  return null;
}

function safeLabel(value: string | null): string | null {
  const label = value?.split(/[/\\]/).pop()?.replace(/[\r\n\t]/g, " ").trim();
  return label || null;
}

export function FileCitationChip({ href, filePath, title, onOpenFile }: FileCitationChipProps) {
  const { t } = useI18n();
  const [exists, setExists] = useState(true);
  const name = filePath?.split(/[/\\]/).pop() || href.split(/[?#]/)[0].split(/[/\\]/).pop() || t("markdown.fileCitation.artifactType.file");
  const type = getArtifactType(name, title);
  const typeLabel = t(`markdown.fileCitation.artifactType.${type}`);
  const location = locationFromHref(href, type, t);
  const hasExtension = /\.[^./\\]+$/.test(name);
  const available = Boolean(filePath && onOpenFile && exists);
  const ariaLabel = hasExtension
    ? location ? t("markdown.fileCitation.ariaLabelWithLine", { fileName: name, lineLabel: location }) : name
    : location
      ? t("markdown.fileCitation.ariaLabelWithTypeAndLine", { fileName: name, fileTypeLabel: typeLabel, lineLabel: location })
      : t("markdown.fileCitation.ariaLabelWithType", { fileName: name, fileTypeLabel: typeLabel });

  useEffect(() => {
    if (!filePath) {
      setExists(false);
      return;
    }

    const controller = new AbortController();
    setExists(true);
    fetch("/api/citations/exists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath }),
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? await response.json() as { exists?: unknown } : { exists: false })
      .then((result) => setExists(result.exists === true))
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setExists(false);
      });

    return () => controller.abort();
  }, [filePath]);

  if (!available) {
    return <span className={styles.unavailable} role="note">
      {getFileIcon(name)}
      <span>{name}</span>
      <span>{t("markdown.fileCitation.unavailable")}</span>
    </span>;
  }

  return <button type="button" className={styles.chip} aria-label={ariaLabel}
    onClick={() => { if (filePath) onOpenFile?.(filePath); }}>
    {getFileIcon(name)}
    <span className={styles.name}>{name}</span>
    <span className={styles.type}>{typeLabel}</span>
    {location && <span className={styles.location}>{t("markdown.fileCitation.lineLabelDisplay", { lineLabel: location })}</span>}
  </button>;
}
