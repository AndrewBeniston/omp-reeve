import type { ReviewDiff } from "./review-git";
import type { ReviewRequestContext } from "./review-owner";

export interface ReviewPrRepository {
  remoteId: string;
  hostname: string;
  owner: string;
  repository: string;
  account: string;
}

/**
 * Whether this Project's pull requests can be read at all, and by whom.
 *
 * Kept separate from the list itself so the panel can tell three states
 * apart: still checking, cannot read and why, and read successfully but
 * empty. Folding the middle one into the last is how a missing sign-in comes
 * to look like a repository with no pull requests.
 */
export type ReviewPrAccess =
  | {
      status: "ready";
      repositories: ReviewPrRepository[];
      selected: ReviewPrRepository;
      account: string;
      /** False where the host declined to say what this account may do. */
      permissionsKnown: boolean;
      canPush: boolean;
    }
  | {
      status: "unavailable";
      repositories: ReviewPrRepository[];
      selected: ReviewPrRepository | null;
      reason: string;
      message: string;
    };

export interface ReviewPrSummary {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
  author: string;
  baseBranch: string;
  headBranch: string;
  headSha: string;
  /** The other end of the comparison. Never carried apart from the head. */
  baseSha: string;
  url: string;
}

export interface ReviewPrIdentity extends ReviewPrRepository {
  number: number;
  headSha: string;
  baseSha: string;
}

export interface ReviewPrComment {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  url: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface ReviewPrThread {
  id: string;
  path: string;
  side: "additions" | "deletions";
  startLine: number | null;
  endLine: number | null;
  resolved: boolean;
  outdated: boolean;
  canReply: boolean;
  canResolve: boolean;
  comments: ReviewPrComment[];
}

export interface ReviewPrSnapshot {
  identity: ReviewPrIdentity;
  summary: ReviewPrSummary;
  diff: ReviewDiff;
  canComment: boolean;
  canApprove: boolean;
  canRequestChanges: boolean;
  /**
   * Why commenting is closed, where it is. Present so the panel can say what
   * the account may not do instead of offering a form that would be refused.
   */
  commentRestriction: string | null;
}

export interface ReviewPrPage<T> {
  items: T[];
  nextCursor: string | null;
  complete: boolean;
}

/**
 * What the list area says, when it has one thing to say.
 *
 * One decision, taken in one place, because the states that matter here are
 * the ones easiest to confuse in a component: checking is not empty, and
 * cannot-read is not empty either. A reviewer told "no pull requests" when the
 * truth is "not signed in" goes looking for work that was there all along.
 */
export type ReviewPrListMessage =
  | { kind: "checking"; message: string; retry: false }
  | { kind: "unavailable"; message: string; retry: true }
  | { kind: "failed"; message: string; retry: true }
  | { kind: "loading"; message: string; retry: false }
  | { kind: "empty"; message: string; retry: false }
  | { kind: "listed"; message: null; retry: false };

export function reviewPrListMessage(input: {
  access: ReviewPrAccess | null;
  error: string | null;
  loading: boolean;
  items: ReviewPrSummary[] | null;
  search: string;
}): ReviewPrListMessage {
  if (input.access === null) return { kind: "checking", message: "Checking GitHub access…", retry: false };
  if (input.access.status === "unavailable") return { kind: "unavailable", message: input.access.message, retry: true };
  if (input.error) return { kind: "failed", message: input.error, retry: true };
  if (input.items === null || input.loading) return { kind: "loading", message: "Loading pull requests…", retry: false };
  if (input.items.length === 0) {
    return { kind: "empty", retry: false, message: input.search
      ? "No pull requests match this search."
      : "This repository has no pull requests in this view." };
  }
  return { kind: "listed", message: null, retry: false };
}

/**
 * Where a published thread can be drawn, and where it cannot.
 *
 * A thread carries the line the host placed it on in the revision being read.
 * Where that line is missing the thread belongs to code this revision does not
 * show, and drawing it against a nearby line would put someone's words on
 * something they were not written about. Those threads are kept whole and
 * shown away from the diff instead of being placed wrongly.
 */
export function reviewPrThreadPlacement(threads: ReviewPrThread[], path?: string): {
  anchored: ReviewPrThread[];
  unanchored: ReviewPrThread[];
} {
  const anchored: ReviewPrThread[] = [];
  const unanchored: ReviewPrThread[] = [];
  for (const thread of threads) {
    if (path !== undefined && thread.path !== path) continue;
    (thread.startLine === null ? unanchored : anchored).push(thread);
  }
  return { anchored, unanchored };
}

/** How a published thread names the lines it was left on. */
export function reviewPrThreadRangeLabel(thread: ReviewPrThread): string {
  const column = thread.side === "additions" ? "new" : "old";
  if (thread.startLine === null) return "Not in this revision";
  return thread.endLine !== null && thread.endLine !== thread.startLine
    ? `Lines ${thread.startLine}–${thread.endLine} (${column})`
    : `Line ${thread.startLine} (${column})`;
}

/**
 * Whether one action may be offered at all.
 *
 * Two gates, and the snapshot's is the outer one. A thread carries what the
 * host says the viewer may do with that thread, but if this revision could not
 * establish what the account may do here at all, none of those flags is
 * something to act on: a reply button beside a notice saying the discussion is
 * read-only is the interface contradicting itself, and it is the kind of
 * contradiction that ends in a refused write a human was invited to attempt.
 */
export function reviewPrActionAllowed(input: {
  restriction: string | null;
  canComment: boolean;
  canApprove: boolean;
  canRequestChanges: boolean;
  threads: ReviewPrThread[];
  publication: ReviewPrPublication;
}): boolean {
  if (input.restriction !== null) return false;
  const { publication, threads } = input;
  const thread = (id: string) => threads.find((entry) => entry.id === id);
  switch (publication.action) {
    case "review":
      return publication.event === "approve" ? input.canApprove
        : publication.event === "request_changes" ? input.canRequestChanges
        : input.canComment;
    case "inline":
      return input.canComment;
    case "reply":
      return thread(publication.threadId)?.canReply === true;
    case "resolve":
    case "unresolve":
      return thread(publication.threadId)?.canResolve === true;
    case "edit":
    case "delete":
      return threads.some((entry) => entry.comments.some((comment) => comment.id === publication.commentId
        && (publication.action === "edit" ? comment.canEdit : comment.canDelete)));
  }
}

/** One line comment carried by a submission, on the side the diff shows it. */
export interface ReviewPrInlineComment {
  path: string;
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
  body: string;
}

export type ReviewPrPublication =
  | { action: "inline"; body: string; path: string; side: "additions" | "deletions"; startLine: number; endLine: number }
  | { action: "reply"; body: string; threadId: string }
  | { action: "edit"; body: string; commentId: string }
  | { action: "delete"; commentId: string }
  | { action: "resolve" | "unresolve"; threadId: string }
  /**
   * A verdict, and the line comments that go with it.
   *
   * GitHub takes a review as one object, so the summary and its comments are
   * published together or not at all. Absent comments means a verdict on its
   * own, which is what the existing callers send.
   */
  | { action: "review"; event: "comment" | "approve" | "request_changes"; body: string; comments?: ReviewPrInlineComment[] };

export type ReviewPrPublishResult =
  | { kind: "confirmed"; ids: string[] }
  | { kind: "refused"; message: string }
  | { kind: "uncertain"; message: string };

/**
 * UI boundary; the HTTP adapter is wired to the backend's validated contract.
 *
 * Every method carries the Review Tab's owner rather than a directory, so a
 * pull-request request is authorized the same way a diff request is.
 */
export interface ReviewPrClient {
  access(context: ReviewRequestContext, remoteId: string | null, signal: AbortSignal): Promise<ReviewPrAccess>;
  pulls(context: ReviewRequestContext, repository: ReviewPrRepository, query: {
    search: string;
    state: "all" | "open" | "closed" | "merged";
    view: "all" | "reviewing" | "authored";
    cursor: string | null;
  }, signal: AbortSignal): Promise<ReviewPrPage<ReviewPrSummary>>;
  snapshot(context: ReviewRequestContext, repository: ReviewPrRepository, pull: ReviewPrSummary, signal: AbortSignal): Promise<ReviewPrSnapshot>;
  threads(context: ReviewRequestContext, identity: ReviewPrIdentity, cursor: string | null, signal: AbortSignal): Promise<ReviewPrPage<ReviewPrThread>>;
  /**
   * The pair this pull request is on right now, or null where the host would
   * not say. Null is an unknown, and an unknown is never read as unchanged.
   */
  revisions(context: ReviewRequestContext, identity: ReviewPrIdentity, signal: AbortSignal): Promise<{ headSha: string; baseSha: string } | null>;
  publish(context: ReviewRequestContext, identity: ReviewPrIdentity, publication: ReviewPrPublication): Promise<ReviewPrPublishResult>;
}
