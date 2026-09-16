import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { commitReview } from "@/lib/review-commit-git";
import { publishReviewBranch, readLocalChanges, readPublishState } from "@/lib/review-publish";
import { commitFirstProblem } from "@/lib/review-publish-ui";
import { pushReviewBranch } from "@/lib/review-push";
import { reviewRepositoryDenied } from "@/lib/review-git-guard";

/** A title a host would refuse anyway, refused here first. */
const MAX_TITLE = 256;
const MAX_BODY = 60_000;
/** A commit message longer than this is not one a human typed in this form. */
const MAX_COMMIT_MESSAGE = 20_000;

/**
 * The commit option, read from the request and never assumed.
 *
 * Absent, null, or anything that is not the expected shape means no commit.
 * Committing is the one thing here that writes a human's work into history,
 * so it happens only when the request says so in full.
 */
function readCommitFirst(value: unknown): { ok: true; request: { message: string; snapshot: string } | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, request: null };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Write a commit message." };
  const { message, snapshot } = value as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim() || message.length > MAX_COMMIT_MESSAGE) {
    return { ok: false, error: "Write a commit message." };
  }
  if (typeof snapshot !== "string" || !snapshot) {
    return { ok: false, error: "These local changes could not be read. Refresh and try again." };
  }
  return { ok: true, request: { message, snapshot } };
}

/** What publishing from this Worktree would do, and what stops it. */
export async function GET(request: NextRequest) {
  const authorization = await authorizeReviewOwner(request.nextUrl.searchParams);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await reviewRepositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json(await readPublishState(cwd));
  } catch {
    return NextResponse.json({ error: "This branch could not be read." }, { status: 500 });
  }
}

/**
 * Open the pull request, because the human asked for it.
 *
 * The modal carries an explicit option to commit and push what is local
 * first, so that happens here in order and stops at the first thing that does
 * not work: a commit that was refused is reported as a refused commit, a push
 * that failed is reported as a failed push, and nothing is published on top of
 * either. Nothing is committed unless the request asked for it.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Write a title." }, { status: 400 });
  }
  const { title, body: description, base, draft, pushFirst, commitFirst } = (body ?? {}) as Record<string, unknown>;
  if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE) {
    return NextResponse.json({ error: "Write a title." }, { status: 400 });
  }
  if (typeof description !== "string" || description.length > MAX_BODY) {
    return NextResponse.json({ error: "That description cannot be sent." }, { status: 400 });
  }
  if (base !== undefined && typeof base !== "string") {
    return NextResponse.json({ error: "Choose a base branch." }, { status: 400 });
  }
  const commitRequest = readCommitFirst(commitFirst);
  if (!commitRequest.ok) return NextResponse.json({ error: commitRequest.error }, { status: 400 });
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (await reviewRepositoryDenied(cwd)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    let committed = false;
    if (commitRequest.request) {
      const local = await readLocalChanges(cwd);
      // An empty digest is a reading that could not cover every byte these
      // paths hold. Committing on it would carry work nobody was shown.
      if (!local.digest) {
        return NextResponse.json({
          error: "These local changes could not be read in full, so nothing was committed or published.",
        }, { status: 409 });
      }
      // The digest the form displayed, against the working tree now. A human
      // commits what they were shown, or the request stops here.
      if (local.digest !== commitRequest.request.snapshot) {
        return NextResponse.json({
          error: "The local changes moved since this form opened. Refresh and try again. Nothing was published.",
        }, { status: 409 });
      }
      if (local.paths.length === 0) {
        return NextResponse.json({ error: "There are no local changes to commit. Nothing was published." }, { status: 409 });
      }
      const result = await commitReview({
        cwd,
        message: commitRequest.request.message,
        // Everything local, which is what the form counted and offered.
        stagePaths: local.paths,
        reviewedPaths: local.paths,
      });
      if (result.status !== "committed" && result.status !== "committed-not-pushed") {
        return NextResponse.json({ error: commitFirstProblem(result) }, { status: 409 });
      }
      committed = true;
    }

    // A commit that stayed local would leave the request without it, so a
    // commit made here is always pushed.
    if (pushFirst === true || committed) {
      const state = await readPublishState(cwd);
      if (!state.remote) return NextResponse.json({ status: "blocked", blocked: "no-remote" });
      const pushed = await pushReviewBranch(cwd, state.remote);
      // Nothing to push is not a reason to stop: the branch is already there.
      if (pushed.status !== "pushed" && pushed.blocked !== "nothing-to-push") {
        return NextResponse.json({ status: "push-failed", push: pushed });
      }
    }

    return NextResponse.json(await publishReviewBranch({
      cwd,
      title,
      body: description,
      base: typeof base === "string" ? base : "",
      draft: draft === true,
    }));
  } catch {
    return NextResponse.json({ error: "The pull request could not be created." }, { status: 500 });
  }
}
