"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  reviewEmptyStateModel,
  type ReviewBranchComparison,
  type ReviewEmptySituation,
  type ReviewEmptyStateAction,
  type ReviewEmptyStateContext,
} from "@/lib/review-empty-state";
import type { ReviewRepositoryInitOutcome } from "@/lib/review-repository-init";
import styles from "./review-empty-state.module.css";

/**
 * What starting a repository is doing, and what stopped it.
 *
 * A success is not kept here. The moment a repository exists this state is
 * read again and whatever it says replaces this component, so a success
 * written here would be unreadable; the caller is told instead, and reports it
 * somewhere that survives the re-read. A failure leaves the state on screen,
 * so it stays where the action that produced it is.
 */
type CreationState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "failed"; message: string };

export interface ReviewEmptyStateProps extends ReviewEmptyStateContext {
  situation: ReviewEmptySituation;
  /**
   * How much room this has. The panel gives an empty state the whole content
   * area; the file list gives it one narrow column, where the same padding
   * pushes the words out of sight.
   */
  density?: "full" | "inline";
  /** Read the changes again. Offered wherever reading again could succeed. */
  onRetry?: () => void;
  /** Show this Project against the branch the empty state named. */
  onViewBranchDiff?: (branch: ReviewBranchComparison) => void;
  onClearFilter?: () => void;
  /** Start a Git repository here, answering with what Git did. */
  onCreateRepository?: () => Promise<ReviewRepositoryInitOutcome>;
  /**
   * A repository now exists. The caller says so where the reader will still
   * see it after this state has been read again, and reads it again itself.
   */
  onRepositoryCreated?: () => void;
}

/**
 * An empty Review, with the way out of it.
 *
 * The words and the actions are decided by `reviewEmptyStateModel`; this
 * renders them and owns the one action that has to wait for a server. An
 * action with no handler is not drawn: an offer that leads nowhere is worse
 * than the state saying only what it knows.
 */
export function ReviewEmptyState({
  situation,
  branchComparison,
  scope,
  density = "full",
  onRetry,
  onViewBranchDiff,
  onClearFilter,
  onCreateRepository,
  onRepositoryCreated,
}: ReviewEmptyStateProps) {
  const [creation, setCreation] = useState<CreationState>({ kind: "idle" });
  const model = reviewEmptyStateModel(situation, { branchComparison, scope });

  async function createRepository(create: () => Promise<ReviewRepositoryInitOutcome>) {
    setCreation({ kind: "creating" });
    try {
      const outcome = await create();
      if (outcome.status === "created") {
        setCreation({ kind: "idle" });
        onRepositoryCreated?.();
        return;
      }
      setCreation({ kind: "failed", message: outcome.message });
    } catch {
      // The call itself did not complete, so nothing is known about the
      // directory. Saying so is the honest version of a failed creation.
      setCreation({ kind: "failed", message: "Reeve could not reach the server to start a repository here." });
    }
  }

  function handler(action: ReviewEmptyStateAction): (() => void) | null {
    if (action.kind === "retry") return onRetry ?? null;
    if (action.kind === "clearFilter") return onClearFilter ?? null;
    if (action.kind === "viewBranchDiff") {
      const branch = action.branch;
      return onViewBranchDiff && branch ? () => onViewBranchDiff(branch) : null;
    }
    const create = onCreateRepository;
    return create ? () => void createRepository(create) : null;
  }

  const offered = model.actions.flatMap((action) => {
    const run = handler(action);
    return run ? [{ action, run }] : [];
  });

  return (
    <div className={styles.emptyState} data-density={density} role={situation.kind === "error" ? "alert" : "status"}>
      <p className={styles.title}>{model.title}</p>
      <p className={styles.description}>{model.description}</p>
      {offered.length > 0 && <div className={styles.actions}>
        {offered.map(({ action, run }) => <Button key={action.kind} size="sm"
          tone={action.kind === "createRepository" ? "primary" : "neutral"}
          loading={action.kind === "createRepository" && creation.kind === "creating"}
          onClick={run}>{action.label}</Button>)}
      </div>}
      {creation.kind === "failed" && <p className={styles.outcome} data-tone="danger" role="alert">{creation.message}</p>}
    </div>
  );
}
