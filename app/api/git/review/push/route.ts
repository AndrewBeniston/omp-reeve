import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { pushReviewBranch, readPushState } from "@/lib/review-push";
import { repositoryRoot } from "@/lib/review-commit-git";

/**
 * The repository this Worktree belongs to has to be allowed as well. The owner
 * check has already cleared the Worktree and its Project; this covers the root
 * Git itself walks up to, which can sit outside either.
 */
async function repositoryDenied(cwd: string): Promise<boolean> {
  const roots = await getAllowedFileRoots();
  const root = await repositoryRoot(cwd).catch(() => null);
  return root === null || !isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots);
}

/** What pushing would do from here: the branch, its upstream, and how far ahead. */
export async function GET(request: NextRequest) {
  const authorization = await authorizeReviewOwner(request.nextUrl.searchParams);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await repositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json(await readPushState(cwd));
  } catch {
    return NextResponse.json({ error: "This branch could not be read." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose where to push." }, { status: 400 });
  }
  const { remote } = (body ?? {}) as Record<string, unknown>;
  if (typeof remote !== "string" || !remote.trim()) {
    return NextResponse.json({ error: "Choose where to push." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await repositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    // The remote is checked against this repository's own list inside.
    return NextResponse.json(await pushReviewBranch(cwd, remote.trim()));
  } catch {
    return NextResponse.json({ error: "This branch could not be pushed." }, { status: 500 });
  }
}
