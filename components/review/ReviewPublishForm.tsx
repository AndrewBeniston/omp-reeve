"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { publishVocabulary, type ReviewPublishCommitFirst, type ReviewPublishState } from "@/lib/review-publish-ui";
import styles from "./review.module.css";

/**
 * Creating a pull request from Review (R16).
 *
 * One surface for both forges: GitLab is this same modal saying merge request
 * throughout, which is what the reference does rather than shipping a second
 * flow. The description may be left empty, and the form says so, because an
 * empty one is written before it is sent.
 */
export interface PublishSubmission {
  title: string;
  body: string;
  base: string;
  draft: boolean;
  /** Commit and push what is local first, as the reference offers. */
  pushFirst: boolean;
  /**
   * The local changes to commit before publishing, when the human asked for
   * it. Null is the default, and null commits nothing.
   */
  commitFirst: ReviewPublishCommitFirst | null;
}

export interface PublishOutcome {
  tone: "success" | "warning" | "danger";
  message: string;
  /** The result to open, once there is one. */
  url?: string;
}

const BLOCKED: Record<string, string> = {
  "no-branch": "You are not on a branch, so there is nothing to publish.",
  "no-remote": "This Project has no remote to publish to.",
  "unsupported-remote": "This Project's remote is not a GitHub or GitLab repository.",
  "cli-missing": "Install the host's command line tool, then try again.",
  "auth-required": "Sign in to the host's command line tool for this repository, then refresh.",
  "base-missing": "This Project names no default branch to merge into.",
  "untrusted-project": "Trust this Project before publishing from it.",
  unavailable: "The host could not be read, so publishing is unavailable. Refresh and try again.",
};

export function ReviewPublishForm({ open, busy, state, outcome, onGenerate, onSubmit, onOpen, onWorkHere, onClose }: {
  open: boolean;
  busy: boolean;
  state: ReviewPublishState | null;
  outcome: PublishOutcome | null;
  onGenerate: () => Promise<{ title: string; body: string } | null>;
  onSubmit: (submission: PublishSubmission) => void;
  onOpen: (url: string) => void;
  onWorkHere: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [pushFirst, setPushFirst] = useState(false);
  const [commitFirst, setCommitFirst] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [writing, setWriting] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);

  const words = publishVocabulary(state?.forge ?? "github");
  const blocked = state?.blocked ?? null;
  const existing = state?.existing ?? null;
  // Only a remote that was actually read and found to lack the branch is
  // described as lacking it. A blocked read established nothing.
  const needsPush = state?.headPublished === false;
  /*
   * Local work the branch does not carry yet. Offered only when the state
   * actually reported some and carried the digest they were read with: a
   * commit without that digest could carry changes nobody saw.
   */
  const localChanges = state?.uncommitted ?? 0;
  const canCommitLocal = localChanges > 0 && Boolean(state?.snapshot);
  const commitReady = !commitFirst || Boolean(commitMessage.trim());
  /*
   * The remote is ready when it already has the branch, or when it does not
   * and the human has asked for it to be pushed on the way. An unread remote
   * is neither, so publishing waits rather than guessing.
   * A commit made on the way is pushed with it, so asking for one is asking
   * for the push too.
   */
  const remoteReady = state?.headPublished === true || (needsPush && (pushFirst || commitFirst));
  const canSubmit = Boolean(title.trim()) && !busy && !blocked && !existing
    && Boolean(state?.head) && Boolean(state?.base)
    && remoteReady && commitReady;

  return <Dialog open={open} title={words.create} size="md" dismissible={!busy}
    onOpenChange={(next) => { if (!next) onClose(); }}>
    {/* Head and base, with the arrow between them the reference draws. */}
    <p className={styles.branchRange}>
      {state?.head ?? "No branch"} <span aria-hidden="true">→</span> {state?.base ?? "No base branch"}
    </p>
    {!state?.head && <p className={styles.commitNote}>Work on a branch before publishing.{" "}
      <Button size="sm" tone="ghost" onClick={onWorkHere}>Work here</Button></p>}
    {state?.head && !state.base && <p className={styles.commitNote}>Choose a branch to merge into: this Project names no default.</p>}

    {existing
      ? <div className={styles.commitHidden} role="status">
        <p className={styles.commitHiddenTitle}>
          This branch already has {existing.isDraft ? `a draft ${words.noun}` : `a ${words.noun}`}: #{existing.number} {existing.title}
        </p>
        <Button size="sm" tone="primary" onClick={() => onOpen(existing.url)}>{words.view}</Button>
      </div>
      : <>
        <label className={styles.commitFieldLabel} htmlFor="review-publish-title">Title</label>
        <input id="review-publish-title" className={styles.commitInput} value={title} disabled={busy}
          placeholder={`What this ${words.noun} does`} onChange={(event) => setTitle(event.target.value)} />

        <label className={styles.commitFieldLabel} htmlFor="review-publish-body">Description</label>
        <textarea id="review-publish-body" className={styles.commitMessage} rows={5} value={body} disabled={busy}
          placeholder="Leave this empty and one will be written for you"
          onChange={(event) => setBody(event.target.value)} />
        <div className={styles.commitRow}>
          <Button size="sm" tone="ghost" loading={writing} disabled={busy}
            onClick={async () => {
              setWriting(true);
              setWriteFailed(false);
              const written = await onGenerate();
              setWriting(false);
              if (!written) { setWriteFailed(true); return; }
              if (!title.trim()) setTitle(written.title);
              setBody(written.body);
            }}>Write one for me</Button>
          {writeFailed && <span className={styles.commitNote}>Nothing could be written for this branch.</span>}
        </div>

        <label className={styles.commitCheck}>
          <input type="checkbox" checked={draft} disabled={busy} onChange={(event) => setDraft(event.target.checked)} />
          {words.draft}
        </label>
        {needsPush && <div className={styles.commitHidden}>
          <p className={styles.commitHiddenTitle}>
            {state?.remote ? `${state.remote} does not have this branch yet.` : "The remote does not have this branch yet."}
          </p>
          <label className={styles.commitCheck}>
            <input type="checkbox" checked={pushFirst} disabled={busy}
              onChange={(event) => setPushFirst(event.target.checked)} />
            Push it first
          </label>
        </div>}
        {!needsPush && Boolean(state?.unpushed) && <label className={styles.commitCheck}>
          <input type="checkbox" checked={pushFirst} disabled={busy}
            onChange={(event) => setPushFirst(event.target.checked)} />
          Push {state?.unpushed} local {state?.unpushed === 1 ? "commit" : "commits"} first
        </label>}
        {/* The reference's own commit and push local changes option (R16). */}
        {canCommitLocal && <div className={styles.commitHidden}>
          <p className={styles.commitHiddenTitle}>
            {localChanges} local {localChanges === 1 ? "change is" : "changes are"} not committed yet.
          </p>
          <label className={styles.commitCheck}>
            <input type="checkbox" checked={commitFirst} disabled={busy}
              onChange={(event) => setCommitFirst(event.target.checked)} />
            Commit and push {localChanges === 1 ? "it" : "them"} first
          </label>
          {commitFirst && <>
            <label className={styles.commitFieldLabel} htmlFor="review-publish-commit-message">Commit message</label>
            <textarea id="review-publish-commit-message" className={styles.commitMessage} rows={3}
              value={commitMessage} disabled={busy} placeholder="What this commit does"
              onChange={(event) => setCommitMessage(event.target.value)} />
            {!commitMessage.trim() && <p className={styles.commitNote}>Write a commit message before publishing.</p>}
          </>}
        </div>}
      </>}

    {blocked && <p className={styles.commitOutcome} data-tone="warning" role="alert">{BLOCKED[blocked] ?? BLOCKED.unavailable}</p>}
    {outcome && <p className={styles.commitOutcome} data-tone={outcome.tone} role="status">
      {outcome.message}
      {outcome.url && <> <Button size="sm" tone="ghost" onClick={() => onOpen(outcome.url as string)}>Open in the browser</Button></>}
    </p>}

    <div className={styles.confirmActions}>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      {!existing && <Button tone="primary" loading={busy} disabled={!canSubmit}
        onClick={() => onSubmit({
          title: title.trim(),
          body,
          base: state?.base ?? "",
          draft,
          pushFirst,
          commitFirst: commitFirst && canCommitLocal
            ? { message: commitMessage.trim(), snapshot: state?.snapshot ?? "" }
            : null,
        })}>
        {draft ? words.draft : words.create}
      </Button>}
    </div>
  </Dialog>;
}
