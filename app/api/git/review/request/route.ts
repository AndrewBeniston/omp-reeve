import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { runGit } from "@/lib/review-commit-git";
import { composeReviewRequest, REVIEW_REQUEST_REFUSALS, type ReviewRequestMode } from "@/lib/review-model-request";
import { readReviewDiff, type ReviewScope } from "@/lib/review-git";
import { recordReviewRequestSnapshot, reviewedFilesFromDiff } from "@/lib/review-request-snapshot";
import { reviewSettings } from "@/lib/review-settings";
import { describeGitUnusable } from "@/lib/review-slash-entries";

/**
 * Compose the turn a requested review would start: resolve the merge base,
 * return the prompt and the scope. Starting the turn stays with the agent
 * command route the composer already uses.
 */

/** No option, no NUL, not empty. */
function isNameableRevision(value: string): boolean {
  return Boolean(value) && !value.startsWith("-") && !value.includes("\0");
}

/**
 * Record what this request is asking the model to read.
 *
 * A finding names a line, and a line only means something against a revision.
 * The model reads the Worktree itself, so this is Reeve's own account of what
 * was there when it asked, taken here because here is the moment it can vouch
 * for. Without it a finding cannot be drawn on a line, and it says so instead.
 *
 * Nothing here may stop a review: every failure leaves the request untouched.
 */
async function recordReviewedRevisions(sessionId: string, cwd: string, mode: ReviewRequestMode, prompt: string): Promise<string | null> {
  const scope: ReviewScope = mode.kind === "branch" ? { kind: "branch", base: mode.mergeBase } : { kind: "uncommitted" };
  try {
    const diff = await readReviewDiff(cwd, scope);
    const snapshot = await recordReviewRequestSnapshot({ sessionId, cwd, prompt, files: reviewedFilesFromDiff(diff) });
    return snapshot?.requestId ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  }

  const authorization = await authorizeReviewOwner(body);
  if (authorization.status === "refused") return authorization.response;
  const { owner } = authorization;

  /*
   * A review answers in a conversation. A Tab with no Session of its own has
   * none to answer in, and substituting whichever Session is selected would
   * put one Project's review in another's chat.
   */
  if (!owner.sessionId) {
    return NextResponse.json({ error: REVIEW_REQUEST_REFUSALS["no-session"], reason: "no-session" }, { status: 409 });
  }

  const cwd = owner.worktreePath;
  const kind = body.mode === "branch" ? "branch" : "uncommitted";
  const message = typeof body.message === "string" ? body.message : "";
  const security = body.security === true;
  const origin = body.origin === "automatic" ? "automatic" as const : "requested" as const;
  const settings = reviewSettings(body.settings as Record<string, unknown> | undefined);

  let mode: ReviewRequestMode = { kind: "uncommitted" };
  if (kind === "branch") {
    const base = typeof body.base === "string" ? body.base.trim() : "";
    if (!isNameableRevision(base)) {
      return NextResponse.json({ error: "Choose a base branch to review against." }, { status: 400 });
    }
    const resolved = await runGit(cwd, ["rev-parse", "--verify", "--end-of-options", `${base}^{commit}`]);
    if (resolved.code !== 0) {
      return NextResponse.json({ error: describeGitUnusable(resolved.stderr), reason: "git-unusable" }, { status: 409 });
    }
    const head = await runGit(cwd, ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"]);
    if (head.code !== 0) {
      return NextResponse.json({ error: describeGitUnusable(head.stderr), reason: "git-unusable" }, { status: 409 });
    }
    /*
     * No merge base is a refusal, not a fallback. Reviewing two unrelated
     * histories against each other would report every file in the repository
     * as the human's change.
     */
    const mergeBase = await runGit(cwd, ["merge-base", resolved.stdout.trim(), head.stdout.trim()]);
    if (mergeBase.code !== 0 || !mergeBase.stdout.trim()) {
      return NextResponse.json({ error: REVIEW_REQUEST_REFUSALS["no-merge-base"], reason: "no-merge-base" }, { status: 409 });
    }
    mode = { kind: "branch", base, mergeBase: mergeBase.stdout.trim() };
  }

  const composed = composeReviewRequest({ mode, message, origin, security, settings });
  const requestId = await recordReviewedRevisions(owner.sessionId, cwd, mode, composed.prompt);
  return NextResponse.json({ ...composed, sessionId: owner.sessionId, requestId });
}
