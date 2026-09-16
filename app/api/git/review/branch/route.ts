import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { applyBranchSetup, readBranchChoices } from "@/lib/review-branch-setup";
import { reviewRepositoryDenied } from "@/lib/review-git-guard";

/** Longer than any branch name a human types, and short enough to refuse abuse. */
const MAX_BRANCH_NAME = 255;

/** The branches this Worktree could work on, and which are held elsewhere. */
export async function GET(request: NextRequest) {
  const authorization = await authorizeReviewOwner(request.nextUrl.searchParams);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await reviewRepositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json(await readBranchChoices(cwd));
  } catch {
    return NextResponse.json({ error: "The branches could not be read." }, { status: 500 });
  }
}

/**
 * Work here: create a branch, or check out one that exists.
 *
 * Writes, so nothing the browser names is taken on trust: the mode is one of
 * two words, the name is bounded and checked by Git itself, and a branch
 * another Worktree holds is refused inside rather than attempted.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Name the branch." }, { status: 400 });
  }
  const { mode, name } = (body ?? {}) as Record<string, unknown>;
  if (mode !== "create" && mode !== "checkout") {
    return NextResponse.json({ error: "Choose whether to create a branch or check one out." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim() || name.length > MAX_BRANCH_NAME || name.includes("\0")) {
    return NextResponse.json({ error: "Name the branch." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await reviewRepositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json(await applyBranchSetup({ cwd, mode, name }));
  } catch {
    return NextResponse.json({ error: "The branch could not be set." }, { status: 500 });
  }
}
