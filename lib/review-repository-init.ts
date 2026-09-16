import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** A Git run here writes one short line, so it needs nothing like a diff's room. */
const OUTPUT_CAP = 64 * 1024;

/** How much of Git's own words a refusal carries back to the panel. */
const REASON_CAP = 300;

export type ReviewRepositoryInitRefusal =
  /** There is already a repository here, or this directory sits inside one. */
  | "already-a-repository"
  | "git-missing"
  /** Git ran and refused. Its own first line comes back with this. */
  | "failed";

export type ReviewRepositoryInitOutcome =
  | { status: "created"; repositoryRoot: string }
  | { status: "refused"; reason: ReviewRepositoryInitRefusal; message: string };

/**
 * Git's own account of a failure, in one line and bounded.
 *
 * The empty state offers to start a repository, so a refusal has to say what
 * stopped it — a read-only directory and a broken template read the same
 * without it. Git writes the useful part first, so the first line is kept and
 * the rest dropped.
 */
function gitReason(error: unknown): string {
  const stderr = error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const message = error instanceof Error ? error.message : "";
  const line = (stderr || message).split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  return line.slice(0, REASON_CAP);
}

function isMissingGit(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

/**
 * The repository this directory belongs to, or null when it belongs to none.
 *
 * A subdirectory of a repository answers with that repository, which is what
 * keeps a second repository from being started inside one that already exists.
 */
async function repositoryAt(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], { cwd, maxBuffer: OUTPUT_CAP });
    return stdout.trim() || null;
  } catch (error) {
    if (isMissingGit(error)) throw error;
    return null;
  }
}

/**
 * Start a Git repository in a directory that has none.
 *
 * This is the way out of the one Review state that has a cure: the panel is
 * open on a directory Git knows nothing about. Nothing is staged and nothing
 * is committed — the directory gains a repository and the panel can read it.
 *
 * The caller has already established that this directory may be written to.
 * Everything decided here is decided from Git's own answers.
 */
export async function createReviewRepository(cwd: string): Promise<ReviewRepositoryInitOutcome> {
  let existing: string | null;
  try {
    existing = await repositoryAt(cwd);
  } catch (error) {
    if (isMissingGit(error)) {
      return { status: "refused", reason: "git-missing", message: "Git was not found on this computer." };
    }
    throw error;
  }
  if (existing) {
    return { status: "refused", reason: "already-a-repository", message: "This directory is already in a Git repository." };
  }
  try {
    await run("git", ["init"], { cwd, maxBuffer: OUTPUT_CAP });
  } catch (error) {
    if (isMissingGit(error)) {
      return { status: "refused", reason: "git-missing", message: "Git was not found on this computer." };
    }
    const reason = gitReason(error);
    return {
      status: "refused",
      reason: "failed",
      message: reason ? `Git could not start a repository here: ${reason}` : "Git could not start a repository here.",
    };
  }
  /*
   * The root is read back rather than assumed to be the directory Git was run
   * in. They differ under a symlinked path, and the panel reads patch paths
   * against the root.
   */
  const created = await repositoryAt(cwd);
  if (!created) {
    return { status: "refused", reason: "failed", message: "Git reported no repository after starting one here." };
  }
  return { status: "created", repositoryRoot: created };
}
