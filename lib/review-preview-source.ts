import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { reviewFilesFromPatch } from "./review-files";
import { isGitReadableScope, readReviewDiff, type ReviewScope } from "./review-git";
import { REVIEW_OBJECT_READ_CAP } from "./review-limits";
import { patchBlobIds } from "./review-patch";
import { reviewPreviewMediaType } from "./review-preview";

/*
 * The bytes behind a rich preview: one changed file, read on both sides.
 *
 * This sits beside `review-file-contents`, which reads the same two sides as
 * UTF-8 text and refuses anything binary by design. These are exactly the
 * files it refuses, so the two do not share a reader: one decodes and one
 * must not.
 */

/**
 * One side of the preview.
 *
 * `base64` is null when only the shape of the side was asked for. A PDF is
 * fetched by the viewer from its own URL rather than carried in this answer,
 * so reading its bytes twice would be the only thing that achieved.
 */
export interface ReviewPreviewSide {
  mediaType: string;
  base64: string | null;
  bytes: number;
}

export type ReviewPreviewResult =
  | { status: "ready"; revision: string; old: ReviewPreviewSide | null; new: ReviewPreviewSide | null }
  | { status: "stale"; revision: string | null }
  /**
   * The pull request moved while it was being read, so the bytes that came
   * back are not the ones the panel is showing lines from. Only a pull
   * request answers this: a Project scope has a revision of its own.
   */
  | { status: "revision-moved" }
  | { status: "not-in-review" | "unsupported" | "unavailable" }
  | { status: "too-large"; bytes: number };

class PreviewTooLarge extends Error {
  constructor(readonly bytes: number) { super("Preview exceeds the size limit"); }
}

const exec = promisify(execFile);

async function gitBytes(root: string, args: string[], limit: number): Promise<Buffer> {
  const { stdout } = await exec("git", ["--no-replace-objects", "-C", root, ...args], {
    encoding: "buffer", maxBuffer: limit, timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  return stdout;
}

/** How big a blob is, which is also what decides whether it may be read at all. */
async function blobSize(root: string, objectId: string): Promise<number> {
  if (!/^[0-9a-f]{7,64}$/.test(objectId)) throw new Error("Invalid blob");
  const size = Number((await gitBytes(root, ["cat-file", "-s", objectId], 128)).toString().trim());
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid blob size");
  if (size > REVIEW_OBJECT_READ_CAP) throw new PreviewTooLarge(size);
  return size;
}

/** A blob by the object id the patch itself names, so no path is resolved to reach it. */
async function readBlob(root: string, objectId: string): Promise<Buffer> {
  const size = await blobSize(root, objectId);
  // Raw, so a smudge filter or a textconv cannot stand in for the bytes the
  // repository holds.
  return gitBytes(root, ["cat-file", "blob", objectId], Math.max(1, size + 1));
}

/**
 * The file as it stands on disk.
 *
 * A lexical containment check answers for the name, not for what it resolves
 * to: any directory along the path can be a symlink pointing out of the
 * repository, and `O_NOFOLLOW` guards the final component alone. Requiring
 * the canonical path to equal the named one refuses a link at every step, and
 * the handle's identity is compared with the name's because the two lookups
 * are a step apart.
 */
async function workingFileStat(root: string, filePath: string) {
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Outside repository");
  if (await realpath(absolute) !== absolute) throw new Error("Symlink in path");
  const named = await lstat(absolute);
  if (named.isSymbolicLink() || !named.isFile()) throw new Error("Not a regular file");
  if (named.size > REVIEW_OBJECT_READ_CAP) throw new PreviewTooLarge(named.size);
  return { absolute, named };
}

async function readWorkingFile(root: string, filePath: string): Promise<Buffer> {
  const { absolute, named } = await workingFileStat(root, filePath);
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (opened.dev !== named.dev || opened.ino !== named.ino) throw new Error("File identity changed");
    const contents = await handle.readFile();
    if (contents.length > REVIEW_OBJECT_READ_CAP) throw new PreviewTooLarge(contents.length);
    return contents;
  } finally {
    await handle.close();
  }
}

/**
 * Both sides of one previewable file, at the revision the caller was shown.
 *
 * The revision is the digest of the read the panel is displaying. A caller
 * that pins one is refused unless the file is still at it, and the refusal
 * carries what the file is actually at, so a panel holding an old digest
 * learns to move rather than retrying against a number it can never produce.
 *
 * The diff is read a second time after the bytes are, because the index and
 * the working tree move independently of each other and of this read. A file
 * that moved between them is reported stale rather than shown as current.
 */
export async function readReviewPreviewSides(
  cwd: string,
  scope: ReviewScope,
  filePath: string,
  request: { revision: string } | { current: true },
  expectedRoot?: string,
  { includeBytes = true }: { includeBytes?: boolean } = {},
): Promise<ReviewPreviewResult> {
  if (!isGitReadableScope(scope)) return { status: "unsupported" };
  const diff = await readReviewDiff(cwd, scope, { disableFilters: true });
  if (expectedRoot && diff.repositoryRoot !== expectedRoot) return { status: "unavailable" };
  /*
   * Every section naming this path, not the first. Git writes a type change
   * as two sections for one path — a deletion and a new file at the new mode
   * — and reading the first alone would report a file that became a symlink
   * as a plain deletion.
   */
  const entries = reviewFilesFromPatch(diff.patch, diff.conflictedFiles).filter((entry) => entry.path === filePath);
  const file = entries[0];
  if (!file) return { status: "not-in-review" };
  if (entries.length > 1) return { status: "unsupported" };
  const revision = diff.fileRevisions[filePath];
  if ("revision" in request && revision !== request.revision) return { status: "stale", revision: revision ?? null };
  // A conflicted path is three versions at once, and none of them is what the
  // file on disk holds. There is no before and after to lay out.
  if (file.conflicted) return { status: "unsupported" };
  // A symlink's content is the path it points at and a submodule's is a
  // commit id. Neither is the image or document its name suggests.
  if (/(?:^|\n)(?:old mode|new mode|new file mode|deleted file mode) (?:120000|160000)/.test(file.patch)) return { status: "unsupported" };
  const mediaType = reviewPreviewMediaType(file.path);
  const oldMediaType = reviewPreviewMediaType(file.oldPath);
  if (!mediaType) return { status: "unsupported" };
  try {
    const root = diff.repositoryRoot;
    const ids = patchBlobIds(file.patch);
    const deleted = /^deleted file mode /m.test(file.patch);
    // A staged or committed review compares two recorded versions, so both
    // sides come from the object database. Any other scope is comparing
    // against the working tree, which is the file on disk.
    const historical = scope.kind === "staged" || scope.kind === "commit";
    const oldSource = ids?.old ? { blob: ids.old } : null;
    const newSource = deleted ? null
      : historical ? (ids?.new ? { blob: ids.new } : null)
      : { working: true as const };
    const measure = async (source: { blob: string } | { working: true } | null, mediaType: string): Promise<ReviewPreviewSide | null> => {
      if (!source) return null;
      if (!includeBytes) {
        const bytes = "blob" in source ? await blobSize(root, source.blob) : (await workingFileStat(root, file.path)).named.size;
        return { mediaType, base64: null, bytes };
      }
      const contents = "blob" in source ? await readBlob(root, source.blob) : await readWorkingFile(root, file.path);
      return { mediaType, base64: contents.toString("base64"), bytes: contents.length };
    };
    // A rename can change the suffix, so the side that was deleted is served
    // as what it was rather than as what it became.
    const oldSide = await measure(oldSource, oldMediaType ?? mediaType);
    const newSide = await measure(newSource, mediaType);
    const latest = await readReviewDiff(cwd, scope, { disableFilters: true });
    if (latest.repositoryRoot !== root || latest.fileRevisions[filePath] !== revision) {
      return { status: "stale", revision: latest.fileRevisions[filePath] ?? null };
    }
    return { status: "ready", revision, old: oldSide, new: newSide };
  } catch (error) {
    if (error instanceof PreviewTooLarge) return { status: "too-large", bytes: error.bytes };
    return { status: "unavailable" };
  }
}
