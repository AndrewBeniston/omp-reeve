import type { ReviewScope } from "./review-git";

/**
 * The scope a request names, or nothing.
 *
 * A recorded turn is accepted here so a route can answer "this scope has no
 * file text" rather than refuse a request that reads like a broken one.
 */
export function parseReviewScope(value: unknown): ReviewScope | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, base, revision, sessionId } = value as Record<string, unknown>;
  if (kind === "staged" || kind === "unstaged" || kind === "uncommitted") return { kind };
  if (kind === "branch" && typeof base === "string" && base.trim()) return { kind, base: base.trim() };
  if (kind === "commit" && typeof revision === "string" && revision.trim()) return { kind, revision: revision.trim() };
  if (kind === "lastTurn" && typeof sessionId === "string" && sessionId.trim()) return { kind, sessionId: sessionId.trim() };
  return null;
}

/** A repository-relative path a request may name at all. */
export function isReviewRequestPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0");
}

/*
 * A scope in a query string.
 *
 * Its own key names, rather than `scope` and `revision`, because `revision`
 * already means the file digest on these routes and one name for two things
 * is how the wrong one gets read.
 */
export function reviewScopeSearchParams(scope: ReviewScope): Record<string, string> {
  if (scope.kind === "branch") return { scopeKind: scope.kind, scopeBase: scope.base };
  if (scope.kind === "commit") return { scopeKind: scope.kind, scopeRevision: scope.revision };
  if (scope.kind === "lastTurn") return { scopeKind: scope.kind, scopeSessionId: scope.sessionId };
  return { scopeKind: scope.kind };
}

export function parseReviewScopeParams(params: URLSearchParams): ReviewScope | null {
  return parseReviewScope({
    kind: params.get("scopeKind"),
    base: params.get("scopeBase"),
    revision: params.get("scopeRevision"),
    sessionId: params.get("scopeSessionId"),
  });
}

/**
 * The pull request a preview is being read against.
 *
 * Git holds no revision of this comparison, so the pair the panel is showing
 * is the pin. It is carried in the request and checked against the host on
 * both sides of every read, which is what stops a preview answering with
 * bytes from a revision nobody was looking at.
 *
 * Kept out of `ReviewScope` on purpose: every reader in the Git layer refuses
 * a scope it cannot resolve to a revision, and this one it cannot.
 */
export interface ReviewPrScope {
  kind: "pullRequest";
  remoteId: string;
  number: number;
  headSha: string;
  baseSha: string;
}

/** Every scope a preview can be asked for. */
export type ReviewPreviewScope = ReviewScope | ReviewPrScope;

export function isReviewPrScope(scope: ReviewPreviewScope): scope is ReviewPrScope {
  return scope.kind === "pullRequest";
}

/*
 * A revision as a host writes one. Stated here rather than imported from the
 * GitHub layer because this module is read in the browser, and that layer
 * runs commands.
 */
const HOST_REVISION = /^[0-9a-f]{40}$/i;

/**
 * The pull request a request names, or nothing.
 *
 * Half a pair pins nothing, so a request carrying one end is refused rather
 * than completed from the host. A number arrives as text in a query string
 * and as a number in a body, and both are read here.
 */
export function parseReviewPrScope(value: unknown): ReviewPrScope | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, remoteId, number, headSha, baseSha } = value as Record<string, unknown>;
  if (kind !== "pullRequest") return null;
  if (typeof remoteId !== "string" || !remoteId.trim()) return null;
  const count = typeof number === "string" ? Number(number) : number;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
  if (typeof headSha !== "string" || !HOST_REVISION.test(headSha)) return null;
  if (typeof baseSha !== "string" || !HOST_REVISION.test(baseSha)) return null;
  return {
    kind: "pullRequest",
    remoteId: remoteId.trim(),
    number: count,
    headSha: headSha.toLowerCase(),
    baseSha: baseSha.toLowerCase(),
  };
}

export function parseReviewPreviewScope(value: unknown): ReviewPreviewScope | null {
  return parseReviewScope(value) ?? parseReviewPrScope(value);
}

export function reviewPreviewScopeSearchParams(scope: ReviewPreviewScope): Record<string, string> {
  if (isReviewPrScope(scope)) {
    return {
      scopeKind: scope.kind,
      scopeRemoteId: scope.remoteId,
      scopeNumber: String(scope.number),
      scopeHeadSha: scope.headSha,
      scopeBaseSha: scope.baseSha,
    };
  }
  return reviewScopeSearchParams(scope);
}

export function parseReviewPreviewScopeParams(params: URLSearchParams): ReviewPreviewScope | null {
  return parseReviewScopeParams(params) ?? parseReviewPrScope({
    kind: params.get("scopeKind"),
    remoteId: params.get("scopeRemoteId"),
    number: params.get("scopeNumber"),
    headSha: params.get("scopeHeadSha"),
    baseSha: params.get("scopeBaseSha"),
  });
}
