import type { FileDiffContentsLoader } from "@pierre/diffs";
import type { ReviewScope } from "./review-git";
import { reviewOwnerBody, type ReviewRequestContext } from "./review-owner";

export interface ReviewExpansionRequest {
  /** Whose review this is, which the server checks before reading a file. */
  context: ReviewRequestContext;
  scope: ReviewScope;
  path: string;
  revision: string;
}

const MESSAGES: Record<string, string> = {
  stale: "This file changed. Refresh Review before expanding it.",
  "not-in-review": "This file is no longer in this review. Refresh Review.",
  binary: "Binary files cannot be expanded as text.",
  "too-large": "This file exceeds the 2 MB expansion limit.",
  unsupported: "Full-file context is not available for this scope.",
  unavailable: "Full-file context could not be loaded for this version.",
};

/** One frozen displayed revision, shared by any repeated renderer requests. */
export function createReviewContentsLoader(request: ReviewExpansionRequest, signal: AbortSignal, onError: (message: string) => void): FileDiffContentsLoader {
  let pending: ReturnType<FileDiffContentsLoader> | undefined;
  return (file) => {
    if (file.name !== request.path) return Promise.reject(new Error("Expansion path does not match this diff."));
    pending ??= (async () => {
      try {
        const response = await fetch("/api/git/review/contents", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify(reviewOwnerBody(request.context, {
            scope: request.scope, path: request.path, revision: request.revision,
          })),
        });
        const value = await response.json();
        if (signal.aborted) throw new Error("Expansion cancelled");
        if (!response.ok || value.status !== "ready") throw new Error(MESSAGES[value.status] ?? MESSAGES.unavailable);
        if (value.newName !== request.path || value.oldName !== (file.prevName ?? file.name) || typeof value.newContents !== "string" || (file.type !== "rename-pure" && typeof value.oldContents !== "string")) throw new Error(MESSAGES.unavailable);
        return {
          oldFile: file.type === "rename-pure" ? null : { name: value.oldName, contents: value.oldContents },
          newFile: { name: value.newName, contents: value.newContents },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : MESSAGES.unavailable;
        if (!signal.aborted) onError(message);
        throw error;
      }
    })();
    return pending;
  };
}
