/*
 * Which changed files Review previews rather than diffs.
 *
 * Every rule here is R6 in `docs/research/review-reference.md`, read from the
 * reference's own selector rather than inferred from the modules it loads.
 * Two of them are easy to get backwards and are therefore stated plainly:
 * raster images and PDFs preview whatever the rich preview setting says,
 * because the selector reaches them without consulting it; and markdown
 * preview is suppressed on a deletion, which is an explicit condition in that
 * selector rather than an accident of rendering.
 *
 * The suffix test is a plain lowercase extension check on the final path
 * segment, as the reference's is. Nothing is content-sniffed.
 */

export type ReviewPreviewKind = "image" | "svg" | "pdf" | "markdown";

/** Previewed whatever the rich preview setting says. */
const RASTER_SUFFIXES = new Set(["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "tif", "tiff", "webp"]);

/** Previewed only with rich preview on, and never for a deletion. */
const MARKDOWN_SUFFIXES = new Set(["markdown", "md", "mdown", "mdx", "mkd"]);

/**
 * The media type each previewable suffix is served as.
 *
 * An SVG is served as an image and drawn in an `img`, which runs no script in
 * it. Review shows a file one side of a diff wrote; inlining its markup would
 * execute it.
 */
const MEDIA_TYPES: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/vnd.microsoft.icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  markdown: "text/markdown",
  md: "text/markdown",
  mdown: "text/markdown",
  mdx: "text/markdown",
  mkd: "text/markdown",
};

/**
 * The lowercase extension of a path's final segment, or empty for none.
 *
 * Both separators are handled, because a patch read on one computer can be
 * looked at on another. A leading dot is a name rather than an extension, so
 * `.gitignore` has no suffix.
 */
export function reviewFileSuffix(filePath: string): string {
  const segment = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
  const dot = segment.lastIndexOf(".");
  return dot <= 0 ? "" : segment.slice(dot + 1).toLowerCase();
}

/** How this file previews, or null for one that is read as an ordinary diff. */
export function reviewPreviewKind({ path, deleted = false, richPreview = false }: {
  path: string;
  deleted?: boolean;
  /** The right panel's own setting, which R6 records as off until turned on. */
  richPreview?: boolean;
}): ReviewPreviewKind | null {
  const suffix = reviewFileSuffix(path);
  if (RASTER_SUFFIXES.has(suffix)) return "image";
  if (suffix === "pdf") return "pdf";
  if (!richPreview) return null;
  if (suffix === "svg") return "svg";
  if (MARKDOWN_SUFFIXES.has(suffix) && !deleted) return "markdown";
  return null;
}

/** What a previewable file's bytes are served as, or null for one that is not. */
export function reviewPreviewMediaType(filePath: string): string | null {
  return MEDIA_TYPES[reviewFileSuffix(filePath)] ?? null;
}

/**
 * Whether a preview reads the file as text rather than as bytes to hand a
 * viewer. Only markdown does, and it is decoded as UTF-8.
 */
export function reviewPreviewIsText(kind: ReviewPreviewKind): boolean {
  return kind === "markdown";
}
