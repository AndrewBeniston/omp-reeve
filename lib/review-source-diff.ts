import { changedLines, diffRegions, unifiedDiff } from "./line-diff";
import type { ReviewScope } from "./review-git";
import { reviewOwnerBody, type ReviewRequestContext } from "./review-owner";

/**
 * What a review says about one file, read fresh, for the source view.
 *
 * The view never carries a diff from the moment it was opened. It asks the
 * review for this file as it is now, and the answer carries the revision that
 * content belongs to, so the marks beside the text and the patch the Copy diff
 * button hands over are the comparison the review is making rather than the
 * one it was making when a tab was opened.
 *
 * It asks for the current version by name instead of pinning the revision the
 * panel displayed. A displayed digest is a hash of that read's patch, so it
 * differs when whitespace is ignored or when the repository has clean or
 * smudge filters configured, and pinning it would refuse the read forever in
 * exactly those repositories.
 *
 * Both refusals the contents route can give are passed through rather than
 * worked around. A stale revision means the file moved while this was being
 * read, and a recorded turn has no full text at all; in neither case is the
 * file on disk read as though it were the historical side.
 */

export type ReviewSourceDiff =
  | {
    status: "ready";
    revision: string;
    /** One-based lines of the comparison's new side that this change introduced. */
    changed: number[];
    /**
     * That new side's own text.
     *
     * Kept because those line numbers belong to it, not to the file on screen.
     * A staged or committed comparison is measured against a version the
     * working copy may have moved on from, and the two are only lined up by
     * comparing them.
     */
    newText: string;
    patch: string | null;
    tooDifferent: boolean;
  }
  | { status: "unavailable"; message: string };

const MESSAGES: Record<string, string> = {
  stale: "This file changed while it was being read. Refresh to mark it again.",
  "not-in-review": "This file is no longer part of this review.",
  binary: "This file is binary in the review, so its change cannot be marked.",
  "too-large": "This file is past the review's 2 MB limit, so its change cannot be marked.",
  unsupported: "A recorded turn does not carry full file text, so its change cannot be marked here.",
  unavailable: "The review could not read this file's change.",
};

export async function readReviewSourceDiff(
  context: ReviewRequestContext,
  scope: ReviewScope,
  relativePath: string,
  signal?: AbortSignal,
): Promise<ReviewSourceDiff> {
  try {
    const sidesResponse = await fetch("/api/git/review/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(reviewOwnerBody(context, { scope, path: relativePath, current: true })),
    });
    const sides = await sidesResponse.json() as {
      status?: string; revision?: string; oldContents?: string | null; newContents?: string | null; oldName?: string; newName?: string; error?: string;
    };
    if (!sidesResponse.ok) return { status: "unavailable", message: sides.error ?? MESSAGES.unavailable };
    if (sides.status !== "ready") return { status: "unavailable", message: MESSAGES[sides.status ?? "unavailable"] ?? MESSAGES.unavailable };
    const revision = sides.revision ?? "";

    const oldText = sides.oldContents ?? "";
    const newText = sides.newContents ?? "";
    const regions = diffRegions(oldText.split("\n"), newText.split("\n"));
    if (!regions) return { status: "ready", revision, changed: [], newText, patch: null, tooDifferent: true };
    return {
      status: "ready",
      revision,
      changed: changedLines(regions),
      newText,
      patch: unifiedDiff(oldText, newText, {
        oldName: sides.oldName ?? relativePath,
        newName: sides.newName ?? relativePath,
      }),
      tooDifferent: false,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { status: "unavailable", message: MESSAGES.unavailable };
  }
}
