import { getAgentDir } from "./session-reader";
import { getProjectTrustStatus } from "./project-trust";
import { repositoryRoot, runGit } from "./review-commit-git";
import {
  resolveBranchSetup,
  type ReviewBranchChoices,
  type ReviewBranchSetupRequest,
  type ReviewBranchSetupResult,
} from "./review-branch-rules";

/**
 * "Work here": the branch a Review Tab commits onto, as Git performs it.
 *
 * The reference reaches this from the Review toolbar's Git actions, and it
 * does one of two things - create a branch, or check out one that exists -
 * before the human commits, pushes and publishes from that Worktree. The
 * rules live beside this in review-branch-rules, which the form reads; this
 * half runs Git and never reaches a browser.
 */

function splitLines(output: string): string[] {
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * Every local branch, with the Worktree holding it.
 *
 * The worktree path is empty for a branch no Worktree has checked out, which
 * is exactly the set that can be checked out here.
 */
export async function readBranchChoices(cwd: string): Promise<ReviewBranchChoices> {
  const root = await repositoryRoot(cwd);
  const [listed, head] = await Promise.all([
    runGit(root, ["for-each-ref", "--format=%(refname:short)%09%(worktreepath)", "refs/heads/"]),
    runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);
  const reported = head.code === 0 ? head.stdout.trim() || null : null;
  const current = reported === "HEAD" ? null : reported;
  const branches = listed.code === 0 ? splitLines(listed.stdout).map((line) => {
    const [name, worktreePath = ""] = line.split("\t");
    return { name, checkedOutAt: worktreePath.trim() || null, current: name === current };
  }) : [];
  return { current, branches };
}

/**
 * Set the Worktree's branch, and read Git back to prove it moved.
 *
 * A checkout runs this Project's post-checkout hook, so it asks for the same
 * trust a commit does. Creating is two steps rather than one so the two
 * failures stay distinguishable: a branch that could not be made, and a branch
 * that was made but could not be moved onto - which is kept rather than
 * deleted, because deleting a ref this request created is still deleting a ref.
 */
export async function applyBranchSetup(request: ReviewBranchSetupRequest): Promise<ReviewBranchSetupResult> {
  const root = await repositoryRoot(request.cwd);
  const choices = await readBranchChoices(request.cwd);
  const resolved = resolveBranchSetup(request, choices);
  if (!resolved.ok) return { status: "refused", refusal: resolved.refusal, from: choices.current };

  const trust = getProjectTrustStatus(root, getAgentDir());
  if (trust.requiresTrust && !trust.trusted) return { status: "refused", refusal: "untrusted-project", from: choices.current };

  const { mode, name } = resolved.action;
  // Git's own name check, which knows the rules a regular expression does not.
  if (name.startsWith("-") || (await runGit(root, ["check-ref-format", "--branch", name])).code !== 0) {
    return { status: "refused", refusal: "branch-invalid", from: choices.current };
  }

  let created = false;
  if (mode === "create") {
    const set = await runGit(root, ["branch", name]);
    if (set.code !== 0) return { status: "failed", failure: "set-branch-failed", from: choices.current };
    created = true;
  }
  const checkout = await runGit(root, ["checkout", name]);
  if (checkout.code !== 0) {
    return { status: "failed", failure: "checkout-failed", branch: name, created, from: choices.current };
  }

  // Exit zero is the command's account of itself. This is Git's.
  const landed = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (landed.code !== 0 || landed.stdout.trim() !== name) {
    return { status: "failed", failure: "unknown", branch: name, created, from: choices.current };
  }
  return { status: "switched", branch: name, created, from: choices.current };
}
