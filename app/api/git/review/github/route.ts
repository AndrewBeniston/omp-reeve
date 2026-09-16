import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import {
  isRevision,
  readGitHubRemotes,
  readRemoteAccess,
  readPullRequests,
  readReviewThreadsAtRevision,
  readRevisions,
  resolveRemote,
  resolveRepositoryRoot,
  ReviewGitHubError,
  type PullRequestFilter,
  type PullRequestState,
} from "@/lib/review-github";

/** What a browser is told when a host, a sign-in, a remote, or a revision is gone. */
const MESSAGES = {
  "gh-missing": "The GitHub command is not installed on this computer.",
  "auth-required": "Sign in to GitHub to review pull requests.",
  "remote-unavailable": "GitHub could not be reached for this repository.",
  "not-a-github-remote": "This Project has no GitHub remote.",
  "incomplete-data": "GitHub did not return everything this pull request view needs.",
  "revision-moved": "This pull request has changed since it was opened here.",
} as const;

function unavailable(error: unknown): NextResponse | null {
  if (!(error instanceof ReviewGitHubError)) return null;
  return NextResponse.json({ error: MESSAGES[error.reason], reason: error.reason }, { status: 409 });
}

/**
 * Reading a Project's pull requests.
 *
 * The directory is guarded exactly as the rest of Review guards it, and the
 * repository is never named by the request: it names a slot this server
 * issued, which is resolved again here against the remotes the Project has
 * now.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") ?? "context";
  if (kind !== "context" && kind !== "pulls" && kind !== "threads" && kind !== "revisions") {
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  }
  const authorization = await authorizeReviewOwner(params);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;

  try {
    const roots = await getAllowedFileRoots();
    // Git finds a repository by walking upwards, so the root it lands on is
    // guarded too: being allowed to name a directory inside a repository is
    // not permission to read the repository that contains it.
    const root = await resolveRepositoryRoot(cwd);
    if (!root || !isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (kind === "context") {
      const remotes = await readGitHubRemotes(cwd);
      if (remotes.length === 0) {
        return NextResponse.json({ error: MESSAGES["not-a-github-remote"], reason: "not-a-github-remote" }, { status: 409 });
      }
      // The identity belongs to a host, so it is read for the remote asked
      // about, or the first one when the browser has not chosen yet.
      const selected = (params.get("remoteId") && remotes.find((remote) => remote.id === params.get("remoteId"))) || remotes[0];
      // Why an account could not be read is part of the answer. Returning the
      // remotes alone would leave a browser to show an empty pull-request list
      // for a missing sign-in, which is the one thing this must never do.
      const access = await readRemoteAccess(selected);
      return NextResponse.json({
        remotes,
        selected,
        access: access.status === "ready"
          ? access
          : { status: "unavailable", reason: access.reason, message: MESSAGES[access.reason] },
      });
    }

    const remote = await resolveRemote(cwd, params.get("remoteId")?.trim() ?? "");
    if (!remote) return NextResponse.json({ error: "Select a repository." }, { status: 400 });

    if (kind === "pulls") {
      const filter = (params.get("filter") ?? "all") as PullRequestFilter;
      const state = (params.get("state") ?? "open") as PullRequestState;
      const limit = Number(params.get("limit") ?? "30");
      return NextResponse.json(await readPullRequests(remote, {
        filter,
        state,
        ...(params.get("query") ? { query: params.get("query") as string } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      }));
    }

    const number = Number(params.get("number"));
    if (!Number.isInteger(number) || number < 1) {
      return NextResponse.json({ error: "Select a pull request." }, { status: 400 });
    }
    // Where the pull request stands now, asked as its own question.
    // Submitting a review is the point at which a stale revision stops being
    // a display problem and becomes a comment published against code nobody
    // read, so it is checked before the confirmation rather than discovered
    // by a refusal afterwards.
    if (kind === "revisions") {
      return NextResponse.json(await readRevisions(remote, number));
    }
    // Threads are answers about one revision: a thread's line is where the
    // host places it in that revision and nowhere else. So they are read under
    // the same guard the changes are, against the same head and base pair, and
    // a pull request that has moved is said so rather than answered with
    // positions into code nobody is looking at.
    const expectedHeadSha = params.get("headSha")?.trim() ?? "";
    const expectedBaseSha = params.get("baseSha")?.trim() ?? "";
    if (!isRevision(expectedHeadSha) || !isRevision(expectedBaseSha)) {
      return NextResponse.json({ error: "The revision being reviewed is missing." }, { status: 400 });
    }
    const threads = await readReviewThreadsAtRevision(remote, number, { headSha: expectedHeadSha, baseSha: expectedBaseSha });
    if (threads.status === "revision-moved") {
      return NextResponse.json(
        { error: MESSAGES["revision-moved"], reason: "revision-moved", ...threads.revision },
        { status: 409 },
      );
    }
    return NextResponse.json(threads.value);
  } catch (error) {
    return unavailable(error) ?? NextResponse.json({ error: "Pull requests could not be read." }, { status: 500 });
  }
}
