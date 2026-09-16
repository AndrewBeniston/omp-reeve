import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { isNameableRevision } from "@/lib/review-commit-git";
import { generateReviewPublishMessage } from "@/lib/review-publish-message";
import { readPublishState } from "@/lib/review-publish";
import { reviewRepositoryDenied } from "@/lib/review-git-guard";

/** A written title and description. Reads the branch; writes nothing. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  }
  const { base } = (body ?? {}) as Record<string, unknown>;
  if (base !== undefined && typeof base !== "string") {
    return NextResponse.json({ error: "Choose a base branch." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await reviewRepositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    // A base the browser did not name is this repository's own, read here
    // rather than guessed at, so the range described is the real one.
    const target = base?.trim() || (await readPublishState(cwd)).base;
    if (!target) return NextResponse.json({ ok: false, failure: "no-commits" });
    // A base that is not a revision is refused here by name, so the human
    // reads why rather than a description that could not be written.
    if (!isNameableRevision(target)) return NextResponse.json({ error: "Choose a base branch." }, { status: 400 });
    return NextResponse.json(await generateReviewPublishMessage(cwd, target));
  } catch {
    return NextResponse.json({ error: "A description could not be written." }, { status: 500 });
  }
}
