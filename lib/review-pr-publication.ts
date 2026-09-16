import type { ReviewCommentDraft, ReviewPublication, ReviewPublishOutcome } from "./review-github";
import type { ReviewPrInlineComment, ReviewPrPublication, ReviewPrPublishResult } from "./review-pr-ui";

/** One side for both ends of a range: a comment never spans the two columns. */
function commentDraft(comment: ReviewPrInlineComment): ReviewCommentDraft {
  const side = comment.side === "additions" ? "RIGHT" : "LEFT";
  return {
    body: comment.body, path: comment.path, side, line: comment.endLine,
    ...(comment.startLine !== comment.endLine ? { startLine: comment.startLine, startSide: side } : {}),
  };
}

export function githubPublication(publication: ReviewPrPublication): ReviewPublication {
  switch (publication.action) {
    case "inline":
      return { action: "submitReview", event: "COMMENT", body: "", comments: [commentDraft(publication)] };
    case "review": return { action: "submitReview", body: publication.body, comments: (publication.comments ?? []).map(commentDraft),
      event: publication.event === "approve" ? "APPROVE" : publication.event === "request_changes" ? "REQUEST_CHANGES" : "COMMENT" };
    case "reply": return { action: "replyToThread", threadId: publication.threadId, body: publication.body };
    case "edit": return { action: "editComment", commentId: publication.commentId, body: publication.body };
    case "delete": return { action: "deleteComment", commentId: publication.commentId };
    case "resolve": return { action: "resolveThread", threadId: publication.threadId };
    case "unresolve": return { action: "unresolveThread", threadId: publication.threadId };
  }
}

const REASONS: Record<string, string> = {
  "gh-missing": "Install GitHub CLI to review pull requests here.",
  "auth-required": "Sign in with GitHub CLI for this repository's host, then refresh.",
  "remote-unavailable": "GitHub could not load this repository. Check access and the connection, then refresh.",
  "not-a-github-remote": "This Project has no supported GitHub remote.",
  "head-moved": "The pull request changed. Your draft is retained on its original revision. Refresh before reviewing the new changes.",
  "base-moved": "The pull request now compares against a different base. Your draft is retained on the base it was written against. Refresh before reviewing the new comparison.",
  "not-permitted": "The current GitHub account cannot perform this action.",
  "account-changed": "The GitHub account changed. Refresh and review the account before publishing.",
  "thread-not-in-pull-request": "This thread no longer belongs to the selected pull request.",
  "comment-not-in-pull-request": "This comment no longer belongs to the selected pull request.",
  "path-not-in-pull-request": "This file is not in the selected pull request revision.",
  "line-not-in-revision": "These lines are not in the selected pull request revision.",
  "empty-body": "Write a comment before publishing.",
};

export function githubReviewMessage(reason: string): string {
  return REASONS[reason] ?? "The GitHub review request could not be completed. Your local drafts are retained.";
}

export function githubPublicationOutcome(outcome: ReviewPublishOutcome): ReviewPrPublishResult {
  switch (outcome.status) {
    case "published": return { kind: "confirmed", ids: [outcome.commentId, outcome.threadId].filter((id): id is string => Boolean(id)) };
    case "refused":
    case "unavailable": return { kind: "refused", message: githubReviewMessage(outcome.reason) };
    case "uncertain": return { kind: "uncertain", message: "Publication could not be confirmed. Check GitHub before trying again; this draft is retained." };
  }
}
