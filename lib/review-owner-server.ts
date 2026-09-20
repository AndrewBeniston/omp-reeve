import { NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { canonicalReviewCwd } from "@/lib/review-comments";
import { parseReviewRequestContext, reviewOwnerFields, reviewTabIdFor, sameReviewOwner, type ReviewRequestContext } from "@/lib/review-owner";
import type { StoredReviewTab } from "@/lib/review-tab-store";
import { findRegisteredReviewTab, ReviewTabRegistryUnreadable } from "@/lib/review-tab-registry";
import { listAllSessions } from "@/lib/session-reader";
import { resolveProject } from "@/lib/worktree";

/**
 * Whether a request may read or change what it says it is reviewing. Every
 * Review endpoint starts here, reads and writes alike.
 *
 * The tuple the browser sends is a claim: the Project is resolved from the
 * Worktree by Git, the Session is read from OMP's Sessions, and the Tab's
 * binding is read from Reeve's registry. The binding is the part a directory
 * check cannot do — two Sessions can share a Worktree, so naming the other
 * one is self-consistent and passes every path check.
 */
export type ReviewOwnerRefusalReason =
  | "malformed"
  | "denied"
  | "unregistered-tab"
  /** Reeve cannot read its own Tab registry, so it cannot say who owns this. */
  | "registry-unavailable"
  | "owner-mismatch"
  | "project-mismatch"
  /** OMP does not list this Session, so nothing here can vouch for it. */
  | "session-unknown"
  | "session-mismatch";

export interface ReviewOwnerRefusal {
  status: "refused";
  reason: ReviewOwnerRefusalReason;
  response: NextResponse;
}

export type ReviewOwnerAuthorization =
  | ({ status: "authorized" } & ReviewRequestContext)
  | ReviewOwnerRefusal;

/** What a refusal says out loud, which never describes anyone else's work. */
const REFUSALS: Record<ReviewOwnerRefusalReason, { error: string; http: number }> = {
  malformed: { error: "Select a Project directory.", http: 400 },
  denied: { error: "Access denied", http: 403 },
  "unregistered-tab": { error: "Access denied", http: 403 },
  "registry-unavailable": { error: "Reeve could not read its Review Tabs.", http: 503 },
  "owner-mismatch": { error: "Access denied", http: 403 },
  "project-mismatch": { error: "Access denied", http: 403 },
  "session-unknown": { error: "This Session is not one OMP is recording here.", http: 403 },
  "session-mismatch": { error: "Access denied", http: 403 },
};

function refuse(reason: ReviewOwnerRefusalReason): ReviewOwnerRefusal {
  const { error, http } = REFUSALS[reason];
  return { status: "refused", reason, response: NextResponse.json({ error, reason }, { status: http }) };
}

/**
 * The stored binding, or why it could not be read. An unreadable registry is
 * never reported as an unregistered Tab: that would tell a human their Tab is
 * unknown when Reeve simply cannot look.
 */
function registeredTab(tabId: string, agentDir?: string): StoredReviewTab | null | ReviewOwnerRefusal {
  try {
    return findRegisteredReviewTab(tabId, agentDir);
  } catch (error) {
    if (error instanceof ReviewTabRegistryUnreadable) return refuse("registry-unavailable");
    throw error;
  }
}

export interface AuthorizeReviewOwnerOptions {
  /**
   * This request creates the binding, so there is nothing to check it against
   * yet. The id must still be the one its owner derives, which stops a caller
   * minting an id that would later match another owner.
   */
  registering?: boolean;
  /** Where the Tab registry lives. Overridden only by a test's own directory. */
  agentDir?: string;
}

export async function authorizeReviewOwner(
  source: URLSearchParams | Record<string, unknown> | null | undefined,
  options: AuthorizeReviewOwnerOptions = {},
): Promise<ReviewOwnerAuthorization> {
  const context = parseReviewRequestContext(source);
  if (!context) return refuse("malformed");
  const { tabId, owner } = context;

  const roots = await getAllowedFileRoots();
  const allowed = (target: string) => isFilePathAllowed(target, roots) && isExistingFilePathAllowed(target, roots);
  if (!allowed(owner.worktreePath) || !allowed(owner.projectRoot)) return refuse("denied");

  if (options.registering) {
    if (tabId !== reviewTabIdFor(owner)) return refuse("owner-mismatch");
  } else {
    const registered = registeredTab(tabId, options.agentDir);
    if (registered && "status" in registered) return registered;
    if (!registered) return refuse("unregistered-tab");
    if (!sameReviewOwner(registered.owner, owner)) return refuse("owner-mismatch");
  }

  // The Project is whatever Git says this Worktree belongs to. A directory
  // outside a repository resolves to itself, so a Project with no repository
  // still authorizes and the route goes on to explain the missing repository
  // rather than refusing the human for naming it.
  const project = await resolveProject(owner.worktreePath);
  if (canonicalReviewCwd(project.projectRoot) !== canonicalReviewCwd(owner.projectRoot)) return refuse("project-mismatch");

  if (owner.sessionId) {
    const sessions = await listAllSessions();
    const session = sessions.find((candidate) => candidate.id === owner.sessionId);
    /*
     * A Session the browser can name and OMP cannot list is not the same
     * failure as a Session working somewhere else. It happens to a chat that
     * has not been written to disk yet, and to one whose file has since gone.
     * Saying "access denied" for it would blame the human for a Tab that can
     * still be opened against the Project, so it gets its own answer and the
     * caller decides what to do with it.
     */
    if (!session) return refuse("session-unknown");
    if (canonicalReviewCwd(session.cwd) !== canonicalReviewCwd(owner.worktreePath)) return refuse("session-mismatch");
    if (canonicalReviewCwd(session.projectRoot ?? session.cwd) !== canonicalReviewCwd(owner.projectRoot)) {
      return refuse("session-mismatch");
    }
  }

  return { status: "authorized", tabId, owner };
}

/**
 * The owner a Worktree and a Session add up to, resolved here rather than
 * taken from the browser.
 *
 * Opening a Review Tab sends only where it is and which Session it is beside.
 * The Project comes from Git and the Tab's id is derived from the result, so a
 * caller cannot register a binding it has described incorrectly, by accident
 * or otherwise. The tuple then goes back through the same authorization every
 * later request does.
 */
export async function registerReviewOwner(cwd: unknown, sessionId: unknown, agentDir?: string): Promise<ReviewOwnerAuthorization> {
  if (typeof cwd !== "string" || !cwd.trim()) return refuse("malformed");
  if (sessionId !== undefined && sessionId !== null && typeof sessionId !== "string") return refuse("malformed");
  const worktreePath = cwd.trim();
  const project = await resolveProject(worktreePath).catch(() => null);
  if (!project) return refuse("project-mismatch");
  const owner = {
    projectRoot: project.projectRoot,
    worktreePath,
    sessionId: typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null,
  };
  return authorizeReviewOwner({ ...reviewOwnerFields({ tabId: reviewTabIdFor(owner), owner }) }, { registering: true, agentDir });
}

/**
 * The stored binding a request matches, checked against the registry alone.
 *
 * Forgetting a Tab has to work after its Worktree has been deleted or its
 * Session has gone, which is exactly when live resolution cannot succeed;
 * otherwise a restored Tab that can never load is also a Tab that can never be
 * closed. The request must still present the binding it is forgetting, so one
 * owner cannot remove another's.
 */
export function matchRegisteredReviewTab(
  source: URLSearchParams | Record<string, unknown> | null | undefined,
  agentDir?: string,
): ReviewOwnerAuthorization {
  const context = parseReviewRequestContext(source);
  if (!context) return refuse("malformed");
  const registered = registeredTab(context.tabId, agentDir);
  if (registered && "status" in registered) return registered;
  if (!registered) return refuse("unregistered-tab");
  if (!sameReviewOwner(registered.owner, context.owner)) return refuse("owner-mismatch");
  return { status: "authorized", tabId: context.tabId, owner: registered.owner };
}
