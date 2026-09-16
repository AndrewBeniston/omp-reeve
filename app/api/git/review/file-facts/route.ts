import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { readableFactPaths, readReviewFileFacts } from "@/lib/review-file-facts";
import { repositoryRoot } from "@/lib/review-commit-git";
import { reviewUnavailableResponse } from "@/lib/review-git";
import { authorizeReviewOwner } from "@/lib/review-owner-server";

/**
 * What Git knows about the changed files that their patch does not carry:
 * which the repository calls generated, and which stages a conflicted path is
 * held at.
 *
 * Both are reads of one Worktree, authorized as every other review read is.
 * Neither is load-bearing: a panel that cannot reach this shows every file
 * and describes a conflict in the plainest terms, which is the same answer it
 * gives for a repository that says nothing about either.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Name the files to read." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const paths = readableFactPaths((body as Record<string, unknown>).paths);
  if (!paths.length) return NextResponse.json({ generated: [], conflicts: {} });
  try {
    const roots = await getAllowedFileRoots();
    const root = await repositoryRoot(authorization.owner.worktreePath);
    if (!isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(await readReviewFileFacts(root, paths));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    return NextResponse.json({ error: "These files could not be read." }, { status: 500 });
  }
}
