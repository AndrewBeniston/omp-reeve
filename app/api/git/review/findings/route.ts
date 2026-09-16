import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { readReviewFindings } from "@/lib/review-findings-read";

/**
 * The findings the owning Session's latest review left on this diff.
 *
 * Owner-checked like every Review endpoint, and bound to the Session the Tab
 * belongs to. A Tab with no Session of its own reads nothing: a review answers
 * in a conversation, and substituting whichever Session is selected would draw
 * one Project's review on another's diff.
 */
export async function GET(request: NextRequest) {
  const authorization = await authorizeReviewOwner(request.nextUrl.searchParams);
  if (authorization.status === "refused") return authorization.response;
  const { owner } = authorization;
  if (!owner.sessionId) return NextResponse.json({ kind: "none" });
  try {
    return NextResponse.json(await readReviewFindings({ cwd: owner.worktreePath, sessionId: owner.sessionId }));
  } catch {
    return NextResponse.json({ error: "These findings could not be read." }, { status: 500 });
  }
}
