import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { readReviewFileSides, type ReviewFileSidesRequest } from "@/lib/review-file-contents";
import { repositoryRoot } from "@/lib/review-commit-git";
import { isGitReadableScope, reviewUnavailableResponse, type ReviewScope } from "@/lib/review-git";

/** The scope decides which two versions a file is being compared across. */
function parseScope(value: unknown): ReviewScope | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, base, revision, sessionId } = value as Record<string, unknown>;
  if (kind === "staged" || kind === "unstaged" || kind === "uncommitted") return { kind };
  if (kind === "branch" && typeof base === "string" && base.trim()) return { kind, base: base.trim() };
  if (kind === "commit" && typeof revision === "string" && revision.trim()) return { kind, revision: revision.trim() };
  // Accepted so the answer is "this scope has no file text yet" rather than a
  // rejection that reads like a broken request.
  if (kind === "lastTurn" && typeof sessionId === "string" && sessionId.trim()) return { kind, sessionId: sessionId.trim() };
  return null;
}

/**
 * Full text for one reviewed file, so the diff can show more of it.
 *
 * Read-only in every sense: it resolves nothing the browser names beyond a
 * path the server finds in its own reading of this review, and it returns
 * nothing at all when the file has moved on since that reading.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Select a file to expand." }, { status: 400 });
  }
  const { scope, path: filePath, revision, current } = (body ?? {}) as Record<string, unknown>;
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  const reviewScope = parseScope(scope);
  /*
   * A caller either pins the revision it was shown, or says plainly that it
   * wants the current one. There is no third case: a request with neither is a
   * caller that has not decided, and guessing for it is how a stale read gets
   * presented as a current one.
   */
  const wantsCurrent = current === true;
  if (!reviewScope || typeof filePath !== "string" || !filePath || filePath.includes("\0")
    || (!wantsCurrent && (typeof revision !== "string" || !revision))) {
    return NextResponse.json({ error: "Select a file to expand." }, { status: 400 });
  }
  const sides: ReviewFileSidesRequest = wantsCurrent ? { current: true } : { revision: revision as string };
  try {
    const roots = await getAllowedFileRoots();
    // A recorded turn reads nothing from the repository, so it answers before
    // the repository is resolved — which it may not be, in a directory Git
    // does not cover.
    if (!isGitReadableScope(reviewScope)) {
      return NextResponse.json(await readReviewFileSides(cwd, reviewScope, filePath, sides));
    }
    const root = await repositoryRoot(cwd);
    if (!isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(await readReviewFileSides(cwd, reviewScope, filePath, sides, root));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    return NextResponse.json({ error: "This file could not be read." }, { status: 500 });
  }
}
