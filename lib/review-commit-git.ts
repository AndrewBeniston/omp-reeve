import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { getAgentDir } from "./session-reader";
import { getProjectTrustStatus } from "./project-trust";
import { accountIndex, resolveBranchTarget, validateCommitMessage } from "./review-commit";

/**
 * Committing, branching and pushing for Review.
 *
 * Kept apart from reading a diff because these are the operations that write
 * history. Every one of them names its paths to Git rather than interpolating
 * a shell, reads the whole index rather than the part on screen, and refuses
 * rather than guesses when the repository has moved since the form was filled.
 */

const runFile = promisify(execFile);
const MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Git that can never stop to ask a human something.
 *
 * A server has no terminal to prompt on, so a push that wants a password must
 * fail rather than hang holding a request open.
 */
export const NON_INTERACTIVE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  SSH_ASKPASS: "",
  SSH_ASKPASS_REQUIRE: "never",
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
} as const;

export interface GitRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs Git and reports how it went, rather than throwing on a refusal. */
export async function runGit(cwd: string, args: string[]): Promise<GitRun> {
  const pending = runFile("git", ["--literal-pathspecs", "-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    timeout: 30_000,
    env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", ...NON_INTERACTIVE_GIT_ENV },
  });
  pending.child.stdin?.end();
  try {
    const { stdout, stderr } = await pending;
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const run = await runGit(cwd, args);
  if (run.code !== 0) throw new Error(`git ${args[0]} failed`);
  return run.stdout;
}

async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  const run = await runGit(cwd, args);
  return run.code === 0 ? run.stdout : null;
}

function splitZ(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

export async function repositoryRoot(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

/** No option, no NUL, not empty. A name Git can be asked to resolve. */
export function isNameableRevision(value: string): boolean {
  return Boolean(value) && !value.startsWith("-") && !value.includes("\0");
}

/**
 * The commit a revision names, or null when it names none.
 *
 * A range built from caller text hands Git whatever that text holds. A base
 * of `--output=/tmp/example` makes `--output=/tmp/example...HEAD`, which Git
 * reads as an option and a diff written to that file. Resolving to a commit
 * id first leaves no option in the range, and `--end-of-options` stops the
 * resolve itself reading one.
 */
export async function resolveRevisionCommit(repositoryRoot: string, revision: string): Promise<string | null> {
  const wanted = revision.trim();
  if (!isNameableRevision(wanted)) return null;
  const resolved = await runGit(repositoryRoot, ["rev-parse", "--verify", "--end-of-options", `${wanted}^{commit}`]);
  return resolved.code === 0 ? resolved.stdout.trim() || null : null;
}

/** Every path the index holds, from the repository root rather than the review's own directory. */
export async function readIndexPaths(repositoryRoot: string): Promise<string[]> {
  const head = await gitOrNull(repositoryRoot, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const args = head
    ? ["diff", "--cached", "--name-only", "-z"]
    : ["ls-files", "--cached", "-z"];
  return splitZ(await git(repositoryRoot, args));
}

/**
 * A digest of the whole staged tree.
 *
 * The panel's per-file digests cover what it is showing; this covers what the
 * commit would actually carry, so staging that happened elsewhere after the
 * form opened is caught too.
 */
export async function readIndexDigest(repositoryRoot: string): Promise<string> {
  const head = await gitOrNull(repositoryRoot, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const staged = head
    ? await git(repositoryRoot, ["diff", "--cached", "--no-color", "--no-ext-diff"])
    : (await git(repositoryRoot, ["ls-files", "--stage"]));
  return createHash("sha256").update(staged).digest("hex");
}

export async function readLocalBranches(repositoryRoot: string): Promise<string[]> {
  const output = await git(repositoryRoot, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"]);
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

export async function readRemotes(repositoryRoot: string): Promise<string[]> {
  const output = await git(repositoryRoot, ["remote"]);
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** The staged tree as text, for a generator that reads but never writes. */
export async function readStagedInputs(repositoryRoot: string): Promise<{ diff: string; numstat: string; subjects: string[] }> {
  const [diff, numstat, log] = await Promise.all([
    git(repositoryRoot, ["diff", "--cached", "--no-color", "--no-ext-diff"]),
    git(repositoryRoot, ["diff", "--cached", "--numstat", "--no-color"]),
    gitOrNull(repositoryRoot, ["log", "--max-count=100", "--format=%s"]),
  ]);
  return { diff, numstat, subjects: (log ?? "").split("\n").map((line) => line.trim()).filter(Boolean) };
}

/**
 * A branch as text, against where it left the base.
 *
 * Three dots, so commits that arrived on the base afterwards are not
 * described as this branch's work. Reads only.
 */
export async function readBranchInputs(repositoryRoot: string, base: string): Promise<{
  diff: string;
  numstat: string;
  subjects: string[];
  bodies: string[];
}> {
  // The base is resolved to a commit id before it reaches a range, so no
  // caller can turn a base into a Git option.
  const baseCommit = await resolveRevisionCommit(repositoryRoot, base);
  if (!baseCommit) throw new Error("Select a valid Git revision.");
  const range = `${baseCommit}...HEAD`;
  const [diff, numstat, subjects, bodies] = await Promise.all([
    git(repositoryRoot, ["diff", range, "--no-color", "--no-ext-diff"]),
    git(repositoryRoot, ["diff", range, "--numstat", "--no-color"]),
    gitOrNull(repositoryRoot, ["log", `${baseCommit}..HEAD`, "--max-count=100", "--format=%s"]),
    gitOrNull(repositoryRoot, ["log", `${baseCommit}..HEAD`, "--max-count=100", "--format=%b%x00"]),
  ]);
  return {
    diff,
    numstat,
    subjects: (subjects ?? "").split("\n").map((line) => line.trim()).filter(Boolean),
    bodies: (bodies ?? "").split("\0").map((entry) => entry.trim()).filter(Boolean),
  };
}

export type ReviewCommitRefusal =
  | "no-changes"
  | "message-empty"
  | "message-invalid"
  | "hidden-staged-paths"
  | "stale-index"
  | "index-changed-while-staging"
  | "untrusted-project"
  | "branch-exists"
  | "branch-invalid"
  | "branch-empty";

/** How a write stopped once writing had begun. */
export type ReviewCommitFailure = "checkout-failed" | "hook-rejected" | "identity-missing" | "nothing-to-commit" | "unknown";

export type ReviewPushFailure = "auth" | "non-fast-forward" | "no-upstream" | "unknown";

export interface ReviewCommitRequest {
  cwd: string;
  message: string;
  /**
   * The staged paths the panel is showing. Anything else in the index is
   * hidden from the human and has to be acknowledged before it travels.
   * Omitted means the panel is showing the whole index.
   */
  reviewedPaths?: string[];
  /** Reviewed paths to stage before committing; already-staged ones may repeat. */
  stagePaths?: string[];
  /** The digest of the whole index as the form saw it. */
  expectedIndexDigest?: string;
  /** Paths staged outside the review that the human has been shown and accepted. */
  acknowledgedHiddenPaths?: string[];
  /** A branch to create and land on first. Null commits where HEAD is. */
  createBranch?: string | null;
  push?: { remote: string; setUpstream?: boolean };
}

export interface ReviewCommitResult {
  status: "committed" | "committed-not-pushed" | "refused" | "failed";
  refusal?: ReviewCommitRefusal;
  failure?: ReviewCommitFailure;
  /** Paths this commit carried, whether reviewed or not. */
  committedPaths: string[];
  /** Staged outside the review and carried anyway, after acknowledgement. */
  hiddenPaths: string[];
  /**
   * What this request staged before it stopped. Nothing is ever rolled back —
   * another window may be working in the same repository — so a partial state
   * is reported rather than undone.
   */
  stagedPaths: string[];
  commit?: string;
  branch?: string;
  createdBranch?: boolean;
  pushed?: boolean;
  pushFailure?: ReviewPushFailure;
}

function refuse(refusal: ReviewCommitRefusal, hidden: string[] = [], stagedPaths: string[] = []): ReviewCommitResult {
  return { status: "refused", refusal, committedPaths: [], hiddenPaths: hidden, stagedPaths };
}

/** Git's own name check, which knows far more rules than a regular expression. */
async function branchNameAccepted(repositoryRoot: string, name: string): Promise<boolean> {
  if (name.startsWith("-")) return false;
  return (await runGit(repositoryRoot, ["check-ref-format", "--branch", name])).code === 0;
}

/**
 * Why a commit stopped, named only on evidence.
 *
 * A failing commit in a repository that has hooks is not proof a hook refused:
 * signing, a held index lock and a full disk all fail the same way. Without
 * something in Git's own output saying otherwise, the answer is not known.
 */
function classifyCommitFailure(stderr: string): ReviewCommitFailure {
  if (/please tell me who you are|user\.email|user\.name/i.test(stderr)) return "identity-missing";
  if (/nothing to commit|no changes added/i.test(stderr)) return "nothing-to-commit";
  if (/hook (declined|failed|refused)|hook exited/i.test(stderr)) return "hook-rejected";
  return "unknown";
}

/**
 * A digest of what the index holds for these paths: blob, mode and stage.
 *
 * Names alone would miss someone restaging different content under a path that
 * was already there, which is exactly the change a commit would carry with
 * nobody having seen it.
 */
export async function readIndexEntriesDigest(repositoryRoot: string, paths: readonly string[]): Promise<string> {
  if (paths.length === 0) return createHash("sha256").update("").digest("hex");
  const entries = await git(repositoryRoot, ["ls-files", "--stage", "-z", "--", ...paths]);
  return createHash("sha256").update(entries).digest("hex");
}

export function classifyPushFailure(stderr: string): ReviewPushFailure {
  if (/authentication failed|could not read username|permission denied|access denied|terminal prompts disabled/i.test(stderr)) return "auth";
  if (/non-fast-forward|fetch first|rejected.*(fetch|behind)/i.test(stderr)) return "non-fast-forward";
  if (/no upstream|has no upstream branch/i.test(stderr)) return "no-upstream";
  return "unknown";
}

/** The upstream this branch already has, which decides whether one is set. */
async function upstreamOf(repositoryRoot: string): Promise<string | null> {
  const upstream = await gitOrNull(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  return upstream?.trim() || null;
}

/**
 * Stage what was reviewed, commit the index, and optionally push.
 *
 * The order matters. Nothing is staged until the message and the branch are
 * known to be good, so a refusal leaves the index exactly as it was. Once the
 * commit lands, a failed push is reported as a commit that did not travel,
 * with its own hash, rather than as a failure that hides what happened.
 */
export async function commitReview(request: ReviewCommitRequest): Promise<ReviewCommitResult> {
  const root = await repositoryRoot(request.cwd);
  const message = validateCommitMessage(request.message);
  if (!message.ok) return refuse(message.problem === "empty" ? "message-empty" : "message-invalid");

  const branches = await readLocalBranches(root);
  const branch = resolveBranchTarget({ requested: request.createBranch ?? null, existingBranches: branches });
  if (!branch.ok) {
    return refuse(branch.problem === "exists" ? "branch-exists" : branch.problem === "empty" ? "branch-empty" : "branch-invalid");
  }
  if (branch.target.create && !await branchNameAccepted(root, branch.target.create)) return refuse("branch-invalid");

  // Committing runs this project's hooks, so it needs the same trust the rest
  // of the app asks for before it executes anything a repository ships.
  const trust = getProjectTrustStatus(root, getAgentDir());
  if (trust.requiresTrust && !trust.trusted) return refuse("untrusted-project");

  /*
   * Everything above and below this line is a read. The whole index is
   * accounted for — what is staged now, plus what this request would stage —
   * before a single write, so a commit that would carry someone else's staged
   * work is refused with the index exactly as it was found.
   */
  const stagePaths = request.stagePaths ?? [];
  const indexBefore = await readIndexPaths(root);
  const wouldCarry = [...new Set([...indexBefore, ...stagePaths])];
  if (wouldCarry.length === 0) return refuse("no-changes");
  const reviewed = request.reviewedPaths ?? (stagePaths.length ? stagePaths : indexBefore);
  const accounting = accountIndex(reviewed, wouldCarry);
  const acknowledged = new Set(request.acknowledgedHiddenPaths ?? []);
  const unacknowledged = accounting.hidden.filter((path) => !acknowledged.has(path));
  if (unacknowledged.length > 0) return refuse("hidden-staged-paths", unacknowledged);

  if (request.expectedIndexDigest !== undefined && await readIndexDigest(root) !== request.expectedIndexDigest) {
    return refuse("stale-index");
  }

  const stagedPaths: string[] = [];
  // What the commit would carry that this request is not staging. Its content
  // is fixed here and checked again once staging is done.
  const protectedPaths = indexBefore.filter((path) => !stagePaths.includes(path));
  const protectedBefore = await readIndexEntriesDigest(root, protectedPaths);
  if (stagePaths.length) {
    const staged = await runGit(root, ["add", "--", ...stagePaths]);
    if (staged.code !== 0) return { status: "failed", failure: "unknown", committedPaths: [], hiddenPaths: [], stagedPaths: [] };
    stagedPaths.push(...stagePaths);
  }

  /*
   * Between the reading above and the commit below, another window can stage
   * something. Nothing here holds Git's own lock — that would block the rest
   * of the machine — so the index is read once more and anything new is
   * refused, with what this request staged reported rather than undone.
   */
  const indexNow = await readIndexPaths(root);
  const appeared = accountIndex([...reviewed, ...stagedPaths], indexNow).hidden.filter((path) => !acknowledged.has(path));
  if (appeared.length > 0) return refuse("index-changed-while-staging", appeared, stagedPaths);
  // The same paths holding different content is the same problem by another name.
  if (await readIndexEntriesDigest(root, protectedPaths) !== protectedBefore) {
    return refuse("index-changed-while-staging", protectedPaths, stagedPaths);
  }
  if (indexNow.length === 0) return refuse("no-changes", [], stagedPaths);

  let createdBranch = false;
  if (branch.target.create) {
    const checkout = await runGit(root, ["checkout", "-b", branch.target.create]);
    if (checkout.code !== 0) {
      return { status: "failed", failure: "checkout-failed", committedPaths: [], hiddenPaths: accounting.hidden, stagedPaths };
    }
    createdBranch = true;
  }

  const committed = await runGit(root, ["commit", "--quiet", "--message", message.message.text]);
  if (committed.code !== 0) {
    return {
      status: "failed",
      failure: classifyCommitFailure(`${committed.stderr}\n${committed.stdout}`),
      committedPaths: [],
      hiddenPaths: accounting.hidden,
      stagedPaths,
      branch: (await gitOrNull(root, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim(),
      createdBranch,
    };
  }
  const commit = (await git(root, ["rev-parse", "HEAD"])).trim();
  const landedOn = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const result: ReviewCommitResult = {
    status: "committed",
    committedPaths: indexNow,
    hiddenPaths: accounting.hidden,
    stagedPaths,
    commit,
    branch: landedOn,
    createdBranch,
  };
  if (!request.push) return result;

  // An upstream is set only when the branch has none; a branch that already
  // tracks one keeps it rather than being repointed at another remote.
  const args = ["push"];
  if (!await upstreamOf(root)) args.push("--set-upstream");
  args.push(request.push.remote, landedOn);
  const pushed = await runGit(root, args);
  return pushed.code === 0
    ? { ...result, pushed: true }
    : { ...result, status: "committed-not-pushed", pushed: false, pushFailure: classifyPushFailure(`${pushed.stderr}\n${pushed.stdout}`) };
}
