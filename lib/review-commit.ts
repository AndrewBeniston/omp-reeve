/**
 * The decisions a commit needs before Git is touched.
 *
 * Everything here is pure so the rules can be tested without a repository:
 * what the index really holds against what the panel is showing, whether a
 * message can be committed, where a branch lands, and why the action is off.
 */

/** Committing reads the index, so only the scopes that describe it offer it. */
export type ReviewCommitScope = "staged" | "uncommitted";

export function scopeCanCommit(kind: string): kind is ReviewCommitScope {
  return kind === "staged" || kind === "uncommitted";
}

/** Why the action is unavailable, in the reference's own vocabulary. */
export type ReviewCommitDisabledReason = "committing" | "loadingDiff" | "noChanges" | "unavailable";

export function commitDisabledReason(state: {
  committing: boolean;
  loading: boolean;
  repositoryAvailable: boolean;
  changeCount: number;
}): ReviewCommitDisabledReason | null {
  if (!state.repositoryAvailable) return "unavailable";
  if (state.committing) return "committing";
  if (state.loading) return "loadingDiff";
  if (state.changeCount === 0) return "noChanges";
  return null;
}

export interface IndexAccounting {
  /** Staged paths the panel is showing for its scope. */
  reviewed: string[];
  /** Every path the index holds, read from the repository root. */
  index: string[];
  /** Staged, but outside what the panel shows. A commit would carry these too. */
  hidden: string[];
}

/**
 * What a commit would actually carry.
 *
 * `git commit` writes the whole index, and a Review Tab can be scoped to a
 * subfolder while something else stages elsewhere, so the paths the human
 * cannot see are counted here rather than discovered afterwards in the log.
 */
export function accountIndex(reviewed: readonly string[], index: readonly string[]): IndexAccounting {
  const shown = new Set(reviewed);
  return {
    reviewed: [...shown].sort(),
    index: [...index].sort(),
    hidden: index.filter((path) => !shown.has(path)).sort(),
  };
}

export type CommitMessageProblem = "empty" | "subject-only-whitespace";

/**
 * Whether the changes on screen have to be staged before a commit can run.
 *
 * Committing writes the index, so the only case where staging is unavoidable
 * is an index with nothing in it: there would be nothing to commit. When the
 * index already holds something, a commit of exactly that is a deliberate and
 * ordinary act, and the unstaged files on screen are reported as excluded
 * rather than swept in. The reference's safety design is reporting rather
 * than narrowing, and forcing an unrelated file into a commit to satisfy a
 * form is the opposite of what the rest of this module is for.
 */
export type CommitStagingRequirement = "none" | "optional" | "required";

export function commitStagingRequirement(state: {
  /** Reviewed changes the index does not hold. */
  unstagedCount: number;
  /** What the index holds now, whether or not the panel is showing it. */
  indexCount: number;
}): CommitStagingRequirement {
  if (state.unstagedCount === 0) return "none";
  return state.indexCount > 0 ? "optional" : "required";
}

/**
 * Reviewed files whose patch has moved since the form displayed them.
 *
 * The browser sends back the digests it was showing and they are compared to a
 * fresh reading before anything is staged: committing what a human last saw is
 * the point, and a working tree edited since then is not that.
 */
export function staleReviewedFiles(
  displayed: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(displayed)
    .filter(([path, revision]) => current[path] !== revision)
    .map(([path]) => path)
    .sort();
}

export interface CommitMessage {
  subject: string;
  body: string;
  /** What Git receives: subject, blank line, body. */
  text: string;
}

export function validateCommitMessage(message: string): { ok: true; message: CommitMessage } | { ok: false; problem: CommitMessageProblem } {
  const normalised = message.replace(/\r\n/g, "\n").trim();
  if (!normalised) return { ok: false, problem: "empty" };
  const [subjectLine, ...rest] = normalised.split("\n");
  const subject = subjectLine.trim();
  if (!subject) return { ok: false, problem: "subject-only-whitespace" };
  const body = rest.join("\n").trim();
  return { ok: true, message: { subject, body, text: body ? `${subject}\n\n${body}` : subject } };
}

export type BranchTargetProblem = "empty" | "exists" | "invalid";

export interface BranchTarget {
  /** Null commits where HEAD already is. */
  create: string | null;
}

/** Git's own rules, kept to the ones a name typed in a form can break. */
const INVALID_BRANCH = /(^[-.]|[\s~^:?*[\\]|\.\.|@\{|\.lock$|\/$|^@$)/;

/**
 * Whether a typed branch name is one Git will take.
 *
 * A first pass only: `git check-ref-format` knows far more rules and runs
 * before anything is written. This exists so the form, the commit path and the
 * branch setup all refuse the same names rather than three sets that drift.
 */
export function branchNameProblem(requested: string): "empty" | "invalid" | null {
  const name = requested.trim();
  if (!name) return "empty";
  return INVALID_BRANCH.test(name) ? "invalid" : null;
}

export function resolveBranchTarget({ requested, existingBranches }: {
  requested: string | null;
  existingBranches: readonly string[];
}): { ok: true; target: BranchTarget } | { ok: false; problem: BranchTargetProblem } {
  if (requested === null) return { ok: true, target: { create: null } };
  const name = requested.trim();
  const problem = branchNameProblem(name);
  if (problem) return { ok: false, problem };
  if (existingBranches.includes(name)) return { ok: false, problem: "exists" };
  return { ok: true, target: { create: name } };
}
