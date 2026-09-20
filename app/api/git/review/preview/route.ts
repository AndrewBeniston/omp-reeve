import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { repositoryRoot } from "@/lib/review-commit-git";
import { isGitReadableScope, reviewUnavailableResponse } from "@/lib/review-git";
import { resolveRemote, resolveRepositoryRoot, type ReviewGitHubRemote } from "@/lib/review-github";
import { authorizeReviewOwner } from "@/lib/review-owner-server";
import { readPullRequestPreviewSides } from "@/lib/review-pr-preview-source";
import { readReviewPreviewSides, type ReviewPreviewResult } from "@/lib/review-preview-source";
import { reviewPreviewKind } from "@/lib/review-preview";
import { isReviewPrScope, isReviewRequestPath, parseReviewPreviewScope, parseReviewPreviewScopeParams, type ReviewPrScope } from "@/lib/review-scope-request";

/**
 * The repository a pull request preview may be read for.
 *
 * Guarded as every other pull request read is: Git finds the repository by
 * walking upwards, so it can land outside the directory this request was
 * allowed to name, and the remote is resolved against the Project as it is
 * now rather than trusted from the request.
 */
type RemoteLookup =
  | { status: "ready"; remote: ReviewGitHubRemote }
  | { status: "denied" }
  | { status: "unknown-remote" };

async function pullRequestRemote(cwd: string, scope: ReviewPrScope): Promise<RemoteLookup> {
  const roots = await getAllowedFileRoots();
  const root = await resolveRepositoryRoot(cwd);
  if (!root || !isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) return { status: "denied" };
  const remote = await resolveRemote(cwd, scope.remoteId);
  if (!remote) return { status: "unknown-remote" };
  return { status: "ready", remote };
}

function remoteRefusal(lookup: RemoteLookup): NextResponse {
  return lookup.status === "denied"
    ? NextResponse.json({ error: "Access denied" }, { status: 403 })
    : NextResponse.json({ error: "Select a repository." }, { status: 400 });
}

/**
 * The bytes behind one file's rich preview, on both sides of the diff.
 *
 * A caller either pins the revision it was shown or says plainly that it
 * wants the current one. A request with neither has not decided, and guessing
 * for it is how a stale read gets presented as a current one.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Select a file to preview." }, { status: 400 });
  }
  const { scope, path: filePath, revision, current, includeBytes } = (body ?? {}) as Record<string, unknown>;
  const authorization = await authorizeReviewOwner((body ?? {}) as Record<string, unknown>);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  const reviewScope = parseReviewPreviewScope(scope);
  const wantsCurrent = current === true;
  if (!reviewScope || !isReviewRequestPath(filePath)
    || (!wantsCurrent && (typeof revision !== "string" || !revision))) {
    return NextResponse.json({ error: "Select a file to preview." }, { status: 400 });
  }
  const sides = wantsCurrent ? { current: true as const } : { revision: revision as string };
  try {
    /*
     * A pull request is read from its host at the pair the panel is pinned
     * to. The Project holds no revision of it, so none of the Git reads
     * below can answer for it.
     */
    if (isReviewPrScope(reviewScope)) {
      const lookup = await pullRequestRemote(cwd, reviewScope);
      if (lookup.status !== "ready") return remoteRefusal(lookup);
      return NextResponse.json(await readPullRequestPreviewSides(lookup.remote, reviewScope, filePath, sides,
        { includeBytes: includeBytes !== false }));
    }
    // A recorded turn carries no file bytes, so it answers before a
    // repository is resolved, which it may not be.
    if (!isGitReadableScope(reviewScope)) return NextResponse.json({ status: "unsupported" });
    const roots = await getAllowedFileRoots();
    const root = await repositoryRoot(cwd);
    if (!isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    // A caller that will fetch the bytes from their own URL asks for the
    // shape of the sides alone, so the same file is never read twice.
    return NextResponse.json(await readReviewPreviewSides(cwd, reviewScope, filePath, sides, root, { includeBytes: includeBytes !== false }));
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    return NextResponse.json({ error: "This file could not be previewed." }, { status: 500 });
  }
}

/**
 * The one media type this route will ever put on this origin.
 *
 * Serving a document inline from Reeve's own origin is not the same act as
 * returning its bytes inside JSON, whatever the authorization around it: an
 * SVG served as `image/svg+xml` here is a same-origin document, and a
 * reviewed file could carry script into it. A PDF is drawn by the browser's
 * viewer and is the only kind that needs a frame at all, so it is the only
 * kind served. Every other preview reaches the panel as bytes in JSON and is
 * drawn in an `img`, which executes nothing.
 */
const FRAMED_MEDIA_TYPE = "application/pdf";

/**
 * One side's bytes, served from Reeve's own origin.
 *
 * A PDF is drawn by the browser in a subframe, and the desktop shell allows a
 * subframe to navigate only to a trusted application URL or `about:blank`
 * (`isNavigationAllowed` in `desktop/desktop-runtime.cjs`). A `data:` URL is
 * neither, so a PDF handed over that way is refused before it loads and
 * leaves an empty frame. Serving it from this origin satisfies that guard as
 * it stands, rather than relaxing it to admit data frames.
 *
 * Authorized exactly as the POST above: same owner check, same allowed-root
 * rules, same reader, so nothing is reachable here that is not reachable
 * there.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const authorization = await authorizeReviewOwner(params);
  if (authorization.status === "refused") return authorization.response;
  const cwd = authorization.owner.worktreePath;
  const reviewScope = parseReviewPreviewScopeParams(params);
  const filePath = params.get("path");
  const wanted = params.get("side") === "old" ? "old" : "new";
  if (!reviewScope || !isReviewRequestPath(filePath)) {
    return NextResponse.json({ error: "Select a file to preview." }, { status: 400 });
  }
  /*
   * The name is tested before anything is read, and the side's own type is
   * tested again below. A rename can carry an SVG into a path ending .pdf,
   * so neither check stands for the other.
   */
  if (reviewPreviewKind({ path: filePath, richPreview: true }) !== "pdf") {
    return NextResponse.json({ error: "Not previewable here" }, { status: 404 });
  }
  try {
    let result: ReviewPreviewResult;
    if (isReviewPrScope(reviewScope)) {
      const lookup = await pullRequestRemote(cwd, reviewScope);
      if (lookup.status !== "ready") return remoteRefusal(lookup);
      result = await readPullRequestPreviewSides(lookup.remote, reviewScope, filePath, { current: true });
    } else {
      if (!isGitReadableScope(reviewScope)) return NextResponse.json({ error: "Not previewable" }, { status: 404 });
      const roots = await getAllowedFileRoots();
      const root = await repositoryRoot(cwd);
      if (!isFilePathAllowed(root, roots) || !isExistingFilePathAllowed(root, roots)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      result = await readReviewPreviewSides(cwd, reviewScope, filePath, { current: true }, root);
    }
    if (result.status !== "ready") return NextResponse.json({ error: result.status }, { status: 404 });
    const side = result[wanted];
    if (!side?.base64) return NextResponse.json({ error: "No such side" }, { status: 404 });
    if (side.mediaType !== FRAMED_MEDIA_TYPE) {
      return NextResponse.json({ error: "Not previewable here" }, { status: 404 });
    }
    return new NextResponse(Buffer.from(side.base64, "base64"), {
      headers: {
        // Stated outright rather than echoed, so this route has no path that
        // can put another type on this origin.
        "Content-Type": FRAMED_MEDIA_TYPE,
        "Content-Length": String(side.bytes),
        // Shown in place, never offered as a download, and never sniffed into
        // a type the review did not decide it was.
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        /*
         * Deliberately no `frame-ancestors`. Chromium draws a PDF in its own
         * viewer extension, which nests the document inside an extension
         * frame, so any `frame-ancestors` here refuses that nesting: the
         * request still answers 200 and the frame stays blank, which is a
         * failure that looks like a delivery problem and is not one.
         *
         * What protects this response is the authorization above, the
         * allowed-root rules, and the fact that it serves one media type.
         * Framing a PDF gives the embedder no access to its bytes.
         */
      },
    });
  } catch (error) {
    const unavailable = reviewUnavailableResponse(error);
    if (unavailable) return NextResponse.json({ error: unavailable.error, reason: unavailable.reason }, { status: unavailable.status });
    return NextResponse.json({ error: "This file could not be previewed." }, { status: 500 });
  }
}
