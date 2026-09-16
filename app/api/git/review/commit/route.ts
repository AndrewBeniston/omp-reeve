import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { readReviewDiff, reviewUnavailableResponse } from "@/lib/review-git";
import { reviewFilesFromPatch } from "@/lib/review-files";
import { scopeCanCommit, staleReviewedFiles } from "@/lib/review-commit";
import { commitReview, readIndexPaths, readRemotes, repositoryRoot } from "@/lib/review-commit-git";

/** One click cannot name more paths than a review can hold. */
const MAX_PATHS = 1000;

function stringList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PATHS) return null;
  const paths: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry || entry.includes("\0")) return null;
    paths.push(entry);
  }
  return paths;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a commit." }, { status: 400 });
  }
  const { scope, message, reviewedPaths, stagePaths, acknowledgedHiddenPaths, expectedIndexDigest, createBranch, push } =
    (body ?? {}) as Record<string, unknown>;
  const expectedFileRevisions = (body as Record<string, unknown> | null)?.expectedFileRevisions;

  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  const kind = (scope as { kind?: unknown } | null)?.kind;
  if (typeof kind !== "string" || !scopeCanCommit(kind)) {
    return NextResponse.json({ error: "That review scope cannot be committed." }, { status: 400 });
  }
  if (typeof message !== "string") {
    return NextResponse.json({ error: "Write a commit message." }, { status: 400 });
  }
  const reviewed = stringList(reviewedPaths);
  const staging = stringList(stagePaths);
  const acknowledged = stringList(acknowledgedHiddenPaths);
  if (!reviewed || !staging || !acknowledged) {
    return NextResponse.json({ error: "Select the changes to commit." }, { status: 400 });
  }
  if (expectedIndexDigest !== undefined && typeof expectedIndexDigest !== "string") {
    return NextResponse.json({ error: "Select the changes to commit." }, { status: 400 });
  }
  if (expectedFileRevisions !== undefined && (typeof expectedFileRevisions !== "object" || expectedFileRevisions === null || Array.isArray(expectedFileRevisions))) {
    return NextResponse.json({ error: "Select the changes to commit." }, { status: 400 });
  }
  if (createBranch !== undefined && createBranch !== null && typeof createBranch !== "string") {
    return NextResponse.json({ error: "Name the branch to create." }, { status: 400 });
  }
  const pushRequest = push as { remote?: unknown; setUpstream?: unknown } | undefined | null;
  if (pushRequest != null && typeof pushRequest.remote !== "string") {
    return NextResponse.json({ error: "Choose where to push." }, { status: 400 });
  }

  try {
    const roots = await getAllowedFileRoots();

    /*
     * Nothing the browser names is taken on trust. The paths it may stage or
     * acknowledge are read here, from this Project and this scope, and a name
     * outside that reading is refused rather than handed to Git.
     */
    const diff = await readReviewDiff(cwd, { kind });
    const reviewable = new Set(reviewFilesFromPatch(diff.patch, diff.conflictedFiles).map((file) => file.path));
    if ([...reviewed, ...staging].some((path) => !reviewable.has(path))) {
      return NextResponse.json({ error: "Those changes are no longer in this review." }, { status: 400 });
    }

    /*
     * The digests the form was displaying, against this reading, before
     * anything is staged. A file edited since the human looked at it is not
     * the change they chose to commit.
     */
    if (expectedFileRevisions) {
      const displayed = expectedFileRevisions as Record<string, string>;
      const invalid = Object.values(displayed).some((revision) => typeof revision !== "string");
      if (invalid) return NextResponse.json({ error: "Select the changes to commit." }, { status: 400 });
      const stale = staleReviewedFiles(displayed, diff.fileRevisions);
      if (stale.length > 0) {
        return NextResponse.json({
          status: "refused",
          refusal: "stale-files",
          stalePaths: stale,
          committedPaths: [],
          hiddenPaths: [],
          stagedPaths: [],
        });
      }
    }

    const root = await repositoryRoot(cwd.trim());
    // The directory was allowed; the repository it turns out to belong to has
    // to be allowed too, or a link could carry a commit into another project.
    if (!isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const indexPaths = new Set(await readIndexPaths(root));
    if (acknowledged.some((path) => !indexPaths.has(path))) {
      return NextResponse.json({ error: "Those staged changes are no longer there." }, { status: 400 });
    }
    if (pushRequest?.remote && !(await readRemotes(root)).includes(pushRequest.remote as string)) {
      return NextResponse.json({ error: "That remote is not configured." }, { status: 400 });
    }

    return NextResponse.json(await commitReview({
      cwd: cwd.trim(),
      message,
      reviewedPaths: reviewed.length ? reviewed : undefined,
      stagePaths: staging.length ? staging : undefined,
      acknowledgedHiddenPaths: acknowledged,
      expectedIndexDigest: typeof expectedIndexDigest === "string" ? expectedIndexDigest : undefined,
      createBranch: typeof createBranch === "string" ? createBranch : null,
      push: pushRequest?.remote ? { remote: pushRequest.remote as string, setUpstream: pushRequest.setUpstream === true } : undefined,
    }));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    return NextResponse.json({ error: "These changes could not be committed." }, { status: 500 });
  }
}
