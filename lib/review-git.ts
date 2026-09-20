import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getGitStatus } from "./git-changes";
import { reviewFilesFromPatch } from "./review-files";
import { formatMebibytes, REVIEW_AGGREGATE_BYTE_CAP, REVIEW_PER_DIFF_BYTE_CAP, REVIEW_UNTRACKED_FILE_CEILING } from "./review-limits";
import { reviewOperationsForScope, stagesByPath, type ReviewOperation } from "./review-operations";
import { singleHunkPatch, wholeFilePatch, type PatchSpan } from "./review-patch";

export type ReviewScope =
  | { kind: "staged" | "unstaged" | "uncommitted" }
  | { kind: "branch"; base: string }
  | { kind: "commit"; revision: string }
  /**
   * The changes one Session made in its most recent turn. Git holds no
   * revision for that: the turn is recorded as it runs and the diff is served
   * from the recording, so every reader in this file refuses the scope rather
   * than inventing a revision that would show something else.
   */
  | { kind: "lastTurn"; sessionId: string };

/** A scope Git itself can read, which is every scope except the recorded turn. */
export type GitReadableReviewScope = Exclude<ReviewScope, { kind: "lastTurn" }>;

export function isGitReadableScope(scope: ReviewScope): scope is GitReadableReviewScope {
  return scope.kind !== "lastTurn";
}

export interface ReviewDiff {
  repositoryRoot: string;
  /**
   * The resolved directory Review was opened for, which is the Session's own
   * working directory and not always the repository root. Patch paths are
   * repository-relative, so a reference meant for that Session has to be
   * rebased onto this.
   */
  cwd: string;
  scope: ReviewScope;
  patch: string;
  omittedUntrackedFiles: number;
  /** Repository-relative paths of untracked files included in the patch. */
  untrackedFiles: string[];
  fileRevisions: Record<string, string>;
  conflictedFiles: string[];
}

export type ReviewUnavailableReason = "not-a-repository" | "git-missing" | "diff-too-large";

/**
 * Review cannot run in this directory at all, as distinct from one revision or
 * one patch that failed. The reason reaches the browser so the panel can say
 * what is wrong instead of offering a Retry that fails the same way.
 */
export class ReviewUnavailableError extends Error {
  readonly reason: ReviewUnavailableReason;

  constructor(reason: ReviewUnavailableReason, message: string) {
    super(message);
    this.name = "ReviewUnavailableError";
    this.reason = reason;
  }
}

/**
 * The classified failure behind a Git error, or null when the failure is an
 * ordinary one. Git capability is read from Git itself: a directory can sit
 * inside a Project and still not be in a repository.
 */
export function classifyGitFailure(error: unknown): ReviewUnavailableError | null {
  if (!(error instanceof Error)) return null;
  if ("code" in error && error.code === "ENOENT") {
    return new ReviewUnavailableError("git-missing", "Git was not found on this computer, so changes cannot be read.");
  }
  /*
   * Git produced more than one read is allowed to return. That is the
   * reference's per-diff cap being hit, and it is reported as the same typed
   * refusal rather than as a generic failure, because a Retry against a diff
   * this size fails the same way every time.
   */
  if (("code" in error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") || /maxBuffer length exceeded/i.test(error.message)) {
    return new ReviewUnavailableError("diff-too-large", `These changes are larger than the ${formatMebibytes(REVIEW_PER_DIFF_BYTE_CAP)} Review reads at once, so the diff cannot be shown. Open the files you need directly, or narrow the review to a single commit.`);
  }
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  if (/not a git repository/i.test(stderr)) {
    return new ReviewUnavailableError("not-a-repository", "This directory is not in a Git repository, so there are no changes to review.");
  }
  return null;
}

/**
 * How a caller outside this module should answer a failed Review read: the
 * user-facing sentence, the reason, and the status that carries it. Null for
 * an ordinary failure, which stays a generic retryable error.
 */
export function reviewUnavailableResponse(error: unknown): { error: string; reason: ReviewUnavailableReason; status: number } | null {
  if (!(error instanceof ReviewUnavailableError)) return null;
  const status = error.reason === "git-missing" ? 503 : error.reason === "diff-too-large" ? 413 : 409;
  return { error: error.message, reason: error.reason, status };
}

export interface ReviewBranch {
  ref: string;
  name: string;
  current: boolean;
}

export interface ReviewCommit {
  sha: string;
  subject: string;
  message: string;
}

export async function readReviewBranches(cwd: string): Promise<ReviewBranch[]> {
  const output = await git(cwd, ["for-each-ref", "--sort=-committerdate", "--format=%(refname)%00%(HEAD)%00%(symref)", "refs/heads/", "refs/remotes/"]);
  return output.trimEnd().split("\n").filter(Boolean).flatMap((line) => {
    const [ref, head, symbolic] = line.split("\0");
    if (symbolic) return [];
    return [{ ref, name: ref.replace(/^refs\/(heads|remotes)\//, ""), current: head === "*" }];
  });
}

export async function defaultReviewBase(cwd: string): Promise<string | null> {
  const remotes = (await git(cwd, ["remote"])).trim().split("\n").filter(Boolean);
  remotes.sort((a, b) => a === "origin" ? -1 : b === "origin" ? 1 : a.localeCompare(b));
  for (const remote of remotes) {
    const prefix = `refs/remotes/${remote}/`;
    const symbolic = await git(cwd, ["symbolic-ref", "--quiet", `${prefix}HEAD`]).catch(() => "");
    if (symbolic.trim().startsWith(prefix)) return symbolic.trim();
    const description = await git(cwd, ["remote", "show", remote]).catch(() => "");
    const name = /HEAD branch:\s*(.+)/.exec(description)?.[1].trim();
    if (name && name !== "(unknown)") return `${prefix}${name}`;
    const refs = new Set((await readReviewBranches(cwd)).map((branch) => branch.ref));
    for (const fallback of ["main", "master"]) if (refs.has(`${prefix}${fallback}`)) return `${prefix}${fallback}`;
  }
  return null;
}

export async function readReviewCommits(cwd: string, base?: string): Promise<{ commits: ReviewCommit[] }> {
  const head = await headOrEmptyTree(cwd);
  const objectType = (await git(cwd, ["cat-file", "-t", head])).trim();
  if (objectType === "tree") return { commits: [] };
  const comparison = base ?? await defaultReviewBase(cwd);
  /*
   * With a comparison branch, the commits offered are the ones this branch
   * has and that one does not. Without one — a repository with no remote, or
   * one whose remote names no default branch — the commits offered are simply
   * the most recent, because a repository full of history is not a repository
   * with nothing to review.
   */
  let range = head;
  if (comparison) {
    const baseCommit = await resolveCommit(cwd, comparison);
    const ancestor = (await git(cwd, ["merge-base", baseCommit, head])).trim();
    range = `${ancestor}..${head}`;
  }
  const output = await git(cwd, ["log", "--max-count=100", "--format=%H%x00%s%x00%B%x1e", range, "--"]);
  const commits = output.split("\x1e").map((record) => record.trim()).filter(Boolean).map((record) => {
    const [sha, subject, message] = record.split("\0");
    return { sha, subject, message };
  });
  return { commits };
}

const runFile = promisify(execFile);

async function git(cwd: string, args: string[], { allowDifference = false, input }: { allowDifference?: boolean; input?: string } = {}): Promise<string> {
  const pending = runFile("git", ["--literal-pathspecs", "-C", cwd, ...args], {
    encoding: "utf8",
    // The per-diff cap, applied to every invocation. Exceeding it is
    // classified as a too-large refusal rather than a generic Git failure.
    maxBuffer: REVIEW_PER_DIFF_BYTE_CAP,
    timeout: 10_000,
    env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
  });
  if (input === undefined) pending.child.stdin?.end();
  else pending.child.stdin?.end(input);
  try {
    return (await pending).stdout;
  } catch (error) {
    if (allowDifference && error instanceof Error && "code" in error && error.code === 1 && "stdout" in error && typeof error.stdout === "string") return error.stdout;
    throw classifyGitFailure(error) ?? error;
  }
}

async function resolveCommit(cwd: string, revision: string): Promise<string> {
  if (!revision.trim() || revision.includes("\0")) throw new Error("Select a valid Git revision.");
  return (await git(cwd, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`])).trim();
}

async function headOrEmptyTree(cwd: string): Promise<string> {
  try {
    return await resolveCommit(cwd, "HEAD");
  } catch (error) {
    const branch = (await git(cwd, ["symbolic-ref", "HEAD"])).trim();
    try {
      await git(cwd, ["show-ref", "--verify", "--quiet", branch]);
    } catch (referenceError) {
      if (referenceError instanceof Error && "code" in referenceError && referenceError.code === 1) {
        return (await git(cwd, ["hash-object", "-t", "tree", "--stdin"])).trim();
      }
      throw referenceError;
    }
    throw error;
  }
}

export function fileRevisionsForPatch(patch: string, conflictedFiles: string[] = []): Record<string, string> {
  return Object.fromEntries(reviewFilesFromPatch(patch, conflictedFiles).map((file) => [
    file.path, createHash("sha256").update(file.patch).digest("hex"),
  ]));
}

export async function readReviewDiff(cwd: string, scope: ReviewScope, readOptions: { disableFilters?: boolean; ignoreWhitespace?: boolean } = {}): Promise<ReviewDiff> {
  if (!isGitReadableScope(scope)) throw new Error("The last turn is read from its own recording, not from Git.");
  cwd = await realpath(cwd);
  const filterArgs: string[] = [];
  if (readOptions.disableFilters) {
    const keys = await git(cwd, ["config", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"], { allowDifference: true });
    for (const key of keys.trim().split("\n").filter(Boolean)) {
      filterArgs.push("-c", `${key}=${key.endsWith(".required") ? "false" : ""}`);
    }
  }
  const readGit = (root: string, args: string[], options?: Parameters<typeof git>[2]) =>
    git(root, [...filterArgs, ...args], options);

  const repositoryRoot = (await readGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const relativeCwd = path.relative(repositoryRoot, cwd).split(path.sep).join("/") || ".";
  const options = ["--no-color", "--no-ext-diff", "--no-textconv", "--full-index", "--find-renames", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/"];
  let args: string[];
  switch (scope.kind) {
    case "staged":
      args = ["diff", ...options, "--cached"];
      break;
    case "unstaged":
      args = ["diff", ...options];
      break;
    case "uncommitted":
      args = ["diff", ...options, await headOrEmptyTree(repositoryRoot)];
      break;
    case "branch": {
      const base = await resolveCommit(repositoryRoot, scope.base);
      const head = await resolveCommit(repositoryRoot, "HEAD");
      const ancestor = (await readGit(repositoryRoot, ["merge-base", base, head])).trim();
      args = ["diff", ...options, ancestor];
      break;
    }
    case "commit":
      args = ["show", ...options, "--format=", "--first-parent", await resolveCommit(repositoryRoot, scope.revision)];
      break;
  }
  /*
   * Hiding whitespace is a different reading, not a filter over this one. R4
   * records that the reference keys its diff cache on the distinction, so the
   * two are separate results.
   *
   * Only what is displayed changes. Every digest below is taken from the exact
   * reading whatever is shown, because an operation and a context expansion
   * revalidate the revision they were given against an exact reading of their
   * own. Hashing the whitespace-ignoring text would make each of them refuse
   * every file as stale the moment whitespace was hidden.
   */
  const displayArgs = readOptions.ignoreWhitespace ? [args[0], "--ignore-all-space", ...args.slice(1)] : args;
  let patch = await readGit(repositoryRoot, [...displayArgs, "--", relativeCwd]);
  let canonicalPatch = readOptions.ignoreWhitespace ? await readGit(repositoryRoot, [...args, "--", relativeCwd]) : "";
  const unmerged = scope.kind === "commit" ? "" : await readGit(repositoryRoot, ["ls-files", "--unmerged", "-z", "--", relativeCwd]);
  const conflictedFiles = [...new Set(unmerged.split("\0").filter(Boolean).map((entry) => entry.slice(entry.indexOf("\t") + 1)))];
  let omittedUntrackedFiles = 0;
  const untrackedFiles: string[] = [];
  if (scope.kind === "unstaged" || scope.kind === "uncommitted" || scope.kind === "branch") {
    const untrackedPaths = readOptions.disableFilters
      ? (await readGit(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z", "--", relativeCwd])).split("\0").filter(Boolean)
      : (await getGitStatus(cwd)).files.filter((file) => file.status === "untracked")
        .map((file) => path.relative(repositoryRoot, file.filePath).split(path.sep).join("/"));
    /*
     * Untracked files are read one at a time and appended, so this is the one
     * place a review sums reads. Both ceilings apply here: the file count
     * first, because reading a thousand new files to discard most of them is
     * the stall this ticket exists to prevent, and then the aggregate byte cap
     * as the total grows. Anything left out is counted, never dropped quietly.
     */
    const readable = untrackedPaths.slice(0, REVIEW_UNTRACKED_FILE_CEILING);
    omittedUntrackedFiles += untrackedPaths.length - readable.length;
    // Tracked as a running total: measuring the whole patch once per file
    // turns a large untracked set into quadratic work on its own.
    let patchBytes = Buffer.byteLength(patch);
    for (const relativePath of readable) {
      let untrackedPatch: string;
      try {
        untrackedPatch = await readGit(repositoryRoot, ["diff", ...options, "--no-index", "--", "/dev/null", relativePath], { allowDifference: true });
      } catch {
        omittedUntrackedFiles++;
        continue;
      }
      const addedBytes = Buffer.byteLength(untrackedPatch);
      if (!untrackedPatch || patchBytes + addedBytes + 1 > REVIEW_AGGREGATE_BYTE_CAP) {
        omittedUntrackedFiles++;
        continue;
      }
      untrackedFiles.push(relativePath);
      const separator = patch && !patch.endsWith("\n") ? "\n" : "";
      patch += `${separator}${untrackedPatch}`;
      patchBytes += addedBytes + separator.length;
      // The same text, and never a second reading of it: an untracked file is
      // whole additions, which no whitespace option changes.
      if (readOptions.ignoreWhitespace) canonicalPatch += `${canonicalPatch && !canonicalPatch.endsWith("\n") ? "\n" : ""}${untrackedPatch}`;
    }
  }
  // Conflicted files are listed here too, so an operation can name one and be
  // told why it cannot move rather than have it quietly left out.
  const fileRevisions = fileRevisionsForPatch(readOptions.ignoreWhitespace ? canonicalPatch : patch, conflictedFiles);
  return { repositoryRoot, cwd, scope, patch, omittedUntrackedFiles, untrackedFiles, fileRevisions, conflictedFiles };
}

/** One file, or one hunk of it, that an operation was asked to act on. */
export interface ReviewTarget {
  /** Repository-relative, exactly as the patch names the file. */
  path: string;
  /** The `fileRevisions` digest the browser was showing when the human chose this. */
  revision: string;
  /** Position of the hunk within the file's patch. Absent acts on the whole file. */
  hunkIndex?: number;
  /**
   * The lines of that hunk to act on, when they are fewer than the whole.
   *
   * A panel hiding whitespace draws part of a hunk, so the patch built here is
   * cut to the part it drew. The span is resolved on the server from the two
   * readings of the diff and is never taken from the browser. Absent acts on
   * the whole hunk, which is every ordinary operation.
   */
  hunkSpan?: PatchSpan;
}

export interface ReviewApplyResult {
  /** Nothing ran for `stale`: the diff moved on, so the operation was refused whole. */
  status: "success" | "partial" | "error" | "stale";
  applied: string[];
  /** Named in the operation, but never attempted, with the reason why. */
  skipped: { path: string; message: string }[];
  failed: { path: string; message: string }[];
  stale: string[];
}

/*
 * Each reason completes the sentence the panel starts with the file's path,
 * so a report reads "conflict.txt has merge conflicts, so Git cannot move it".
 */
const APPLY_FAILED = "could not be applied as the file stands now";
const CONFLICTED = "has merge conflicts, so Git cannot move it";
const NOT_IN_DIFF = "is no longer in this diff";
const BINARY_HUNK = "has no hunks to act on, because it is binary";
const BINARY_DIVERGED = "has working-tree changes this view does not show, and reverting it here would take them away";

/**
 * The Git arguments for one operation in one scope.
 *
 * No `--3way`: a three-way fallback can write conflict markers into a file the
 * human did not choose to merge, and a failed apply that changes nothing is
 * the safer answer. Every invocation is therefore all-or-nothing, and partial
 * results come from applying file by file, never from a half-applied file.
 */
function applyArguments(operation: ReviewOperation, kind: ReviewScope["kind"], untracked: boolean): string[] {
  const args = ["apply", "--whitespace=nowarn"];
  if (operation === "stage") args.push("--cached");
  if (operation === "unstage") args.push("--cached", "-R");
  if (operation === "revert") {
    args.push("-R");
    // An unstaged change lives only in the working tree. Anything else is in
    // the index too, and reverting has to take both back together.
    // An untracked file is in neither, so naming the index would only fail.
    if (kind !== "unstaged" && !untracked) args.push("--index");
  }
  return args;
}

async function runApply(repositoryRoot: string, args: string[], patchText: string): Promise<boolean> {
  try {
    await git(repositoryRoot, args, { input: patchText });
    return true;
  } catch (error) {
    if (error instanceof ReviewUnavailableError) throw error;
    return false;
  }
}

async function hasCommit(repositoryRoot: string): Promise<boolean> {
  return await resolveCommit(repositoryRoot, "HEAD").then(() => true, () => false);
}

/**
 * Whether a path is the same in the working tree as in the index.
 *
 * A binary revert is the one operation with no patch to refuse it. Reverting
 * a staged binary file writes the committed bytes over the working tree, so
 * without this the bytes a human never saw in that view would be gone. The
 * text path already refuses such a case, because a reverse patch cannot apply
 * to an index and a working tree that hold different content.
 */
async function worktreeMatchesIndex(repositoryRoot: string, filePath: string): Promise<boolean> {
  try {
    await git(repositoryRoot, ["diff", "--quiet", "--", filePath]);
    return true;
  } catch (error) {
    if (error instanceof ReviewUnavailableError) throw error;
    return false;
  }
}

/**
 * Whether the commit at HEAD holds a version of this path.
 *
 * A staged file that HEAD has never seen is an addition, and reverting an
 * addition removes it rather than restoring anything. A repository before its
 * first commit answers no for every path, which is the same case.
 */
async function committedAtHead(repositoryRoot: string, filePath: string): Promise<boolean> {
  try {
    await git(repositoryRoot, ["cat-file", "-e", `HEAD:${filePath}`]);
    return true;
  } catch (error) {
    if (error instanceof ReviewUnavailableError) throw error;
    return false;
  }
}

/**
 * A binary file has no hunks to apply, and its patch carries no content, so it
 * is moved by naming the path to Git instead. The path is one the freshly read
 * diff just reported, and it is resolved back inside the repository before any
 * file is removed.
 */
/** Null when the path moved; otherwise the reason it did not. */
async function applyByPath(diff: ReviewDiff, operation: ReviewOperation, filePath: string): Promise<string | null> {
  const root = diff.repositoryRoot;
  const absolute = path.resolve(root, filePath);
  if (!absolute.startsWith(root + path.sep)) return APPLY_FAILED;
  if (operation === "stage") return reason(await runGitPath(root, ["add", "--", filePath]));
  if (operation === "unstage") {
    const args = await hasCommit(root)
      ? ["restore", "--staged", "--", filePath]
      : ["rm", "--cached", "--quiet", "--force", "--", filePath];
    return reason(await runGitPath(root, args));
  }
  // An untracked file is in neither the index nor a commit, so the whole of it
  // is the change on screen and removing it is the revert.
  if (diff.untrackedFiles.includes(filePath)) {
    return reason(await rm(absolute, { force: true }).then(() => true, () => false));
  }
  if (diff.scope.kind === "unstaged") return reason(await runGitPath(root, ["checkout", "--", filePath]));
  if (!await worktreeMatchesIndex(root, filePath)) return BINARY_DIVERGED;
  // Nothing to restore from: the staged file is an addition, so reverting it
  // takes the addition out of the index and the file off disk together.
  if (!await committedAtHead(root, filePath)) return reason(await runGitPath(root, ["rm", "--force", "--quiet", "--", filePath]));
  return reason(await runGitPath(root, ["checkout", "HEAD", "--", filePath]));
}

function reason(moved: boolean): string | null {
  return moved ? null : APPLY_FAILED;
}

async function runGitPath(repositoryRoot: string, args: string[]): Promise<boolean> {
  try {
    await git(repositoryRoot, args);
    return true;
  } catch (error) {
    if (error instanceof ReviewUnavailableError) throw error;
    return false;
  }
}

/**
 * Stage, unstage, or revert the named files and hunks.
 *
 * The patch that is applied is built here, from a diff read at this moment,
 * and never from patch text the browser sent. A target carries the digest the
 * browser was showing; when a digest no longer matches, the whole operation is
 * refused as stale and nothing is applied, so a patch the human stopped
 * looking at cannot reach a file that has moved on since.
 */
export async function applyReviewChange(cwd: string, operation: ReviewOperation, scope: ReviewScope, targets: ReviewTarget[]): Promise<ReviewApplyResult> {
  const targetKind = targets.some((target) => target.hunkIndex !== undefined) ? "hunk" : "file";
  if (!reviewOperationsForScope(scope.kind, targetKind).includes(operation)) throw new Error("That operation does not belong to this review scope.");
  const diff = await readReviewDiff(cwd, scope);
  const files = new Map(reviewFilesFromPatch(diff.patch, diff.conflictedFiles).map((file) => [file.path, file]));
  const stale = targets.filter((target) => {
    const file = files.get(target.path);
    return !file?.conflicted && diff.fileRevisions[target.path] !== target.revision;
  }).map((target) => target.path);
  if (stale.length) return { status: "stale", applied: [], skipped: [], failed: [], stale: [...new Set(stale)] };

  const applied: string[] = [];
  const skipped: { path: string; message: string }[] = [];
  const failed: { path: string; message: string }[] = [];
  const byPath = stagesByPath(operation, scope.kind);
  const untracked = new Set(diff.untrackedFiles);
  for (const target of targets) {
    const file = files.get(target.path);
    if (!file) {
      skipped.push({ path: target.path, message: NOT_IN_DIFF });
      continue;
    }
    if (file.conflicted) {
      skipped.push({ path: target.path, message: CONFLICTED });
      continue;
    }
    if (file.binary || byPath) {
      if (target.hunkIndex !== undefined) {
        skipped.push({ path: target.path, message: BINARY_HUNK });
        continue;
      }
      const message = await applyByPath(diff, operation, target.path);
      if (message === null) applied.push(target.path);
      else failed.push({ path: target.path, message });
      continue;
    }
    const patchText = target.hunkIndex === undefined
      ? wholeFilePatch(file.patch)
      : singleHunkPatch(file.patch, target.hunkIndex, target.hunkSpan);
    if (!patchText) {
      skipped.push({ path: target.path, message: NOT_IN_DIFF });
      continue;
    }
    const args = applyArguments(operation, scope.kind, untracked.has(target.path));
    if (await runApply(diff.repositoryRoot, args, patchText)) applied.push(target.path);
    else failed.push({ path: target.path, message: APPLY_FAILED });
  }
  return {
    // Anything named and not applied keeps the result short of a success, so a
    // section that left a conflicted file behind cannot read as a clean run.
    status: failed.length === 0 && skipped.length === 0 ? "success"
      : applied.length > 0 ? "partial"
      : "error",
    applied: [...new Set(applied)],
    skipped: firstPerPath(skipped),
    failed: firstPerPath(failed),
    stale: [],
  };
}

/**
 * One entry per file, keeping the first reason given.
 *
 * A file named more than once, by its hunks, is still one file in the report.
 * It can appear in two outcomes when its hunks did not fare alike, but never
 * twice within one of them.
 */
function firstPerPath(entries: { path: string; message: string }[]): { path: string; message: string }[] {
  const byPath = new Map<string, { path: string; message: string }>();
  for (const entry of entries) if (!byPath.has(entry.path)) byPath.set(entry.path, entry);
  return [...byPath.values()];
}
