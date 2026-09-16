import type { ReviewScope } from "./review-git";

export interface ReviewEmptyState {
  title: string;
  description: string;
}

/** Empty snapshot pairs do not imply that their changes were later committed or reverted. */
export function reviewEmptyState(kind: ReviewScope["kind"], lastTurnRecorded = false): ReviewEmptyState {
  if (kind === "staged") return { title: "No staged changes", description: "Accept edits to stage them" };
  if (kind === "unstaged") return { title: "No unstaged changes", description: "Code changes will appear here" };
  if (kind === "lastTurn") {
    return {
      title: "No file changes yet",
      description: lastTurnRecorded ? "No file changes were recorded in this turn." : "The latest diffs are no longer available.",
    };
  }
  return { title: "No file changes yet", description: "Changes in this project will appear here." };
}

/** What an empty state can offer to do about itself. */
export type ReviewEmptyStateActionKind = "retry" | "createRepository" | "viewBranchDiff" | "clearFilter";

export interface ReviewEmptyStateAction {
  kind: ReviewEmptyStateActionKind;
  label: string;
  /** The comparison a branch action would open. Set only for that action. */
  branch?: ReviewBranchComparison;
}

export interface ReviewEmptyStateModel {
  title: string;
  description: string;
  actions: ReviewEmptyStateAction[];
}

/*
 * Two of the reference's empty states are absent here: "last turn reverted"
 * and "last turn committed or reverted". Nothing records what became of a
 * turn's changes after it finished, and an empty patch is not evidence of
 * either — somebody else's commit, a checkout, or a later edit read the same.
 * Comparing against HEAD would state a conclusion the recording does not
 * support, so neither state is offered until the turn record reports it.
 */

/**
 * The empty states the panel can be in, kept apart from one another.
 *
 * A filter that hides everything is not "no changes", an unavailable Project
 * is not an empty one, and staged and unstaged each say their own thing. They
 * are separate members here so a caller cannot collapse two of them by
 * accident.
 */
export type ReviewEmptySituation =
  | {
      kind: "no-changes";
      scope: ReviewScope["kind"];
      /** The turn was recorded, so its emptiness is a reading rather than a gap. */
      lastTurnRecorded?: boolean;
    }
  | { kind: "unavailable"; title: string; description: string; retryable: boolean; reason?: string }
  | { kind: "error"; description: string }
  /**
   * The caller already knows what this empty state says, because only it can:
   * a turn shown in part, or a diff whose only changes were left out. It still
   * gets whatever way forward the rest of them get.
   */
  | { kind: "stated"; title: string; description: string }
  /** The filter on the file list hides every file it is filtering. */
  | { kind: "filtered"; filter: string };

export interface ReviewEmptyStateContext {
  /** A branch these changes could be compared against, when one is known. */
  branchComparison?: ReviewBranchComparison | null;
  /** The scope on screen, so a branch comparison is never offered against itself. */
  scope?: ReviewScope["kind"];
}

/**
 * A comparison, as Git names it and as a human reads it.
 *
 * Git's own name is a full ref — `refs/remotes/origin/main` — and that is what
 * the review is opened with, because a shortened name is not always a ref Git
 * can resolve. The label is the short one, and it is the only part anybody
 * sees.
 */
export interface ReviewBranchComparison {
  value: string;
  label: string;
}

function quoted(filter: string): string {
  return `\u201c${filter}\u201d`;
}

/**
 * Whether the next useful comparison can be offered from here.
 *
 * A branch review already is that comparison, and a Project with no known
 * comparison has no branch to offer, so both are left without the action
 * rather than given one that leads nowhere.
 */
function branchAction({ branchComparison, scope }: ReviewEmptyStateContext): ReviewEmptyStateAction[] {
  if (!branchComparison?.value.trim() || scope === "branch") return [];
  const label = branchComparison.label.trim() || branchComparison.value;
  return [{ kind: "viewBranchDiff", label: `View changes against ${label}`, branch: branchComparison }];
}

/**
 * An empty state, with whatever it can offer to do next.
 *
 * Every empty state carries its own words and its own way forward: a Project
 * with no repository offers to create one, a failed or unavailable read offers
 * a retry where retrying could succeed, a filter offers to clear itself, and
 * the rest offer the branch comparison when there is one to offer.
 */
export function reviewEmptyStateModel(
  situation: ReviewEmptySituation,
  context: ReviewEmptyStateContext = {},
): ReviewEmptyStateModel {
  if (situation.kind === "filtered") {
    return {
      title: "No files match this filter",
      description: `These changes are still here. None of them is named ${quoted(situation.filter)}.`,
      actions: [{ kind: "clearFilter", label: "Clear the filter" }],
    };
  }
  if (situation.kind === "error") {
    return {
      title: "These changes could not be loaded",
      description: situation.description,
      actions: [{ kind: "retry", label: "Retry" }, ...branchAction(context)],
    };
  }
  if (situation.kind === "stated") {
    return { title: situation.title, description: situation.description, actions: branchAction(context) };
  }
  if (situation.kind === "unavailable") {
    /*
     * A directory outside a repository is the one unavailable state with a
     * cure: Git can be started here. Git missing from the computer is not, and
     * neither is a diff too large to read, so those keep their retry or their
     * plain explanation instead of an action that cannot work.
     */
    if (situation.reason === "not-a-repository") {
      return {
        title: situation.title,
        description: situation.description,
        actions: [{ kind: "createRepository", label: "Create a Git repository" }],
      };
    }
    return {
      title: situation.title,
      description: situation.description,
      actions: [
        ...(situation.retryable ? [{ kind: "retry", label: "Retry" } as ReviewEmptyStateAction] : []),
        ...(situation.reason === "git-missing" ? [] : branchAction(context)),
      ],
    };
  }
  const recorded = reviewEmptyState(situation.scope, situation.lastTurnRecorded ?? false);
  return { ...recorded, actions: branchAction({ ...context, scope: context.scope ?? situation.scope }) };
}
