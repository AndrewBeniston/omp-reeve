import { canonicalReviewCwd, reviewTabMatchesSession } from "./review-comments";

/**
 * Who a Review Tab belongs to: one Project, one Worktree, one Session.
 *
 * All three are carried because two Worktrees of one Project hold different
 * changes, and two Sessions can work in one Worktree.
 *
 * A Tab may have no Session: a Project can be open before one exists. That
 * stays `null`, and the selected Session is never substituted into it.
 */
export interface ReviewOwner {
  /** The main checkout every Worktree of this Project shares. */
  projectRoot: string;
  /** The Worktree this Tab reads, which is the directory Git is run in. */
  worktreePath: string;
  /** The Session this Tab was opened beside, or null for a Project with none. */
  sessionId: string | null;
}

/** A Tab, and the owner it was registered with. Every request carries both. */
export interface ReviewRequestContext {
  tabId: string;
  owner: ReviewOwner;
}

/**
 * One spelling of an owner.
 *
 * Encoded as JSON rather than joined with separators: a directory may contain
 * any separator we could pick, and two owners that encode to one key would
 * hand one Session's Tab to another.
 */
export function reviewOwnerKey(owner: ReviewOwner): string {
  return JSON.stringify([
    canonicalReviewCwd(owner.projectRoot),
    canonicalReviewCwd(owner.worktreePath),
    owner.sessionId,
  ]);
}

/** The Tab id an owner opens into, so one owner never opens two Tabs. */
export function reviewTabIdFor(owner: ReviewOwner): string {
  return `review:${reviewOwnerKey(owner)}`;
}

export function sameReviewOwner(left: ReviewOwner, right: ReviewOwner): boolean {
  return reviewOwnerKey(left) === reviewOwnerKey(right);
}

/** A path a request may name at all: absolute, and not a relative escape. */
function isAbsolutePathValue(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/**
 * The owner and Tab a request names, or nothing.
 *
 * Reads from a query string or a parsed body without caring which, because the
 * same tuple travels both ways and a rule that held for reads but not for
 * writes would be no rule at all. Nothing here authorizes anything: it decides
 * only whether the request is shaped like an owner.
 */
export function parseReviewRequestContext(
  source: URLSearchParams | Record<string, unknown> | null | undefined,
): ReviewRequestContext | null {
  if (!source) return null;
  const read = (name: string): unknown => source instanceof URLSearchParams ? source.get(name) : source[name];
  const text = (name: string): string => {
    const value = read(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const tabId = text("tabId");
  const worktreePath = text("cwd");
  const projectRoot = text("projectRoot");
  if (!tabId || !worktreePath || !projectRoot) return null;
  if (!isAbsolutePathValue(worktreePath) || !isAbsolutePathValue(projectRoot)) return null;
  const sessionValue = read("sessionId");
  const sessionId = typeof sessionValue === "string" && sessionValue.trim() ? sessionValue.trim() : null;
  if (sessionValue !== null && sessionValue !== undefined && typeof sessionValue !== "string") return null;
  return { tabId, owner: { projectRoot, worktreePath, sessionId } };
}

/** The owner as an endpoint receives it. `cwd` is the Worktree Git runs in. */
export interface ReviewOwnerFields {
  tabId: string;
  cwd: string;
  projectRoot: string;
  sessionId?: string;
}

export function reviewOwnerFields(context: ReviewRequestContext): ReviewOwnerFields {
  const fields: ReviewOwnerFields = {
    tabId: context.tabId,
    cwd: context.owner.worktreePath,
    projectRoot: context.owner.projectRoot,
  };
  if (context.owner.sessionId) fields.sessionId = context.owner.sessionId;
  return fields;
}

/** A field a caller may not set: the owner decides these, not the call site. */
type NotOwnerFields<T> = T & Partial<Record<"tabId" | "cwd" | "projectRoot" | "sessionId", never>>;

/**
 * The owner as query parameters, for a GET or an EventSource. The owner is
 * written last so a caller's own parameter cannot replace part of it.
 */
export function reviewOwnerSearchParams(
  context: ReviewRequestContext,
  extra: NotOwnerFields<Record<string, string>> = {},
): URLSearchParams {
  return new URLSearchParams({ ...extra, ...reviewOwnerFields(context) } as Record<string, string>);
}

/** The owner at the head of a request body, under the same rule. */
export function reviewOwnerBody<T extends Record<string, unknown>>(
  context: ReviewRequestContext,
  rest: NotOwnerFields<T>,
): T & ReviewOwnerFields {
  return { ...rest, ...reviewOwnerFields(context) } as T & ReviewOwnerFields;
}

/**
 * The Session a Tab may write into, which is only ever its own.
 *
 * Two things have to hold: the Tab's Worktree is the directory the selected
 * Session is working in, which is the rule the comment layer already applies,
 * and the Tab was opened beside that same Session. A Tab bound to no Session,
 * or to a different one, hands nothing over — the composer it would reach
 * belongs to a conversation its notes were not written for.
 */
export function reviewComposerSessionId(
  owner: ReviewOwner,
  activeCwd: string | null,
  selectedSessionId: string | null,
): string | null {
  if (!owner.sessionId || !selectedSessionId) return null;
  if (owner.sessionId !== selectedSessionId) return null;
  return reviewTabMatchesSession(owner.worktreePath, activeCwd) ? owner.sessionId : null;
}

/** The last segment of a path, without importing node's path into the browser. */
function directoryName(value: string): string {
  const segments = canonicalReviewCwd(value).split("/");
  return segments[segments.length - 1] || value;
}

export interface ReviewBindingLabel {
  /** The Worktree being read, which is what the panel names first. */
  worktree: string;
  /** The Project it belongs to. */
  project: string;
  /** True when the Worktree is the Project's own checkout. */
  isMainCheckout: boolean;
  /** Whether a Session is bound, which decides what the Tab can do. */
  hasSession: boolean;
}

/**
 * What a Tab says it is reviewing.
 *
 * Directory names only. A full path in the header would be the one part of
 * this panel that reads as a machine's rather than a human's, and the panel is
 * beside a chat that already knows where it is.
 */
export function reviewBindingLabel(owner: ReviewOwner): ReviewBindingLabel {
  const project = directoryName(owner.projectRoot);
  const worktree = directoryName(owner.worktreePath);
  return {
    worktree,
    project,
    isMainCheckout: canonicalReviewCwd(owner.projectRoot) === canonicalReviewCwd(owner.worktreePath),
    hasSession: owner.sessionId !== null,
  };
}

/** A Review Tab's label: the Worktree, when that is not the Project itself. */
export function reviewTabLabel(owner: ReviewOwner, base = "Review"): string {
  const binding = reviewBindingLabel(owner);
  return binding.isMainCheckout ? base : `${base} · ${binding.worktree}`;
}
