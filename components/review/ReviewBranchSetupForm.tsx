"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { branchChoiceUnavailable, resolveBranchSetup, type ReviewBranchChoices, type ReviewBranchSetupMode } from "@/lib/review-branch-rules";
import styles from "./review.module.css";

/**
 * Work here: the branch this Worktree commits onto.
 *
 * A branch another Worktree holds is offered but not selectable, and says why
 * where the human is about to click, which is the reference's own behaviour
 * and is kinder than letting Git refuse it afterwards.
 */
export interface BranchSetupSubmission {
  mode: ReviewBranchSetupMode;
  name: string;
}

export interface BranchSetupOutcome {
  tone: "success" | "warning" | "danger";
  message: string;
}

const UNAVAILABLE: Record<"already-current" | "checked-out-elsewhere", string> = {
  "already-current": "This Worktree is already on it",
  "checked-out-elsewhere": "Checked out in another Worktree",
};

const REFUSALS: Record<string, string> = {
  "branch-empty": "Name the branch.",
  "branch-invalid": "Git will not accept that branch name.",
  "branch-exists": "That branch already exists. Check it out instead.",
  "branch-missing": "That branch is not here any more.",
  "checked-out-elsewhere": "Another Worktree has that branch checked out, so Git will not take it here.",
  "already-current": "This Worktree is already on that branch.",
};

export function ReviewBranchSetupForm({ open, busy, choices, outcome, onSubmit, onClose }: {
  open: boolean;
  busy: boolean;
  choices: ReviewBranchChoices | null;
  outcome: BranchSetupOutcome | null;
  onSubmit: (submission: BranchSetupSubmission) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ReviewBranchSetupMode>("create");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");

  const requested = mode === "create" ? name : selected;
  // The same rules the server applies, so the form says no for the same
  // reasons rather than for its own.
  const resolved = choices && requested ? resolveBranchSetup({ mode, name: requested }, choices) : null;
  const refusal = resolved && !resolved.ok ? resolved.refusal : null;
  const canSubmit = Boolean(requested.trim()) && !busy && Boolean(choices) && !refusal;

  return <Dialog open={open} title="Work here"
    description={choices?.current ? `This Worktree is on ${choices.current}` : "This Worktree is not on a branch"}
    size="md" dismissible={!busy} onOpenChange={(next) => { if (!next) onClose(); }}>
    <div className={styles.commitRow} role="radiogroup" aria-label="Where to work">
      <label className={styles.commitCheck}>
        <input type="radio" name="review-branch-mode" checked={mode === "create"} disabled={busy}
          onChange={() => setMode("create")} />
        Create a branch
      </label>
      <label className={styles.commitCheck}>
        <input type="radio" name="review-branch-mode" checked={mode === "checkout"} disabled={busy}
          onChange={() => setMode("checkout")} />
        Check one out
      </label>
    </div>

    {mode === "create"
      ? <>
        <label className={styles.commitFieldLabel} htmlFor="review-branch-name">New branch</label>
        <input id="review-branch-name" className={styles.commitInput} value={name} disabled={busy}
          placeholder="codex/my-change" onChange={(event) => setName(event.target.value)} />
      </>
      : <>
        <label className={styles.commitFieldLabel} htmlFor="review-branch-existing">Existing branch</label>
        <select id="review-branch-existing" className={styles.commitInput} value={selected} disabled={busy}
          onChange={(event) => setSelected(event.target.value)}>
          <option value="">Select a branch</option>
          {(choices?.branches ?? []).map((branch) => {
            const unavailable = branchChoiceUnavailable(branch);
            return <option key={branch.name} value={branch.name} disabled={Boolean(unavailable)}
              title={unavailable ? UNAVAILABLE[unavailable] : undefined}>
              {unavailable ? `${branch.name} — ${UNAVAILABLE[unavailable]}` : branch.name}
            </option>;
          })}
        </select>
      </>}

    {refusal && <p className={styles.commitOutcome} data-tone="warning" role="status">{REFUSALS[refusal] ?? "That branch cannot be used here."}</p>}
    {outcome && <p className={styles.commitOutcome} data-tone={outcome.tone} role="status">{outcome.message}</p>}

    <div className={styles.confirmActions}>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button tone="primary" loading={busy} disabled={!canSubmit}
        onClick={() => onSubmit({ mode, name: requested.trim() })}>
        {mode === "create" ? "Create and work here" : "Work here"}
      </Button>
    </div>
  </Dialog>;
}
