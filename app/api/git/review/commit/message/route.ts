import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { generateReviewCommitMessage } from "@/lib/review-commit-message";
import { repositoryRoot } from "@/lib/review-commit-git";

/** A suggested message. Reads the staged tree; never stages, never commits. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    const roots = await getAllowedFileRoots();
    const root = await repositoryRoot(cwd);
    if (!isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(await generateReviewCommitMessage(cwd));
  } catch {
    return NextResponse.json({ error: "A message could not be written." }, { status: 500 });
  }
}
