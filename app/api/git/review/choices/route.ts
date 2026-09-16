import { NextRequest, NextResponse } from "next/server";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { defaultReviewBase, readReviewBranches, readReviewCommits, reviewUnavailableResponse } from "@/lib/review-git";
import { readIndexDigest, readIndexPaths, readRemotes, repositoryRoot } from "@/lib/review-commit-git";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind");
  const base = params.get("base")?.trim() || undefined;
  if (kind !== "branch" && kind !== "commit" && kind !== "metadata") {
    return NextResponse.json({ error: "Select a Project and a valid review source." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner(params);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  try {
    if (kind === "metadata") {
      const root = await repositoryRoot(cwd).catch(() => null);
      const [defaultBranch, branches, remotes, indexDigest, indexPaths] = await Promise.all([
        defaultReviewBase(cwd),
        readReviewBranches(cwd),
        // Where a commit could be pushed, so the form offers only real remotes.
        root ? readRemotes(root).catch(() => [] as string[]) : [],
        // The staged tree as it stands, so a commit can refuse when it moves.
        root ? readIndexDigest(root).catch(() => null) : null,
        // What is staged, so the form can name what it would have to stage.
        root ? readIndexPaths(root).catch(() => [] as string[]) : [],
      ]);
      return NextResponse.json({
        defaultBranch,
        currentBranch: branches.find((branch) => branch.current)?.name ?? null,
        localBranches: branches.filter((branch) => branch.ref.startsWith("refs/heads/")).map((branch) => branch.name),
        remotes,
        indexDigest,
        indexPaths,
      });
    }
    return NextResponse.json(kind === "branch"
      ? { branches: await readReviewBranches(cwd) }
      : await readReviewCommits(cwd, base));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    return NextResponse.json({ error: "Review choices could not be loaded." }, { status: 500 });
  }
}
