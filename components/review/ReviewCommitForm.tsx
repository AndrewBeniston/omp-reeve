"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { commitStagingRequirement, type ReviewCommitDisabledReason } from "@/lib/review-commit";
import styles from "./review.module.css";

export interface CommitOutcome {
  tone: "success" | "warning" | "danger";
  message: string;
  /** Staged outside this review and carried anyway, or waiting to be accepted. */
  hidden: string[];
}

export interface CommitSubmission {
  message: string;
  createBranch: string | null;
  push: boolean;
  acknowledgedHiddenPaths: string[];
  /** True only when the human has agreed to stage the listed changes first. */
  stageReviewed: boolean;
}

const DISABLED_TEXT: Record<ReviewCommitDisabledReason, string> = {
  committing: "Committing…",
  loadingDiff: "Loading changes…",
  noChanges: "No changes to commit",
  unavailable: "Committing is unavailable here",
};

/**
 * The commit form: a message, where it lands, and what it will carry.
 *
 * The last part is the one that matters. `git commit` writes the whole index,
 * so when the server reports paths staged outside this review the form names
 * them and will not send again until they are accepted.
 */
export function ReviewCommitForm({ open, busy, disabledReason, currentBranch, remote, hiddenPaths, unstagedPaths, indexCount, outcome, onGenerate, onSubmit, onClose }: {
  open: boolean;
  busy: boolean;
  disabledReason: ReviewCommitDisabledReason | null;
  currentBranch: string | null;
  /** Where this branch would push: its upstream's remote, or the only one there is. */
  remote: string | null;
  hiddenPaths: string[];
  /**
   * Changes on screen that are not in the index yet. They are named here, and
   * staged only if the human asks for it.
   */
  unstagedPaths: string[];
  /** What the index holds now, which decides whether staging is the only way to commit. */
  indexCount: number;
  outcome: CommitOutcome | null;
  onGenerate: () => Promise<string | null>;
  onSubmit: (submission: CommitSubmission) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [createBranch, setCreateBranch] = useState(false);
  const [push, setPush] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [stageReviewed, setStageReviewed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateFailed, setGenerateFailed] = useState(false);

  const blocked = hiddenPaths.length > 0 && !acknowledged;
  const staging = commitStagingRequirement({ unstagedCount: unstagedPaths.length, indexCount });
  // Only an empty index makes staging the sole way to commit anything.
  const needsStaging = staging === "required" && !stageReviewed;
  const canSubmit = Boolean(message.trim()) && !busy && !disabledReason && !blocked
    && !needsStaging
    && (!createBranch || Boolean(branchName.trim()));

  return <Dialog open={open} title="Commit changes"
    description={currentBranch ? `On ${currentBranch}` : undefined}
    size="md" dismissible={!busy} onOpenChange={(next) => { if (!next) onClose(); }}>
    <label className={styles.commitFieldLabel} htmlFor="review-commit-message">Message</label>
    <textarea id="review-commit-message" className={styles.commitMessage} rows={4} value={message}
      placeholder="Describe the change, or write one for me"
      disabled={busy}
      onChange={(event) => setMessage(event.target.value)} />
    <div className={styles.commitRow}>
      <Button size="sm" tone="ghost" loading={generating} disabled={busy}
        onClick={async () => {
          setGenerating(true);
          setGenerateFailed(false);
          const written = await onGenerate();
          setGenerating(false);
          if (written) setMessage(written); else setGenerateFailed(true);
        }}>Write one for me</Button>
      {generateFailed && <span className={styles.commitNote}>No message could be written for these changes.</span>}
    </div>

    <label className={styles.commitCheck}>
      <input type="checkbox" checked={createBranch} disabled={busy}
        onChange={(event) => setCreateBranch(event.target.checked)} />
      Commit on a new branch
    </label>
    {createBranch && <input className={styles.commitInput} value={branchName} disabled={busy}
      aria-label="New branch name" placeholder="codex/my-change"
      onChange={(event) => setBranchName(event.target.value)} />}

    {remote && <label className={styles.commitCheck}>
      <input type="checkbox" checked={push} disabled={busy} onChange={(event) => setPush(event.target.checked)} />
      Push to {remote} afterwards
    </label>}

    {unstagedPaths.length > 0 && <div className={styles.commitHidden}>
      <p className={styles.commitHiddenTitle}>
        {staging === "required"
          ? unstagedPaths.length === 1
            ? "Nothing is staged. This change is the only thing there is to commit:"
            : `Nothing is staged. These ${unstagedPaths.length} changes are the only thing there is to commit:`
          : unstagedPaths.length === 1
            ? "One change on screen is not staged, and this commit will leave it alone:"
            : `${unstagedPaths.length} changes on screen are not staged, and this commit will leave them alone:`}
      </p>
      <ul className={styles.outcomeFailures}>{unstagedPaths.map((path) => <li key={path}>{path}</li>)}</ul>
      <label className={styles.commitCheck}>
        <input type="checkbox" checked={stageReviewed} disabled={busy}
          onChange={(event) => setStageReviewed(event.target.checked)} />
        {staging === "required" ? "Stage these and commit them" : "Stage these and commit them too"}
      </label>
    </div>}

    {hiddenPaths.length > 0 && <div className={styles.commitHidden} role="alert">
      <p className={styles.commitHiddenTitle}>These are staged but not in this review, and the commit would carry them:</p>
      <ul className={styles.outcomeFailures}>{hiddenPaths.map((path) => <li key={path}>{path}</li>)}</ul>
      <label className={styles.commitCheck}>
        <input type="checkbox" checked={acknowledged} disabled={busy}
          onChange={(event) => setAcknowledged(event.target.checked)} />
        Commit these too
      </label>
    </div>}

    {outcome && <p className={styles.commitOutcome} data-tone={outcome.tone} role="status">{outcome.message}</p>}

    <div className={styles.confirmActions}>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button tone="primary" loading={busy} disabled={!canSubmit} onClick={() => onSubmit({
        message,
        createBranch: createBranch ? branchName.trim() : null,
        push,
        acknowledgedHiddenPaths: acknowledged ? hiddenPaths : [],
        stageReviewed,
      })}>{disabledReason ? DISABLED_TEXT[disabledReason] : push ? "Commit and push" : "Commit"}</Button>
    </div>
  </Dialog>;
}
