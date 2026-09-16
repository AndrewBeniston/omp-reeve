import { reviewDisplayPreferences, type ReviewDisplayPreferences } from "./review-display-preferences";
import type { ReviewScope } from "./review-git";
import { reviewNoisePreferences, type ReviewNoisePreferences } from "./review-noise-preferences";
import type { ReviewPrRepository, ReviewPrSummary } from "./review-pr-ui";
import { sanitizeReviewScrollAnchor, type ReviewScrollAnchor } from "./review-scroll-anchor";

export interface ReviewFileView {
  filter: string;
  showFiles: boolean;
  selectedPath: string | null;
  /*
   * Where the reading was left, so a scope change returns to it.
   *
   * Optional because every existing caller builds this object without one, and
   * a Tab stored before the field existed has none. Absent and null both mean
   * the same thing: start at the top.
   */
  scrollAnchor?: ReviewScrollAnchor | null;
}

export const DEFAULT_REVIEW_FILE_VIEW: ReviewFileView = { filter: "", showFiles: true, selectedPath: null, scrollAnchor: null };

export interface ReviewSelection {
  pullRequestView?: { kind: "list" } | { kind: "selected"; repository: ReviewPrRepository; pull: ReviewPrSummary };
  kind: ReviewScope["kind"];
  comparisonBranch: string;
  comparisonLabel: string;
  commit: string;
  displayPreferences?: ReviewDisplayPreferences;
  /** Rich preview, and whether generated files are held back. */
  noisePreferences?: ReviewNoisePreferences;
  wrapLines?: boolean;
  diffMode?: "unified" | "split";
  viewedRevisions?: Record<string, string>;
  fileView?: ReviewFileView;
}

export const DEFAULT_REVIEW_SELECTION: ReviewSelection = {
  kind: "uncommitted",
  comparisonBranch: "",
  comparisonLabel: "",
  commit: "",
};

const REVIEW_SCOPE_KINDS: readonly ReviewScope["kind"][] = ["staged", "unstaged", "uncommitted", "branch", "commit", "lastTurn"];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * A selection read back from disk, or nothing.
 *
 * What is being reviewed is remembered between runs, so it arrives from a file
 * a human can edit and nothing in it is trusted: an unknown scope, a
 * non-string branch, or a viewed-revision map that is not a map is dropped
 * rather than carried into the panel.
 *
 * A pull-request view is deliberately not restored. It names a repository and
 * a pull request on a host, and bringing one back would show a revision of
 * somebody else's branch as though it were still current; the Tab returns to
 * its Project's own changes instead.
 */
export function sanitizeReviewSelection(value: unknown): ReviewSelection | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = REVIEW_SCOPE_KINDS.find((candidate) => candidate === record.kind);
  if (!kind) return null;
  const selection: ReviewSelection = {
    kind,
    comparisonBranch: text(record.comparisonBranch),
    comparisonLabel: text(record.comparisonLabel),
    commit: text(record.commit),
  };
  const wrapLines = flag(record.wrapLines);
  if (wrapLines !== undefined) selection.wrapLines = wrapLines;
  if (record.diffMode === "unified" || record.diffMode === "split") selection.diffMode = record.diffMode;
  // One merge, in the preferences module, so a stored tab written before a
  // preference existed and a live tab resolve the same way.
  if (typeof record.displayPreferences === "object" && record.displayPreferences !== null && !Array.isArray(record.displayPreferences)) {
    selection.displayPreferences = { ...reviewDisplayPreferences(record.displayPreferences as Record<keyof ReviewDisplayPreferences, unknown>) };
  }
  if (typeof record.noisePreferences === "object" && record.noisePreferences !== null && !Array.isArray(record.noisePreferences)) {
    selection.noisePreferences = { ...reviewNoisePreferences(record.noisePreferences as Record<keyof ReviewNoisePreferences, unknown>) };
  }
  if (typeof record.viewedRevisions === "object" && record.viewedRevisions !== null && !Array.isArray(record.viewedRevisions)) {
    const viewed: Record<string, string> = {};
    for (const [path, revision] of Object.entries(record.viewedRevisions as Record<string, unknown>)) {
      if (typeof revision === "string") viewed[path] = revision;
    }
    selection.viewedRevisions = viewed;
  }
  if (typeof record.fileView === "object" && record.fileView !== null) {
    const fileView = record.fileView as Record<string, unknown>;
    selection.fileView = {
      filter: text(fileView.filter),
      showFiles: flag(fileView.showFiles) ?? DEFAULT_REVIEW_FILE_VIEW.showFiles,
      selectedPath: typeof fileView.selectedPath === "string" ? fileView.selectedPath : null,
      scrollAnchor: sanitizeReviewScrollAnchor(fileView.scrollAnchor),
    };
  }
  return selection;
}
