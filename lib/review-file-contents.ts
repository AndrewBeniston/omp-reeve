import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isGitReadableScope, readReviewDiff, type ReviewScope } from "./review-git";
import { reviewFilesFromPatch } from "./review-files";
import { patchBlobIds } from "./review-patch";

export const MAX_EXPANDABLE_BYTES = 2 * 1024 * 1024;
export type ReviewFileSidesResult =
  | { status: "ready"; revision: string; oldContents: string | null; newContents: string | null; oldName: string; newName: string }
  | { status: "stale"; revision: string | null }
  | { status: "not-in-review" | "binary" | "unsupported" | "unavailable" }
  | { status: "too-large"; bytes: number };

/**
 * Which version of a file is being asked for.
 *
 * `revision` pins it: the read is refused unless the file is still at that
 * digest. `current` asks for whatever it is now, and is for a reader that
 * intends to move with the review — the content still comes back bound to the
 * revision it actually has, so nothing downstream has to assume.
 *
 * A digest is a hash of one read's patch text, so a read that ignores
 * whitespace, and a read in a repository with clean or smudge filters
 * configured, each produce a different digest for the same file. A caller that
 * pins one therefore has to have taken it from a read made the same way this
 * one is; a caller that cannot is exactly who `current` is for.
 */
export type ReviewFileSidesRequest = { revision: string } | { current: true };

class ContentTooLarge extends Error {
  constructor(readonly bytes: number) { super("File exceeds expansion limit"); }
}

const exec = promisify(execFile);
async function gitBytes(root: string, args: string[], limit: number): Promise<Buffer> {
  const { stdout } = await exec("git", ["--no-replace-objects", "-C", root, ...args], {
    encoding: "buffer", maxBuffer: limit, timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
  return stdout;
}

async function readBlob(root: string, objectId: string, remaining: number): Promise<Buffer> {
  if (!/^[0-9a-f]{7,64}$/.test(objectId)) throw new Error("Invalid blob");
  const size = Number((await gitBytes(root, ["cat-file", "-s", objectId], 128)).toString().trim());
  if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid blob size");
  if (size > remaining) throw new ContentTooLarge(MAX_EXPANDABLE_BYTES - remaining + size);
  // Raw objects bypass smudge and textconv. maxBuffer also bounds unexpected output.
  return gitBytes(root, ["cat-file", "blob", objectId], Math.max(1, remaining));
}

async function readWorkingFile(root: string, filePath: string, remaining: number): Promise<Buffer> {
  const absolute = path.resolve(root, filePath);
  const resolved = await realpath(absolute);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Outside repository");
  // Refuse symlinks rather than following their target as if it were patch text.
  if (resolved !== absolute) throw new Error("Symlink file");
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    const named = await lstat(absolute);
    if (!stat.isFile() || named.isSymbolicLink() || named.dev !== stat.dev || named.ino !== stat.ino || await realpath(absolute) !== resolved) throw new Error("File identity changed");
    if (stat.size > remaining) throw new ContentTooLarge(MAX_EXPANDABLE_BYTES - remaining + stat.size);
    const buffer = Buffer.alloc(Math.min(stat.size + 1, remaining + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > remaining) throw new ContentTooLarge(MAX_EXPANDABLE_BYTES + 1);
    if (length !== stat.size || (await handle.stat()).size !== stat.size || await realpath(absolute) !== resolved) throw new Error("File changed while reading");
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

function matchesBlob(buffer: Buffer, id: string, algorithm: string): boolean {
  return createHash(algorithm).update(`blob ${buffer.length}\0`).update(buffer).digest("hex").startsWith(id);
}

export async function readReviewFileSides(cwd: string, scope: ReviewScope, filePath: string, request: ReviewFileSidesRequest, expectedRoot?: string): Promise<ReviewFileSidesResult> {
  if (!isGitReadableScope(scope)) return { status: "unsupported" };
  const diff = await readReviewDiff(cwd, scope, { disableFilters: true });
  if (expectedRoot && diff.repositoryRoot !== expectedRoot) return { status: "unavailable" };
  const file = reviewFilesFromPatch(diff.patch, diff.conflictedFiles).find((entry) => entry.path === filePath);
  if (!file) return { status: "not-in-review" };
  /*
   * The digest of this read is the one the content below belongs to, and it is
   * what comes back with it. A refusal carries it too, so a caller holding an
   * incomparable digest learns what this file is actually at rather than
   * retrying forever against a number it can never produce.
   */
  const revision = diff.fileRevisions[filePath];
  if ("revision" in request && revision !== request.revision) return { status: "stale", revision: revision ?? null };
  if (file.binary) return { status: "binary" };
  if (file.conflicted || /(?:^|\n)(?:old mode|new mode|new file mode|deleted file mode) (?:120000|160000)/.test(file.patch)) return { status: "unavailable" };
  const ids = patchBlobIds(file.patch);
  if (!ids) return { status: "unavailable" };
  try {
    const root = diff.repositoryRoot;
    const oldSide = ids.old ? await readBlob(root, ids.old, MAX_EXPANDABLE_BYTES) : null;
    const remaining = MAX_EXPANDABLE_BYTES - (oldSide?.length ?? 0);
    const historical = scope.kind === "staged" || scope.kind === "commit";
    const deleted = /^deleted file mode /m.test(file.patch);
    const newSide = deleted ? null : historical
      ? ids.new ? await readBlob(root, ids.new, remaining) : null
      : await readWorkingFile(root, file.path, remaining);
    if (!deleted && newSide === null) return { status: "unavailable" };
    const algorithm = (await gitBytes(root, ["rev-parse", "--show-object-format"], 128)).toString().trim();
    if (algorithm !== "sha1" && algorithm !== "sha256") return { status: "unavailable" };
    // The bytes read do not hash to the objects the patch names, so the file
    // moved between the patch and the read; the revision is reported as it
    // stood, because that is all this read can honestly say about it.
    if ((oldSide && ids.old && !matchesBlob(oldSide, ids.old, algorithm)) || (newSide && ids.new && !matchesBlob(newSide, ids.new, algorithm))) return { status: "stale", revision: revision ?? null };
    // Recheck the displayed patch after reading: refs, index and worktree may move independently.
    const latest = await readReviewDiff(cwd, scope, { disableFilters: true });
    // Against the revision the content was read at, whichever version was
    // asked for: content that moved mid-read is refused either way.
    if (latest.repositoryRoot !== root || latest.fileRevisions[filePath] !== revision) {
      return { status: "stale", revision: latest.fileRevisions[filePath] ?? null };
    }
    if (oldSide?.includes(0) || newSide?.includes(0)) return { status: "binary" };
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return {
      status: "ready", revision, oldContents: oldSide === null ? null : decoder.decode(oldSide),
      newContents: newSide === null ? null : decoder.decode(newSide), oldName: file.oldPath, newName: file.path,
    };
  } catch (error) {
    if (error instanceof ContentTooLarge) return { status: "too-large", bytes: error.bytes };
    return { status: "unavailable" };
  }
}
