import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { createReviewRepository, type ReviewRepositoryInitRefusal } from "@/lib/review-repository-init";

/** The status each refusal answers with, so a cure and an absence differ. */
const REFUSAL_STATUS: Record<ReviewRepositoryInitRefusal, number> = {
  "already-a-repository": 409,
  "git-missing": 503,
  failed: 409,
};

/**
 * Start a Git repository in the directory this Review Tab is open on.
 *
 * The empty state for a directory outside a repository offers this, and it is
 * the only thing it offers, so the route does exactly that one thing: no
 * staging, no commit, no remote. The Tab's binding is authorized as every
 * other Review route authorizes it, which is also what establishes that this
 * directory is one Reeve may write in.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  try {
    const outcome = await createReviewRepository(authorization.owner.worktreePath);
    if (outcome.status === "refused") {
      return NextResponse.json(
        { status: "refused", reason: outcome.reason, error: outcome.message },
        { status: REFUSAL_STATUS[outcome.reason] },
      );
    }
    return NextResponse.json(outcome);
  } catch {
    return NextResponse.json({ status: "refused", reason: "failed", error: "A Git repository could not be started here." }, { status: 500 });
  }
}
