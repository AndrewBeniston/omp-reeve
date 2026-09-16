import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { conflictStagesFromIndex, type ReviewConflictStage } from "./review-conflicts";
import { generatedPathsFromAttributes } from "./review-generated";

/*
 * What Git knows about a changed file that its patch does not carry: whether
 * the repository calls it generated, and which stages an unmerged path is
 * held at. Both are reads. Neither touches the index or the working tree.
 */

export interface ReviewFileFacts {
  /** Repository-relative paths carrying the `linguist-generated` attribute. */
  generated: string[];
  /** Stages per conflicted path, for the paths that were asked about. */
  conflicts: Record<string, ReviewConflictStage[]>;
}

/** The most paths one request may ask about, so a huge review cannot stall the server. */
export const MAX_FACT_PATHS = 4096;

const run = promisify(execFile);

/**
 * A path this may be asked about at all.
 *
 * Every path reaching here came from the browser. Git is given them after
 * `--` with `--literal-pathspecs`, so neither a leading dash nor a glob
 * character can change what is read, and no shell is involved. What is
 * refused here is a path that does not name a file inside the repository in
 * the first place.
 */
function isReadablePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0")
    && !value.startsWith("/") && !/^[a-zA-Z]:[\\/]/.test(value)
    && !value.split("/").includes("..");
}

export function readableFactPaths(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isReadablePath))].slice(0, MAX_FACT_PATHS);
}

async function git(repositoryRoot: string, args: string[], input?: string): Promise<string> {
  const pending = run("git", ["--literal-pathspecs", "-C", repositoryRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 10_000,
    env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
  });
  pending.child.stdin?.end(input ?? "");
  return (await pending).stdout;
}

/**
 * Both facts for the named paths, read together.
 *
 * The attribute lookup takes its paths on standard input, because a review of
 * a few thousand files would otherwise build a command line longer than the
 * system accepts. The unmerged list is read whole and filtered here instead:
 * a repository has a handful of conflicted paths at most, so scoping that
 * read would cost more than it saves.
 *
 * A failure in either read is not a failure of the review. Generated
 * filtering and a conflict description are both additions to a diff that
 * stands without them, so each falls back to knowing nothing rather than
 * taking the panel down with it.
 */
export async function readReviewFileFacts(repositoryRoot: string, paths: string[]): Promise<ReviewFileFacts> {
  if (!paths.length) return { generated: [], conflicts: {} };
  const [attributes, unmerged] = await Promise.all([
    git(repositoryRoot, ["check-attr", "-z", "--stdin", "linguist-generated"], `${paths.join("\0")}\0`).catch(() => ""),
    git(repositoryRoot, ["ls-files", "--unmerged", "-z"]).catch(() => ""),
  ]);
  const stages = conflictStagesFromIndex(unmerged);
  const asked = new Set(paths);
  return {
    generated: generatedPathsFromAttributes(attributes).filter((path) => asked.has(path)),
    conflicts: Object.fromEntries(Object.entries(stages).filter(([path]) => asked.has(path))),
  };
}
