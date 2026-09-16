import { branchNameProblem } from "./review-commit";

/**
 * The rules behind Work here, with nothing a server owns.
 *
 * Split from the module that runs Git because the form needs these and a
 * browser bundle must never reach the OMP SDK, which the Git side pulls in
 * through its trust and Session lookups. Pure, so the form and the server
 * refuse the same names for the same reasons.
 */

/** A local branch, and the Worktree holding it if one does. */
export interface ReviewBranchChoice {
  name: string;
  /** The Worktree this branch is checked out in, or null when it is free. */
  checkedOutAt: string | null;
  /** True for the branch this Worktree is on. */
  current: boolean;
}

export interface ReviewBranchChoices {
  current: string | null;
  branches: ReviewBranchChoice[];
}

export type ReviewBranchSetupRefusal =
  | "branch-empty"
  | "branch-invalid"
  | "branch-exists"
  | "branch-missing"
  | "checked-out-elsewhere"
  | "already-current"
  | "untrusted-project";

/** How a branch change stopped once Git had started. */
export type ReviewBranchSetupFailure = "set-branch-failed" | "checkout-failed" | "unknown";

export type ReviewBranchSetupMode = "create" | "checkout";

export interface ReviewBranchSetupRequest {
  cwd: string;
  mode: ReviewBranchSetupMode;
  name: string;
}

export interface ReviewBranchSetupResult {
  status: "switched" | "refused" | "failed";
  branch?: string;
  /** True when this request is what created the branch. */
  created?: boolean;
  /** The branch left behind, so a failure says where the Worktree stands. */
  from?: string | null;
  refusal?: ReviewBranchSetupRefusal;
  failure?: ReviewBranchSetupFailure;
}

/**
 * Whether this request can run, decided from the branches as they are.
 *
 * Shared with the form: the reason a choice is unavailable is the tooltip
 * beside it.
 */
export function resolveBranchSetup(
  request: { mode: ReviewBranchSetupMode; name: string },
  choices: ReviewBranchChoices,
): { ok: true; action: { mode: ReviewBranchSetupMode; name: string } } | { ok: false; refusal: ReviewBranchSetupRefusal } {
  const name = request.name.trim();
  const problem = branchNameProblem(name);
  if (problem) return { ok: false, refusal: problem === "empty" ? "branch-empty" : "branch-invalid" };
  const existing = choices.branches.find((branch) => branch.name === name);
  if (request.mode === "create") {
    return existing ? { ok: false, refusal: "branch-exists" } : { ok: true, action: { mode: "create", name } };
  }
  if (!existing) return { ok: false, refusal: "branch-missing" };
  if (existing.current) return { ok: false, refusal: "already-current" };
  // Git refuses a branch another Worktree holds, so this is said before the
  // attempt rather than reported as a failure afterwards.
  if (existing.checkedOutAt) return { ok: false, refusal: "checked-out-elsewhere" };
  return { ok: true, action: { mode: "checkout", name } };
}

/** Why a choice cannot be taken, for the control that offers it. */
export function branchChoiceUnavailable(choice: ReviewBranchChoice): "already-current" | "checked-out-elsewhere" | null {
  if (choice.current) return "already-current";
  return choice.checkedOutAt ? "checked-out-elsewhere" : null;
}
