import type { Page, PullRequestSummary, ReviewGitHubIdentity, ReviewGitHubRemote, ReviewPublishOutcome, ReviewPublishRequest, ReviewThread } from "./review-github";
import type { ReviewDiff } from "./review-git";
import { githubPublication, githubPublicationOutcome, githubReviewMessage } from "./review-pr-publication";
import { reviewOwnerBody, reviewOwnerSearchParams, type ReviewRequestContext } from "./review-owner";
import type { ReviewPrAccess, ReviewPrClient, ReviewPrRepository, ReviewPrSummary } from "./review-pr-ui";

interface ContextAnswer {
  remotes: ReviewGitHubRemote[];
  selected: ReviewGitHubRemote;
  access:
    | { status: "ready"; identity: ReviewGitHubIdentity }
    | { status: "unavailable"; reason: string; message: string };
}

interface Refusal {
  reason?: string;
  error?: string;
}

/** The server's own words where it has them, and this module's where it does not. */
function refusalMessage(value: Refusal, fallback: string): string {
  if (value.error) return value.error;
  return value.reason ? githubReviewMessage(value.reason) : fallback;
}

async function read<T>(path: string, params: URLSearchParams, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${path}?${params}`, { signal, cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(refusalMessage(value as Refusal, "GitHub review data could not be loaded."));
  return value as T;
}

function repository(remote: ReviewGitHubRemote, account: string): ReviewPrRepository {
  return { remoteId: remote.id, hostname: remote.host, owner: remote.owner, repository: remote.name, account };
}

function sameRepository(left: ReviewPrRepository, right: ReviewPrRepository): boolean {
  return left.remoteId === right.remoteId && left.hostname.toLowerCase() === right.hostname.toLowerCase()
    && left.owner.toLowerCase() === right.owner.toLowerCase() && left.repository.toLowerCase() === right.repository.toLowerCase();
}

function summary(pull: PullRequestSummary): ReviewPrSummary {
  const state = pull.state.toLowerCase();
  return { number: pull.number, title: pull.title, author: pull.author, state: state === "merged" ? "merged" : state === "closed" ? "closed" : "open",
    isDraft: pull.isDraft, baseBranch: pull.baseRefName, headBranch: pull.headRefName, headSha: pull.headSha, baseSha: pull.baseSha, url: pull.url };
}

/**
 * The access answer, with the reason in it when there is one.
 *
 * A failure here is a state the panel shows, not an exception it swallows:
 * every path that cannot read says why, so nothing downstream has to guess
 * whether an empty list means empty or means locked out.
 */
async function readAccess(owner: ReviewRequestContext, remoteId: string | null, signal: AbortSignal): Promise<ReviewPrAccess> {
  const params = reviewOwnerSearchParams(owner, { kind: "context", ...(remoteId ? { remoteId } : {}) });
  const response = await fetch(`/api/git/review/github?${params}`, { signal, cache: "no-store" });
  const value = await response.json();
  if (!response.ok) {
    const refusal = value as Refusal;
    return { status: "unavailable", repositories: [], selected: null, reason: refusal.reason ?? "remote-unavailable",
      message: refusalMessage(refusal, "This Project's pull requests could not be read.") };
  }
  const answer = value as ContextAnswer;
  const account = answer.access.status === "ready" ? answer.access.identity.login : "";
  const repositories = answer.remotes.map((remote) => repository(remote, remote.id === answer.selected.id ? account : ""));
  const selected = repositories.find((item) => item.remoteId === answer.selected.id) ?? repository(answer.selected, account);
  if (answer.access.status !== "ready") {
    return { status: "unavailable", repositories, selected, reason: answer.access.reason, message: answer.access.message };
  }
  return { status: "ready", repositories, selected, account,
    permissionsKnown: answer.access.identity.permissionsKnown, canPush: answer.access.identity.canPush };
}

/**
 * The access this read depends on, or the reason it cannot happen.
 *
 * The repository is resolved again on every call, so a remote repointed
 * underneath a browser, or an account swapped in another window, stops the
 * read instead of answering it from somewhere else.
 */
async function checkedAccess(owner: ReviewRequestContext, selected: ReviewPrRepository, signal: AbortSignal) {
  const access = await readAccess(owner, selected.remoteId, signal);
  if (access.status !== "ready") throw new Error(access.message);
  if (!sameRepository(selected, access.selected)) throw new Error("The repository remote changed. Select the repository again.");
  if (selected.account && selected.account !== access.account) throw new Error(githubReviewMessage("account-changed"));
  return access;
}

/**
 * Why writing is closed, where it is.
 *
 * Read from the access answer rather than from a thread's own flags. The host
 * tells a reader what it may do with each thread, but those flags describe the
 * thread, not whether this account's standing in the repository could be
 * established at all. One answer, so what the panel offers and what publishing
 * permits cannot disagree.
 */
function permissionRestriction(access: { permissionsKnown: boolean }): string | null {
  return access.permissionsKnown
    ? null
    : "GitHub did not confirm what this account may do in this repository, so this discussion is read-only. Check the sign-in and access, then refresh.";
}

export const reviewPrClient: ReviewPrClient = {
  access(owner, remoteId, signal) {
    return readAccess(owner, remoteId, signal);
  },
  async pulls(owner, selected, query, signal) {
    await checkedAccess(owner, selected, signal);
    const value = await read<Page<PullRequestSummary>>("/api/git/review/github", reviewOwnerSearchParams(owner, { kind: "pulls",
      remoteId: selected.remoteId, filter: query.view, state: query.state, query: query.search, limit: "100" }), signal);
    return { items: value.items.map(summary), complete: value.complete, nextCursor: null };
  },
  async snapshot(owner, selected, pull, signal) {
    const access = await checkedAccess(owner, selected, signal);
    // A selection stored before pull requests carried both ends names half a
    // comparison. Opening it would read against a pair nobody chose.
    if (!pull.headSha || !pull.baseSha) {
      throw new Error("This pull request was opened before its base was recorded. Return to the list and open it again.");
    }
    const diff = await read<ReviewDiff>("/api/git/review", reviewOwnerSearchParams(owner, { scope: "pullRequest",
      remoteId: selected.remoteId, number: String(pull.number), headSha: pull.headSha, baseSha: pull.baseSha }), signal);
    const scope = diff.scope as { kind: string; remoteId?: string; number?: number; headSha?: string; baseSha?: string };
    // Both ends, every time. An answer that matches on one of them describes a
    // comparison nobody asked to read.
    if (scope.kind !== "pullRequest" || scope.remoteId !== selected.remoteId || scope.number !== pull.number
      || scope.headSha !== pull.headSha || scope.baseSha !== pull.baseSha) {
      throw new Error("The pull request revision changed. Return to the list and refresh before reviewing it.");
    }
    const restriction = permissionRestriction(access);
    return { identity: { ...selected, account: access.account, number: pull.number, headSha: pull.headSha, baseSha: pull.baseSha },
      summary: pull, diff, commentRestriction: restriction,
      // GitHub decides final eligibility; push access is not required to review.
      canComment: restriction === null,
      canApprove: restriction === null && pull.state === "open" && pull.author !== access.account,
      canRequestChanges: restriction === null && pull.state === "open" && pull.author !== access.account };
  },
  async threads(owner, identity, _cursor, signal) {
    await checkedAccess(owner, identity, signal);
    const page = await read<Page<ReviewThread>>("/api/git/review/github", reviewOwnerSearchParams(owner, { kind: "threads", remoteId: identity.remoteId,
      number: String(identity.number), headSha: identity.headSha, baseSha: identity.baseSha }), signal);
    return { complete: page.complete, nextCursor: null, items: page.items.map((thread) => ({
      id: thread.id, path: thread.path, startLine: thread.line, endLine: thread.line,
      side: thread.side === "LEFT" ? "deletions" : "additions", resolved: thread.resolved, outdated: thread.outdated,
      canReply: thread.viewerCanReply, canResolve: thread.resolved ? thread.viewerCanUnresolve : thread.viewerCanResolve,
      comments: thread.comments.map((comment) => ({ ...comment, canEdit: comment.viewerCanEdit, canDelete: comment.viewerCanDelete })),
    })) };
  },
  /**
   * Where the pull request stands now, for the check made before submitting.
   *
   * A failure here answers null rather than throwing. Not being able to ask
   * is not evidence that nothing moved, and the caller reports it as an
   * unknown; treating a failed check as "unchanged" is how a review ends up
   * published against code the reviewer never saw.
   */
  async revisions(owner, identity, signal) {
    try {
      return await read<{ headSha: string; baseSha: string }>("/api/git/review/github",
        reviewOwnerSearchParams(owner, { kind: "revisions", remoteId: identity.remoteId, number: String(identity.number) }), signal);
    } catch {
      return null;
    }
  },
  async publish(owner, identity, publication) {
    let restriction: string | null;
    try {
      restriction = permissionRestriction(await checkedAccess(owner, identity, new AbortController().signal));
    } catch (error) {
      return { kind: "refused", message: error instanceof Error ? error.message : "The GitHub account could not be verified." };
    }
    // The same gate the panel draws from, applied again here. A tab left open
    // through a change of standing must not be the thing that decides.
    if (restriction) return { kind: "refused", message: restriction };
    /*
     * The base travels only with a publication that was written against one.
     * A review and a line comment describe a comparison, so both ends are
     * pinned and a rebased base refuses them. A reply, an edit, a deletion or
     * a resolve is about a thread rather than a diff, and demanding a base
     * there would refuse them whenever the host declined to report one they
     * never used.
     */
    const anchored = publication.action === "review" || publication.action === "inline";
    const body: ReviewPublishRequest = reviewOwnerBody(owner, { remoteId: identity.remoteId, number: identity.number,
      expectedHeadSha: identity.headSha, ...(anchored ? { expectedBaseSha: identity.baseSha } : {}),
      publication: githubPublication(publication) });
    const response = await fetch("/api/git/review/github/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const outcome = await response.json() as ReviewPublishOutcome;
    if (!["published", "refused", "unavailable", "uncertain"].includes(outcome.status)) {
      return { kind: "uncertain", message: "Publication could not be confirmed. Check GitHub before trying again; your draft is retained." };
    }
    return githubPublicationOutcome(outcome);
  },
};
