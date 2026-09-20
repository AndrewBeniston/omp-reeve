import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { defaultReviewBase, readReviewBranches, reviewUnavailableResponse } from "@/lib/review-git";
import { describeGitUnusable } from "@/lib/review-slash-entries";

/**
 * Whether a directory has a Git root, and the branches a review could use as
 * a base.
 *
 * Keyed by directory rather than by a Review Tab: R18 gates the review command
 * on a Git root, and a Tab is a consequence of running a review, never a
 * precondition for offering one. Ownership is enforced where it decides what a
 * request may read — on the request route — not on whether a menu lists a
 * command.
 */
export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
  const probeOnly = request.nextUrl.searchParams.get("probe") === "1";
  if (!cwd) return NextResponse.json({ error: "Select a Project directory." }, { status: 400 });
  if (!isExistingFilePathAllowed(cwd, await getAllowedFileRoots())) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  try {
    /*
     * Read the refs to decide the gate. This is the call that distinguishes a
     * directory outside a repository from Git being missing or refusing to
     * run: it raises the classified failure, where resolving a root raises a
     * bare error and would report every one of them as "not a repository".
     */
    const branches = await readReviewBranches(cwd);
    if (probeOnly) return NextResponse.json({ gitRoot: true });
    // Resolving a default base asks the remote, so it stays off the gate.
    const defaultBranch = await defaultReviewBase(cwd).catch(() => null);
    return NextResponse.json({
      gitRoot: true,
      defaultBranch,
      currentBranch: branches.find((branch) => branch.current)?.name ?? null,
      branches: branches.map((branch) => branch.name),
    });
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ gitRoot: null, error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    /*
     * Git ran and refused. Its own words are more use than a paraphrase, and
     * an unaccepted Xcode licence is named with the command that clears it.
     */
    const failed = error as { stderr?: unknown };
    const stderr = typeof failed.stderr === "string" ? failed.stderr : "";
    return NextResponse.json({ gitRoot: null, error: describeGitUnusable(stderr), reason: "git-unusable" }, { status: 409 });
  }
}
