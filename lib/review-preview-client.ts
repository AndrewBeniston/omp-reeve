import type { ReviewFileFacts } from "./review-file-facts";
import { formatMebibytes, REVIEW_OBJECT_READ_CAP } from "./review-limits";
import { reviewOwnerBody, reviewOwnerKey, reviewOwnerSearchParams, type ReviewRequestContext } from "./review-owner";
import { reviewPreviewScopeSearchParams, type ReviewPreviewScope } from "./review-scope-request";
import type { ReviewPreviewResult } from "./review-preview-source";

/** Nothing known, which is what a failed read leaves the panel with. */
export const NO_REVIEW_FILE_FACTS: ReviewFileFacts = { generated: [], conflicts: {} };

/**
 * What a preview is a preview *of*, as one string.
 *
 * The revision digest is in here because it is the only part that moves when
 * the file changes underneath an open Review. Without it a preview keyed on
 * owner, scope and path alone holds the bytes it first fetched: the panel
 * refreshes, every changed file's digest moves, and the image on screen stays
 * the old one.
 *
 * It is an identity, not a pin. The read still asks for the current version
 * by name, because a displayed digest differs when whitespace is ignored or
 * when the repository configures clean or smudge filters, and pinning it
 * would refuse the preview forever in exactly those repositories.
 */
export function reviewPreviewRequestKey(
  context: ReviewRequestContext,
  scope: ReviewPreviewScope,
  filePath: string,
  revision: string | undefined,
): string {
  return JSON.stringify([context.tabId, reviewOwnerKey(context.owner), scope, filePath, revision ?? null]);
}

async function post<Result>(url: string, body: unknown, signal?: AbortSignal): Promise<Result | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return await response.json() as Result;
}

/**
 * Which of these paths the repository calls generated, and what a conflicted
 * one is conflicted about.
 *
 * A failure returns nothing known rather than throwing: both facts decorate a
 * diff that stands without them.
 */
export async function fetchReviewFileFacts(
  context: ReviewRequestContext,
  paths: string[],
  signal?: AbortSignal,
): Promise<ReviewFileFacts> {
  try {
    return await post<ReviewFileFacts>("/api/git/review/file-facts", reviewOwnerBody(context, { paths }), signal)
      ?? NO_REVIEW_FILE_FACTS;
  } catch {
    return NO_REVIEW_FILE_FACTS;
  }
}

/** Both sides of one file's preview, at whatever revision it is now. */
export async function fetchReviewPreview(
  context: ReviewRequestContext,
  scope: ReviewPreviewScope,
  filePath: string,
  signal?: AbortSignal,
  options: { includeBytes?: boolean } = {},
): Promise<ReviewPreviewResult> {
  try {
    return await post<ReviewPreviewResult>("/api/git/review/preview",
      reviewOwnerBody(context, { scope, path: filePath, current: true, includeBytes: options.includeBytes !== false }), signal)
      ?? { status: "unavailable" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { status: "unavailable" };
  }
}

/**
 * Where a viewer fetches one side's bytes from.
 *
 * Same origin on purpose. The desktop shell lets a subframe navigate only to
 * a trusted application URL, so a PDF handed over as a `data:` URL is
 * refused before it loads.
 *
 * `v` is the revision the panel is showing. The route never reads it: it is
 * in the URL so that a file moving gives the frame a different address to
 * load, rather than the browser reusing what it already has.
 */
export function reviewPreviewSideUrl(
  context: ReviewRequestContext,
  scope: ReviewPreviewScope,
  filePath: string,
  which: "old" | "new",
  revision: string | undefined,
): string {
  const params = reviewOwnerSearchParams(context, {
    ...reviewPreviewScopeSearchParams(scope),
    path: filePath,
    side: which,
    v: revision ?? "",
  });
  return `/api/git/review/preview?${params}`;
}

/** What a refused preview says, keyed by the status that refused it. */
export const REVIEW_PREVIEW_REFUSALS: Record<string, string> = {
  stale: "This file changed while it was being read.",
  "revision-moved": "This pull request changed while it was being read. Refresh to read it at its new revision.",
  "not-in-review": "This file is no longer part of this review.",
  unsupported: "This file cannot be previewed here.",
  "too-large": `This file is larger than the ${formatMebibytes(REVIEW_OBJECT_READ_CAP)} Review reads at once, so it cannot be previewed.`,
  unavailable: "This file could not be read.",
};
