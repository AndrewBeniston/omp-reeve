import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { applyReviewChange, reviewUnavailableResponse, type ReviewScope } from "@/lib/review-git";
import { resolveReviewApplyRequest, type ReviewApplyTarget } from "@/lib/review-apply-request";
import { REVIEW_HUNK_TEXT_LIMIT } from "@/lib/review-hunk-binding";
import { reviewOperationsForScope, type ReviewOperation } from "@/lib/review-operations";

/** One click cannot ask for more files than a review can hold. */
const MAX_TARGETS = 1000;

/*
 * A target arrives as what Git needs plus the name the panel gave the hunk.
 * That name is resolved before the operation runs and never reaches Git.
 */
function parseTargets(value: unknown): ReviewApplyTarget[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TARGETS) return null;
  const targets: ReviewApplyTarget[] = [];
  // The same file and hunk named twice would apply once and then fail, which
  // would report a failure the human never asked for.
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const { path: filePath, revision, hunkIndex, hunkText } = entry as Record<string, unknown>;
    if (typeof filePath !== "string" || !filePath || filePath.includes("\0")) return null;
    if (typeof revision !== "string" || !revision) return null;
    if (hunkIndex !== undefined && (typeof hunkIndex !== "number" || !Number.isInteger(hunkIndex) || hunkIndex < 0)) return null;
    /*
     * A hunk names itself as well as its position. This text is compared
     * against the server's own reading and never applied, so the only things
     * asked of it here are that it look like a hunk and that it be bounded.
     */
    if (hunkIndex !== undefined && (typeof hunkText !== "string" || !hunkText.startsWith("@@ ") || hunkText.length > REVIEW_HUNK_TEXT_LIMIT)) return null;
    const key = `${filePath}\u0000${hunkIndex ?? "file"}`;
    if (seen.has(key)) return null;
    seen.add(key);
    targets.push(hunkIndex === undefined ? { path: filePath, revision } : { path: filePath, revision, hunkIndex, hunkText: hunkText as string });
  }
  return targets;
}

/**
 * A scope a working-tree operation can belong to. Branch and commit review
 * read history, so they never reach Git through this route.
 */
function parseScope(value: unknown): ReviewScope | null {
  if (typeof value !== "object" || value === null) return null;
  const kind = (value as Record<string, unknown>).kind;
  if (kind !== "staged" && kind !== "unstaged" && kind !== "uncommitted") return null;
  return { kind };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a review operation." }, { status: 400 });
  }
  const { operation, scope, targets, hideWhitespace } = (body ?? {}) as Record<string, unknown>;
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  if (operation !== "stage" && operation !== "unstage" && operation !== "revert") {
    return NextResponse.json({ error: "Unknown review operation." }, { status: 400 });
  }
  const reviewScope = parseScope(scope);
  const reviewTargets = parseTargets(targets);
  if (!reviewScope || !reviewTargets) {
    return NextResponse.json({ error: "Select the changes to act on." }, { status: 400 });
  }
  const targetKind = reviewTargets.some((target) => target.hunkIndex !== undefined) ? "hunk" : "file";
  if (!reviewOperationsForScope(reviewScope.kind, targetKind).includes(operation as ReviewOperation)) {
    return NextResponse.json({ error: "That operation does not belong to this review scope." }, { status: 400 });
  }
  try {
    /*
     * Nothing is applied until the hunk that was clicked has been found in a
     * reading taken now. The whole operation is refused rather than landing on
     * a neighbour, and the file digest `applyReviewChange` checks next is what
     * keeps that reading and its own the same bytes.
     */
    const resolution = await resolveReviewApplyRequest(cwd, reviewScope, reviewTargets, { hideWhitespace: hideWhitespace === true });
    if (resolution.stale.length) return NextResponse.json({ status: "stale", applied: [], skipped: [], failed: [], stale: resolution.stale });
    return NextResponse.json(await applyReviewChange(cwd, operation, reviewScope, resolution.targets));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    return NextResponse.json({ error: "These changes could not be applied." }, { status: 500 });
  }
}
