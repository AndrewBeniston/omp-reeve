import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { isRevision, publishReview, resolveRemote, resolveRepositoryRoot, type ReviewPublication } from "@/lib/review-github";

const ACTIONS = new Set([
  "submitReview", "replyToThread", "editComment", "deleteComment", "resolveThread", "unresolveThread",
]);
const EVENTS = new Set(["COMMENT", "APPROVE", "REQUEST_CHANGES"]);
const SIDES = new Set(["LEFT", "RIGHT"]);

function text(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Whether a publication is the shape it claims to be.
 *
 * The type it is declared as says nothing at runtime: this arrives as JSON
 * from a browser, so every field a command will be built from is examined
 * here rather than trusted.
 */
function isPublication(value: unknown): value is ReviewPublication {
  if (!value || typeof value !== "object") return false;
  const publication = value as Record<string, unknown>;
  if (!text(publication.action) || !ACTIONS.has(publication.action)) return false;
  switch (publication.action) {
    case "submitReview": {
      if (!text(publication.event) || !EVENTS.has(publication.event)) return false;
      if (!text(publication.body)) return false;
      if (!Array.isArray(publication.comments)) return false;
      return publication.comments.every((entry) => {
        const comment = entry as Record<string, unknown>;
        if (!text(comment.path) || !text(comment.body)) return false;
        if (!Number.isInteger(comment.line)) return false;
        if (!text(comment.side) || !SIDES.has(comment.side)) return false;
        if (comment.startLine !== undefined && !Number.isInteger(comment.startLine)) return false;
        if (comment.startSide !== undefined && (!text(comment.startSide) || !SIDES.has(comment.startSide))) return false;
        return true;
      });
    }
    case "replyToThread":
      return text(publication.threadId) && text(publication.body);
    case "editComment":
      return text(publication.commentId) && text(publication.body);
    case "deleteComment":
      return text(publication.commentId);
    default:
      return text(publication.threadId);
  }
}

/**
 * Publishing to GitHub, which happens only because a human asked for it.
 *
 * Nothing reaches this except an explicit request naming the revision the
 * human was reading. What may be published is decided against the pull request
 * itself rather than against what the request claims, and a write whose answer
 * never arrived is reported as unknown rather than sent again.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Unreadable request." }, { status: 400 });
  }

  const authorization = await authorizeReviewOwner(body);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  if (!Number.isInteger(body.number) || (body.number as number) < 1) {
    return NextResponse.json({ error: "Select a pull request." }, { status: 400 });
  }
  // A revision reaches a command only in the form the host writes one.
  if (!isRevision(body.expectedHeadSha)) {
    return NextResponse.json({ error: "The revision being reviewed is missing." }, { status: 400 });
  }
  // Optional, and checked the same way where it is sent: a publication that
  // names a base is judged against it, and one that names none is not.
  if (body.expectedBaseSha !== undefined && !isRevision(body.expectedBaseSha)) {
    return NextResponse.json({ error: "The revision being reviewed is missing." }, { status: 400 });
  }
  if (!isPublication(body.publication)) {
    return NextResponse.json({ error: "Unknown publication." }, { status: 400 });
  }

  try {
    const roots = await getAllowedFileRoots();
    // The repository Git resolves from this directory is guarded as well: it
    // is found by walking upwards and can sit outside what was allowed.
    const root = await resolveRepositoryRoot(cwd);
    if (!root || !isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const remote = await resolveRemote(cwd, text(body.remoteId) ? body.remoteId.trim() : "");
    if (!remote) return NextResponse.json({ error: "Select a repository." }, { status: 400 });

    const outcome = await publishReview(
      remote,
      body.number as number,
      {
        headSha: body.expectedHeadSha,
        ...(body.expectedBaseSha === undefined ? {} : { baseSha: body.expectedBaseSha as string }),
      },
      body.publication,
    );
    // A refusal and an outage are answers rather than faults: the browser keeps
    // what the human wrote and says why it stayed here.
    const status = outcome.status === "published" ? 200
      : outcome.status === "refused" ? 409
      : outcome.status === "unavailable" ? 409
      : 202;
    return NextResponse.json(outcome, { status });
  } catch {
    return NextResponse.json({ error: "The comment could not be published." }, { status: 500 });
  }
}
