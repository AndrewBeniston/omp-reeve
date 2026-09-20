import { getAgentDir } from "./session-reader";
import { getProjectTrustStatus } from "./project-trust";
import { classifyPushFailure, readRemotes, repositoryRoot, runGit, type ReviewPushFailure } from "./review-commit-git";

/**
 * Pushing a branch that is already committed.
 *
 * Separate from committing because the reference treats it as its own action
 * with its own state: a branch can be ahead of its upstream with nothing left
 * to commit, and that is exactly when this is the only thing left to do. It
 * runs Git through the same guarded, non-interactive runner the commit path
 * uses, so there is one set of rules rather than two that can drift.
 */
async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  const run = await runGit(cwd, args);
  return run.code === 0 ? run.stdout : null;
}

export interface ReviewPushState {
  branch: string | null;
  upstream: string | null;
  /** Commits on this branch that the upstream does not have. */
  ahead: number;
  remotes: string[];
  /** Why pushing is unavailable, or null when it can run. */
  blocked: "no-branch" | "no-remote" | "nothing-to-push" | "untrusted-project" | null;
}

export async function readPushState(cwd: string): Promise<ReviewPushState> {
  const root = await repositoryRoot(cwd);
  const [branchName, upstreamName, remotes] = await Promise.all([
    gitOrNull(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    gitOrNull(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    readRemotes(root).catch(() => [] as string[]),
  ]);
  const branch = branchName?.trim() || null;
  const upstream = upstreamName?.trim() || null;
  // Without an upstream every commit on the branch is unpushed, which is what
  // a first push carries.
  const count = await gitOrNull(root, upstream
    ? ["rev-list", "--count", `${upstream}..HEAD`]
    : ["rev-list", "--count", "HEAD"]);
  const ahead = Number(count?.trim() ?? "0") || 0;
  // A push runs this project's pre-push hook, so it needs the same trust a
  // commit does before anything of the repository's is executed.
  const trust = getProjectTrustStatus(root, getAgentDir());
  const blocked = !branch || branch === "HEAD" ? "no-branch"
    : trust.requiresTrust && !trust.trusted ? "untrusted-project"
    : remotes.length === 0 ? "no-remote"
    : ahead === 0 ? "nothing-to-push"
    : null;
  return { branch, upstream, ahead, remotes, blocked };
}

export interface ReviewPushResult {
  status: "pushed" | "refused" | "failed";
  blocked?: ReviewPushState["blocked"];
  failure?: ReviewPushFailure;
  branch?: string;
  remote?: string;
  ahead?: number;
}

export async function pushReviewBranch(cwd: string, remote: string): Promise<ReviewPushResult> {
  const state = await readPushState(cwd);
  if (state.blocked) return { status: "refused", blocked: state.blocked };
  if (!state.remotes.includes(remote)) return { status: "refused", blocked: "no-remote" };
  const root = await repositoryRoot(cwd);
  const args = ["push"];
  if (!state.upstream) args.push("--set-upstream");
  args.push(remote, state.branch as string);
  const pushed = await runGit(root, args);
  return pushed.code === 0
    ? { status: "pushed", branch: state.branch ?? undefined, remote, ahead: state.ahead }
    : {
      status: "failed",
      failure: classifyPushFailure(`${pushed.stderr}\n${pushed.stdout}`),
      branch: state.branch ?? undefined,
      remote,
      ahead: state.ahead,
    };
}
