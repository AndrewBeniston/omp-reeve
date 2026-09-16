import { reviewFilesFromPatch } from "./review-files";
import { fileRevisionsForPatch } from "./review-git";
import {
  readPinnedToRevision,
  readPullRequestPatch,
  ReviewGitHubError,
  runGh,
  type GhRunner,
  type PullRequestRevisions,
  type ReviewGitHubRemote,
} from "./review-github";
import { REVIEW_OBJECT_READ_CAP } from "./review-limits";
import { reviewPreviewMediaType } from "./review-preview";
import type { ReviewPreviewResult, ReviewPreviewSide } from "./review-preview-source";
import type { ReviewPrScope } from "./review-scope-request";

/*
 * The bytes behind a rich preview when the review is a pull request.
 *
 * This sits beside review-preview-source, which reads the same two sides from
 * the Project. Nothing here reads the Project: a pull request is on a host,
 * its objects are not in this computer, and fetching them into the working
 * tree to draw an image is not a thing a read should do. Every byte is asked
 * for by revision, and the revision is the pair the panel is already pinned
 * to.
 */

class PreviewTooLarge extends Error {
  constructor(readonly bytes: number) { super("Preview exceeds the size limit"); }
}

/** A revision as a host writes one, which is the only form that reaches a route here. */
const HOST_REVISION = /^[0-9a-f]{40}$/i;

type HostAnswer = { status: "read"; value: unknown } | { status: "absent" };

/**
 * One read from the host, with a missing object told apart from a refusal.
 *
 * A side that is absent is an ordinary answer: an added file has no old side
 * and a deleted one has no new side. Anything else is a failure, and the
 * command output never leaves this module.
 */
async function hostRead(remote: ReviewGitHubRemote, route: string, gh: GhRunner): Promise<HostAnswer> {
  const run = await gh(["api", "--hostname", remote.host, route]);
  if (run.code === 0) {
    try {
      return { status: "read", value: JSON.parse(run.stdout || "null") };
    } catch {
      throw new ReviewGitHubError("incomplete-data");
    }
  }
  const reported = `${run.stderr} ${run.stdout}`.toLowerCase();
  if (reported.includes("404") || reported.includes("not found")) return { status: "absent" };
  if (reported.includes("gh auth login") || reported.includes("authentication") || reported.includes("not logged")) {
    throw new ReviewGitHubError("auth-required");
  }
  throw new ReviewGitHubError("remote-unavailable");
}

function repositoryRoute(remote: ReviewGitHubRemote): string {
  return `repos/${encodeURIComponent(remote.owner)}/${encodeURIComponent(remote.name)}`;
}

/** One path at one revision. Each segment is encoded, so a space or a hash cannot become syntax. */
function contentsRoute(remote: ReviewGitHubRemote, filePath: string, revision: string): string {
  const encoded = filePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${repositoryRoute(remote)}/contents/${encoded}?ref=${encodeURIComponent(revision)}`;
}

/**
 * The revision the pull request diverged from, which is what its patch is a
 * patch against.
 *
 * The base branch tip is not that revision. It moves while a pull request is
 * open, and reading the before side at the tip would draw a version the diff
 * never described. The host states the merge base for the pinned pair, so
 * that is what is asked for.
 */
async function mergeBaseRevision(remote: ReviewGitHubRemote, scope: ReviewPrScope, gh: GhRunner): Promise<string> {
  const route = `${repositoryRoute(remote)}/compare/${scope.baseSha}...${scope.headSha}?per_page=1`;
  const answer = await hostRead(remote, route, gh);
  if (answer.status === "absent") throw new ReviewGitHubError("remote-unavailable");
  const sha = (answer.value as { merge_base_commit?: { sha?: unknown } } | null)?.merge_base_commit?.sha;
  if (typeof sha !== "string" || !HOST_REVISION.test(sha)) throw new ReviewGitHubError("incomplete-data");
  return sha.toLowerCase();
}

/** Base64 the host wrote, as the bytes it stands for. Its line breaks are its own formatting. */
function decodeHostContent(content: unknown): Buffer | null {
  if (typeof content !== "string" || !content) return null;
  return Buffer.from(content.replace(/\s+/g, ""), "base64");
}

/**
 * One side of the preview, read at the revision it belongs to.
 *
 * The contents endpoint answers with the bytes for an ordinary file and
 * declines to inline a large one, so the blob it names is read instead. Size
 * is checked before anything is carried, against the same cap the Project
 * reader uses.
 */
async function readSide(
  remote: ReviewGitHubRemote,
  filePath: string,
  revision: string,
  mediaType: string,
  includeBytes: boolean,
  gh: GhRunner,
): Promise<ReviewPreviewSide | null> {
  const answer = await hostRead(remote, contentsRoute(remote, filePath, revision), gh);
  if (answer.status === "absent") return null;
  // A directory answers as a list. It is not the file this preview names.
  if (Array.isArray(answer.value) || typeof answer.value !== "object" || answer.value === null) return null;
  const file = answer.value as { type?: unknown; size?: unknown; content?: unknown; encoding?: unknown; sha?: unknown };
  if (file.type !== "file") return null;
  const bytes = typeof file.size === "number" ? file.size : Number(file.size);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new ReviewGitHubError("incomplete-data");
  if (bytes > REVIEW_OBJECT_READ_CAP) throw new PreviewTooLarge(bytes);
  if (!includeBytes) return { mediaType, base64: null, bytes };
  let contents = file.encoding === "base64" ? decodeHostContent(file.content) : null;
  if (!contents || contents.length !== bytes) {
    if (typeof file.sha !== "string" || !/^[0-9a-f]{7,64}$/i.test(file.sha)) throw new ReviewGitHubError("incomplete-data");
    const blob = await hostRead(remote, `${repositoryRoute(remote)}/git/blobs/${file.sha}`, gh);
    if (blob.status === "absent") return null;
    contents = decodeHostContent((blob.value as { content?: unknown } | null)?.content);
  }
  // The host stated the size before the bytes were asked for. A different
  // number of them is not this file, and drawing it would say it was.
  if (!contents || contents.length !== bytes) throw new ReviewGitHubError("incomplete-data");
  return { mediaType, base64: contents.toString("base64"), bytes: contents.length };
}

/**
 * Both sides of one previewable file in a pull request.
 *
 * The patch is read first and decides everything the Project reader decides
 * from its own diff: whether the file is in this review at all, what it is
 * called on each side of a rename, and whether it is a file rather than a
 * link or a submodule. The digest is the same digest the panel is showing,
 * because it is taken from the same patch by the same function.
 */
async function readSides(
  remote: ReviewGitHubRemote,
  scope: ReviewPrScope,
  filePath: string,
  request: { revision: string } | { current: true },
  includeBytes: boolean,
  gh: GhRunner,
): Promise<ReviewPreviewResult> {
  const patch = await readPullRequestPatch(remote, scope.number, gh);
  const entries = reviewFilesFromPatch(patch).filter((entry) => entry.path === filePath);
  const file = entries[0];
  if (!file) return { status: "not-in-review" };
  if (entries.length > 1) return { status: "unsupported" };
  const revision = fileRevisionsForPatch(patch)[filePath];
  if ("revision" in request && revision !== request.revision) return { status: "stale", revision: revision ?? null };
  // A symlink holds a path and a submodule holds a commit id. Neither is the
  // image or the document its name suggests.
  if (/(?:^|\n)(?:old mode|new mode|new file mode|deleted file mode) (?:120000|160000)/.test(file.patch)) {
    return { status: "unsupported" };
  }
  const mediaType = reviewPreviewMediaType(file.path);
  if (!mediaType) return { status: "unsupported" };
  // A rename can change the suffix, so the older side is served as what it was.
  const oldMediaType = reviewPreviewMediaType(file.oldPath) ?? mediaType;
  const added = /^new file mode /m.test(file.patch);
  const deleted = /^deleted file mode /m.test(file.patch);
  const newSide = deleted ? null : await readSide(remote, file.path, scope.headSha, mediaType, includeBytes, gh);
  const oldSide = added ? null
    : await readSide(remote, file.oldPath || file.path, await mergeBaseRevision(remote, scope, gh), oldMediaType, includeBytes, gh);
  return { status: "ready", revision, old: oldSide, new: newSide };
}

/**
 * One pull request file, previewed at the revision pair the human is reading.
 *
 * The pair is checked before and after everything this reads, exactly as the
 * patch itself is. A pull request that moved during the read is refused in
 * those words rather than answered with bytes from the new revision.
 *
 * Reading only. No revision is fetched into the Project and nothing is
 * checked out.
 */
export async function readPullRequestPreviewSides(
  remote: ReviewGitHubRemote,
  scope: ReviewPrScope,
  filePath: string,
  request: { revision: string } | { current: true },
  { includeBytes = true }: { includeBytes?: boolean } = {},
  gh: GhRunner = runGh,
): Promise<ReviewPreviewResult> {
  const expected: PullRequestRevisions = { headSha: scope.headSha, baseSha: scope.baseSha };
  try {
    const pinned = await readPinnedToRevision(
      remote,
      scope.number,
      expected,
      () => readSides(remote, scope, filePath, request, includeBytes, gh),
      gh,
    );
    if (pinned.status === "revision-moved") return { status: "revision-moved" };
    return pinned.value;
  } catch (error) {
    if (error instanceof PreviewTooLarge) return { status: "too-large", bytes: error.bytes };
    return { status: "unavailable" };
  }
}
