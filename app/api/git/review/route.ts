import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { readReviewDiff, reviewUnavailableResponse, type ReviewDiff, type ReviewScope } from "@/lib/review-git";
import { readLastTurnDiff, type LastTurnUnavailableReason } from "@/lib/review-turn-read";
import { isRevision, readPullRequestPatchAtRevision, resolveRemote, resolveRepositoryRoot, ReviewGitHubError } from "@/lib/review-github";
import { fileRevisionsForPatch } from "@/lib/review-git";

/**
 * Why a Session's last prompt cannot be shown, in words the panel can print.
 *
 * Keyed by every reason the turn layer can give. `attribution-unavailable` is
 * listed alongside them so the message exists the moment that reason does.
 */
const LAST_TURN_MESSAGES: Record<LastTurnUnavailableReason | "attribution-unavailable", string> = {
  "no-record": "No snapshot was kept for this Session's last prompt.",
  "session-mismatch": "This Session is working in another directory.",
  "in-progress": "This prompt is still running.",
  unsettled: "The prompt never reported that it had finished, so no end state was taken.",
  "budget-exceeded": "The workspace was too large to snapshot while the prompt ran.",
  "capture-failed": "The snapshot of this prompt could not be taken.",
  "store-unavailable": "The snapshot store could not be written.",
  "baseline-missing": "The snapshot this prompt recorded is no longer available.",
  "not-a-repository": "This Session is not working in a Git repository.",
  "attribution-unavailable": "There is no trusted record of what the agent changed in this prompt, so none of it is shown as its work.",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  // Who is asking, and about what, before anything is read. The Session below
  // is the one this Tab was registered with, never the one the request would
  // like to be: that is the whole difference between a Worktree check and an
  // owner check when two Sessions share a directory.
  const authorization = await authorizeReviewOwner(params);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  const kind = params.get("scope") ?? "uncommitted";
  if (kind === "lastTurn") return lastTurn(cwd, authorization.owner.sessionId ?? "");
  if (kind === "pullRequest") {
    return pullRequest(
      cwd,
      params.get("remoteId")?.trim() ?? "",
      Number(params.get("number")),
      params.get("headSha")?.trim() ?? "",
      params.get("baseSha")?.trim() ?? "",
    );
  }
  let scope: ReviewScope;
  switch (kind) {
    case "staged":
    case "unstaged":
    case "uncommitted":
      scope = { kind };
      break;
    case "branch": {
      const base = params.get("base")?.trim();
      if (!base) return NextResponse.json({ error: "Select a comparison branch." }, { status: 400 });
      scope = { kind, base };
      break;
    }
    case "commit": {
      const revision = params.get("revision")?.trim();
      if (!revision) return NextResponse.json({ error: "Select a commit." }, { status: 400 });
      scope = { kind, revision };
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown review scope." }, { status: 400 });
  }
  try {
    return NextResponse.json(await readReviewDiff(cwd, scope, { ignoreWhitespace: params.get("hideWhitespace") === "1" }));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    return NextResponse.json({ error: "Changes could not be loaded for this Project and revision." }, { status: 500 });
  }
}

/**
 * What one prompt changed, which is read from a record rather than from Git's
 * current state. The Session names itself; every object comes from the record.
 */
async function lastTurn(cwd: string, sessionId: string): Promise<NextResponse> {
  if (!sessionId) return NextResponse.json({ error: "Select a Session." }, { status: 400 });
  try {
    const result = await readLastTurnDiff({ cwd, sessionId });
    if (result.kind === "unavailable") {
      return NextResponse.json(
        { error: LAST_TURN_MESSAGES[result.reason], reason: result.reason, retryable: result.retryable },
        { status: 409 },
      );
    }
    return NextResponse.json(result.diff);
  } catch (error) {
    /*
     * A classified failure keeps its reason here as it does everywhere else.
     * The recorded turn reads through its own commands today and raises plain
     * errors, so this changes nothing yet; it means a reason the turn layer
     * starts classifying reaches the panel instead of being flattened into a
     * failure with nothing to act on.
     */
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) {
      return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    }
    return NextResponse.json({ error: "This Session's last prompt could not be read." }, { status: 500 });
  }
}

/**
 * A pull request's answer, which is every field the panel reads from any other
 * scope plus the revision these changes are the changes of.
 *
 * Declared here rather than in the Git layer because Git reads none of this:
 * the scope names a pull request on a host, and no revision of it exists in
 * the Project.
 */
interface PullRequestReviewDiff extends Omit<ReviewDiff, "scope"> {
  scope: { kind: "pullRequest"; remoteId: string; number: number; headSha: string; baseSha: string };
}

/**
 * One pull request's changes, read from its host at the revision asked for.
 *
 * The browser says which head and base pair it is showing, and that is the
 * only one this will answer with. A pair that has moved on either end is
 * refused in those words instead of being answered with changes under the
 * revisions the human was reading — a reviewer reading one comparison and
 * commenting against another is the whole reason the pair is named in the
 * request.
 *
 * The Project is guarded as everywhere else, and its working tree is left
 * alone: nothing is fetched into it and nothing is checked out.
 */
async function pullRequest(
  cwd: string,
  remoteId: string,
  number: number,
  expectedHeadSha: string,
  expectedBaseSha: string,
): Promise<NextResponse> {
  if (!Number.isInteger(number) || number < 1) {
    return NextResponse.json({ error: "Select a pull request." }, { status: 400 });
  }
  // A revision reaches a command only in the form the host writes one, and a
  // request naming half a pair cannot be pinned to a comparison.
  if (!isRevision(expectedHeadSha) || !isRevision(expectedBaseSha)) {
    return NextResponse.json({ error: "The revision being reviewed is missing." }, { status: 400 });
  }
  try {
    const roots = await getAllowedFileRoots();
    // The repository Git resolves from here is guarded too: it is found by
    // walking upwards and can sit outside the directory that was allowed.
    const root = await resolveRepositoryRoot(cwd);
    if (!root || !isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const remote = await resolveRemote(cwd, remoteId);
    if (!remote) return NextResponse.json({ error: "Select a repository." }, { status: 400 });
    const read = await readPullRequestPatchAtRevision(remote, number, { headSha: expectedHeadSha, baseSha: expectedBaseSha });
    if (read.status === "revision-moved") {
      return NextResponse.json(
        { error: "This pull request has changed since it was opened here.", reason: "revision-moved", ...read.revision },
        { status: 409 },
      );
    }
    const answer: PullRequestReviewDiff = {
      // The repository these paths are relative to, canonically. A patch from
      // the host is relative to the repository, never to the directory a
      // Session happens to be working in inside it.
      repositoryRoot: root,
      cwd,
      scope: { kind: "pullRequest", remoteId: remote.id, number, ...read.revision },
      patch: read.value,
      omittedUntrackedFiles: 0,
      untrackedFiles: [],
      fileRevisions: fileRevisionsForPatch(read.value),
      conflictedFiles: [],
    };
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof ReviewGitHubError) {
      return NextResponse.json({ error: "These changes could not be read from GitHub.", reason: error.reason }, { status: 409 });
    }
    return NextResponse.json({ error: "These changes could not be read." }, { status: 500 });
  }
}
