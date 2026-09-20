"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { migratePrDrafts, mutatePrDrafts, reviewPrDraftOwner, reviewPrDraftPin, type ReviewPrDraft } from "@/lib/review-pr-drafts";
import { reviewPrDraftPlacement } from "@/lib/review-submission";
import { placeReviewComments } from "@/lib/review-comment-anchor";
import { reviewFilesFromPatch } from "@/lib/review-files";
import type { ReviewComment } from "@/lib/review-comments";
import type { ReviewPrClient, ReviewPrPage, ReviewPrRepository, ReviewPrSnapshot, ReviewPrSummary, ReviewPrThread } from "@/lib/review-pr-ui";
import type { ReviewRequestContext } from "@/lib/review-owner";
import { DEFAULT_REVIEW_FILE_VIEW } from "@/lib/review-selection";
import { DEFAULT_REVIEW_DISPLAY_PREFERENCES, type ReviewDisplayPreferences } from "@/lib/review-display-preferences";
import { ReviewFiles } from "./ReviewFiles";
import { reviewPrThreadPlacement } from "@/lib/review-pr-ui";
import { ReviewPrDiscussion } from "./ReviewPrDiscussion";
import styles from "./review-pr.module.css";

export function ReviewPrDetail({ context, repository, pull, client, onBack, onOpenFile, onAddToComposer, displayPreferences }: {
  context: ReviewRequestContext;
  repository: ReviewPrRepository;
  pull: ReviewPrSummary;
  client: ReviewPrClient;
  onBack: () => void;
  onOpenFile: (path: string, name: string) => void;
  onAddToComposer?: (text: string) => void;
  displayPreferences?: ReviewDisplayPreferences;
}) {
  const cwd = context.owner.worktreePath;
  const sessionId = context.owner.sessionId;
  const [snapshot, setSnapshot] = useState<ReviewPrSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void client.snapshot(context, repository, pull, controller.signal).then((value) => {
      if (!controller.signal.aborted) setSnapshot(value);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      // A refused read replaces nothing. What is on screen stays the snapshot
      // it was, and the refusal is shown beside it rather than merged into it.
      setError(failure instanceof Error ? failure.message : "The pull request could not be loaded.");
    });
    return () => controller.abort();
  }, [client, context, repository, pull, refresh]);
  return <div className={styles.detail}>
    <div className={styles.tabs}><Button size="sm" tone="ghost" onClick={onBack}>Pull requests</Button>
      <Button size="sm" tone="ghost" onClick={() => setRefresh((value) => value + 1)}>Refresh revision</Button></div>
    {error && <div className={styles.card} role="alert">
      <p className={styles.body}>{error}</p>
      <div className={styles.actions}>
        <Button size="sm" tone="ghost" onClick={() => setRefresh((value) => value + 1)}>Try again</Button>
        <Button size="sm" onClick={onBack}>Back to pull requests</Button>
      </div>
    </div>}
    {!snapshot ? !error && <p role="status" className={styles.notice}>Loading pull request…</p>
      // Keyed on the pair. Drafts now outlive a revision and are keyed by
      // owner alone, so the pair is named here explicitly: the view built on
      // a comparison must not be reused across a different one, because its
      // threads, its tab and its open editors all describe one pair.
      : <PrRevision key={`${reviewPrDraftOwner(cwd, sessionId, snapshot.identity)}|${snapshot.identity.headSha}|${snapshot.identity.baseSha}`} context={context}
        client={client} snapshot={snapshot} onOpenFile={onOpenFile} onAddToComposer={onAddToComposer} displayPreferences={displayPreferences} />}
  </div>;
}

function PrRevision({ context, snapshot, client, onOpenFile, onAddToComposer, displayPreferences }: {
  context: ReviewRequestContext;
  snapshot: ReviewPrSnapshot;
  client: ReviewPrClient;
  onOpenFile: (path: string, name: string) => void;
  onAddToComposer?: (text: string) => void;
  displayPreferences?: ReviewDisplayPreferences;
}) {
  const cwd = context.owner.worktreePath;
  const sessionId = context.owner.sessionId;
  const owner = reviewPrDraftOwner(cwd, sessionId, snapshot.identity);
  const pinned = useMemo(() => reviewPrDraftPin(snapshot.identity), [snapshot.identity]);
  const [drafts, setDrafts] = useState<ReviewPrDraft[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReviewPrPage<ReviewPrThread> | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadRefresh, setThreadRefresh] = useState(0);
  const [tab, setTab] = useState<"files" | "discussion">("files");
  const [fileView, setFileView] = useState(DEFAULT_REVIEW_FILE_VIEW);
  const [wrapLines, setWrapLines] = useState(false);
  const [diffMode, setDiffMode] = useState<"unified" | "split">("unified");
  const unanchored = reviewPrThreadPlacement(threads?.items ?? []).unanchored;
  useEffect(() => {
    // Drafts written before ownership stopped depending on the revision sit
    // under keys nothing reaches. They are brought forward here, once, before
    // anything is shown: work a person cannot see is work they have lost.
    const read = () => {
      try { setDrafts(migratePrDrafts(window.localStorage, owner)); setStorageError(null); }
      catch { setStorageError("Local PR drafts could not be read. Existing saved data has been left untouched."); }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, [owner]);
  useEffect(() => {
    const controller = new AbortController();
    setThreadError(null);
    void client.threads(context, snapshot.identity, null, controller.signal).then((value) => {
      if (!controller.signal.aborted) setThreads(value);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setThreadError(failure instanceof Error ? failure.message : "GitHub threads could not be loaded.");
    });
    return () => controller.abort();
  }, [client, context, snapshot.identity, threadRefresh]);
  const changeDrafts = (change: (current: ReviewPrDraft[]) => ReviewPrDraft[]) => {
    try { setDrafts(mutatePrDrafts(window.localStorage, owner, change)); setStorageError(null); }
    catch { setStorageError("The local PR draft could not be saved. Check browser storage."); }
  };
  /*
   * Only the drafts written against the revision on screen are drawn on it.
   * A line number from an earlier head points somewhere else once the code
   * has moved, so placing one here would attach a person's words to a line
   * they never read. The rest are kept and listed in Discussion instead.
   */
  const placement = useMemo(() => reviewPrDraftPlacement(drafts, pinned), [drafts, pinned]);
  /*
   * A comment whose publication was never confirmed is not editable here.
   *
   * The diff's card offers Edit and Delete unconditionally, and neither knows
   * what an unconfirmed publication is: editing would rewrite something that
   * may already be on GitHub, and deleting would destroy the only record that
   * it might be, without the acknowledgement that exists for exactly that.
   * Rather than teach the shared card a new state, these are withheld from the
   * diff and kept whole in Discussion, where the warning and the checked
   * discard already live.
   */
  const held = useMemo(() => placement.onThisRevision.filter((draft) => draft.uncertain === true), [placement]);
  const comments = useMemo<ReviewComment[]>(() => placement.onThisRevision.filter((draft) => draft.uncertain !== true).map((draft) => {
    const publication = draft.publication as Extract<ReviewPrDraft["publication"], { action: "inline" }>;
    return {
      id: draft.id, path: publication.path, side: publication.side,
      startLine: publication.startLine, endLine: publication.endLine,
      body: publication.body, revision: snapshot.diff.fileRevisions[publication.path] ?? "",
      createdAt: draft.updatedAt, updatedAt: draft.updatedAt,
    };
  }), [placement, snapshot.diff.fileRevisions]);
  /*
   * Placed the way the panel places its own, so the cards and the text handed
   * to the composer agree about every comment. A draft here is stamped with the
   * revision on screen as it is written, so this is ordinarily a formality.
   */
  const placedComments = useMemo(() => {
    const files = new Map<string, { patch: string; revision?: string }>();
    for (const file of reviewFilesFromPatch(snapshot.diff.patch)) {
      files.set(file.path, { patch: file.patch, revision: snapshot.diff.fileRevisions[file.path] });
    }
    return placeReviewComments(comments, files);
  }, [comments, snapshot.diff]);
  return <>
    <p className={styles.notice}><strong>#{snapshot.summary.number} {snapshot.summary.title}</strong><br />
      {snapshot.summary.headBranch} → {snapshot.summary.baseBranch} · {snapshot.identity.account}<br />
      <span className={styles.muted}>
        Reading {snapshot.identity.headSha.slice(0, 8)} against base {snapshot.identity.baseSha.slice(0, 8)}.
        Changes and discussion are read at this pair.
      </span></p>
    {snapshot.commentRestriction && <p role="status" className={styles.notice}>{snapshot.commentRestriction}</p>}
    <div className={styles.tabs}>
      <Button size="sm" tone={tab === "files" ? "neutral" : "ghost"} onClick={() => setTab("files")}>Files</Button>
      <Button size="sm" tone={tab === "discussion" ? "neutral" : "ghost"} onClick={() => setTab("discussion")}>Discussion · {drafts.length} local drafts</Button>
      {tab === "files" && <Button size="sm" tone="ghost" onClick={() => setDiffMode(diffMode === "unified" ? "split" : "unified")}>{diffMode === "unified" ? "Split diff" : "Unified diff"}</Button>}
    </div>
    {tab === "files" && <p className={styles.notice}>
      This view shows the GitHub patch with the threads published on it. Full-file context is not available for pull
      requests yet, and opening a file opens the local working copy.
      {unanchored.length > 0 && ` ${unanchored.length} published ${unanchored.length === 1 ? "thread is" : "threads are"} on lines this revision does not show; they are in Discussion.`}
      {held.length > 0 && ` ${held.length} ${held.length === 1 ? "comment has" : "comments have"} an unconfirmed publication and ${held.length === 1 ? "is" : "are"} held in Discussion, where ${held.length === 1 ? "it" : "they"} can be added to chat or discarded after you have checked GitHub.`}
    </p>}
    {storageError && <p role="alert" className={styles.notice}>{storageError}</p>}
    {threadError && <p role="alert" className={styles.notice}>{threadError}</p>}
    {tab === "files" ? <div className={styles.diff}>
      {snapshot.diff.patch ? <ReviewFiles commentSaveLabel="Save locally" scope={snapshot.diff.scope} patch={snapshot.diff.patch} repositoryRoot={snapshot.diff.repositoryRoot}
        context={context} reviewCwd={cwd} onOpenFile={onOpenFile} wrapLines={wrapLines} onToggleWrap={() => setWrapLines(!wrapLines)} diffMode={diffMode}
        displayPreferences={{ ...(displayPreferences ?? DEFAULT_REVIEW_DISPLAY_PREFERENCES), loadFullFiles: false }}
        fileRevisions={snapshot.diff.fileRevisions} fileView={fileView} onFileViewChange={setFileView}
        threads={threads?.items ?? []}
        fileOperations={[]} hunkOperations={[]} operationBusy={false} onOperate={() => undefined}
        comments={placedComments} canAddToChat={Boolean(onAddToComposer)}
        onSaveComment={(path, draft) => changeDrafts((current) => {
          const id = draft.id ?? crypto.randomUUID();
          if (current.some((item) => item.id === id && item.uncertain)) return current;
          // Stamped with the pair it was written against, so it can be kept
          // through a push and still say what it describes.
          const value: ReviewPrDraft = { id, publication: { action: "inline", path, side: draft.side, startLine: draft.startLine, endLine: draft.endLine, body: draft.body }, updatedAt: new Date().toISOString(), saved: true, pinned };
          return [...current.filter((item) => item.id !== id), value];
        })}
        // An unconfirmed record is never destroyed from here. Discussion asks
        // whether GitHub has been checked first, and that is the only route.
        onRemoveComment={(id) => changeDrafts((current) => current.some((item) => item.id === id && item.uncertain)
          ? current
          : current.filter((item) => item.id !== id))}
        onAddCommentToChat={({ comment }) => onAddToComposer?.(`PR #${snapshot.identity.number} · ${snapshot.identity.owner}/${snapshot.identity.repository}\n${comment.path}:${comment.startLine}–${comment.endLine}\n${comment.body}`)} />
        : <p className={styles.notice}>No file changes in this pull request revision.</p>}
    </div> : <ReviewPrDiscussion key={owner} owner={owner} context={context} identity={snapshot.identity} client={client} drafts={drafts} onDraftsChange={setDrafts} pinned={pinned}
      threads={threads?.items ?? []} complete={threads?.complete ?? false} onRefresh={() => setThreadRefresh((value) => value + 1)}
      canComment={snapshot.canComment} canApprove={snapshot.canApprove} canRequestChanges={snapshot.canRequestChanges}
      restriction={snapshot.commentRestriction}
      onLocate={(path) => { setFileView((current) => ({ ...current, selectedPath: path, filter: "" })); setTab("files"); }} onAddToComposer={onAddToComposer} />}
  </>;
}
