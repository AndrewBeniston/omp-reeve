import { reviewOwnerBody, type ReviewRequestContext } from "./review-owner";
import type { ReviewRepositoryInitOutcome } from "./review-repository-init";

/**
 * Ask the server to start a Git repository where this Review Tab is open.
 *
 * A refusal comes back as a refusal rather than as a thrown error: the empty
 * state has a place to print what Git said, and a message the human can act on
 * is the whole point of offering the action.
 */
export async function requestReviewRepository(
  context: ReviewRequestContext,
  signal?: AbortSignal,
): Promise<ReviewRepositoryInitOutcome> {
  const response = await fetch("/api/git/review/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reviewOwnerBody(context, {})),
    signal,
  });
  const value = await response.json().catch(() => null);
  if (response.ok && value?.status === "created" && typeof value.repositoryRoot === "string") {
    return { status: "created", repositoryRoot: value.repositoryRoot };
  }
  const reason = value?.reason === "already-a-repository" || value?.reason === "git-missing" ? value.reason : "failed";
  return {
    status: "refused",
    reason,
    message: typeof value?.error === "string" && value.error ? value.error : "A Git repository could not be started here.",
  };
}
