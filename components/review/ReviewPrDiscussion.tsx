"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { acknowledgePrDraft, mutatePrDrafts, readPrDrafts, type ReviewPrDraft, type ReviewPrPin } from "@/lib/review-pr-drafts";
import { outstandingThreadAction, threadActionRecords } from "@/lib/review-thread-action";
import {
  acknowledgePrSubmission, reviewPrDraftPlacement, reviewPrDraftRevisionLabel, reviewSubmissionComments,
  reviewSubmissionConfirmation, reviewSubmissionPublication, reviewSubmissionRefusal, reviewSubmissionRequest,
  reviewSubmissionRetention, reviewSubmissionRevisionState,
  type ReviewRevisionState, type ReviewSubmissionConfirmation,
} from "@/lib/review-submission";
import { reviewPrActionAllowed, type ReviewPrClient, type ReviewPrIdentity, type ReviewPrPublication, type ReviewPrThread } from "@/lib/review-pr-ui";
import type { ReviewRequestContext } from "@/lib/review-owner";
import styles from "./review-pr.module.css";

/** What one publication is called, wherever it is named to a human. */
function publicationLabel(publication: ReviewPrPublication): string {
  switch (publication.action) {
    case "inline": return `${publication.path}:${publication.startLine}–${publication.endLine}`;
    case "review": return "Review";
    case "reply": return "Reply";
    case "edit": return "Edit comment";
    case "delete": return "Delete comment";
    case "resolve": return "Resolve thread";
    case "unresolve": return "Reopen thread";
  }
}

/** Mount with key=owner so an editor cannot change ownership while open. */
export function ReviewPrDiscussion({ owner, context, identity, client, drafts, onDraftsChange, threads,
  complete, onRefresh, canComment, canApprove, canRequestChanges, restriction, onLocate, onAddToComposer, pinned }: {
  owner: string;
  context: ReviewRequestContext;
  identity: ReviewPrIdentity;
  client: ReviewPrClient;
  drafts: ReviewPrDraft[];
  onDraftsChange: (drafts: ReviewPrDraft[]) => void;
  /** The pair the drafts on screen were written against. */
  pinned: ReviewPrPin;
  threads: ReviewPrThread[];
  complete: boolean;
  onRefresh: () => void;
  canComment: boolean;
  canApprove: boolean;
  canRequestChanges: boolean;
  /** Why writing is closed here, where it is. Null means it is open. */
  restriction: string | null;
  onLocate: (path: string) => void;
  onAddToComposer?: (text: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ReviewPrDraft | null>(null);
  /**
   * A thread action waiting to be confirmed, held here and nowhere else.
   *
   * Resolving, reopening and deleting carry no words of their own, so there is
   * nothing to keep: a confirmation the human backs out of must leave the
   * local drafts exactly as it found them. The record that stops a blind
   * second attempt is written at dispatch instead, where it means something.
   */
  const [action, setAction] = useState<ReviewPrPublication | null>(null);
  /**
   * A record whose discard is being confirmed, and whether the person has
   * said they checked GitHub.
   *
   * Discarding an unconfirmed record is not housekeeping: it is the act that
   * re-opens a write which may already have landed. The consequence is stated
   * and acknowledged here, because a button's wording cannot establish that
   * anybody looked.
   */
  const [discarding, setDiscarding] = useState<ReviewPrDraft | null>(null);
  const [checkedGitHub, setCheckedGitHub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /**
   * Where the pull request stands, asked when a submission is confirmed.
   *
   * Null means the question has not been answered yet, which is why the
   * button waits: submitting is the moment a stale revision stops being a
   * display problem and becomes a verdict published against code nobody read.
   */
  const [revision, setRevision] = useState<ReviewRevisionState | null>(null);
  /**
   * The confirmation as it stood when the person agreed to it.
   *
   * Held rather than recomputed, because the drafts it describes are marked
   * possibly-sent the moment dispatch begins, and a summary derived from the
   * current list would then report carrying nothing. What was agreed to does
   * not change while the write is in flight, so the words must not either.
   */
  const [agreed, setAgreed] = useState<ReviewSubmissionConfirmation | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // One place to forget it: whenever the confirmation is no longer open.
  useEffect(() => { if (confirm === null) setAgreed(null); }, [confirm]);

  const submitting = confirm !== null && confirm.publication.action === "review";
  useEffect(() => {
    if (!submitting) return;
    const controller = new AbortController();
    setRevision(null);
    void client.revisions(context, identity, controller.signal)
      .then((observed) => { if (!controller.signal.aborted) setRevision(reviewSubmissionRevisionState(pinned, observed)); })
      // Not being able to ask is an unknown, never an all-clear.
      .catch(() => { if (!controller.signal.aborted) setRevision(reviewSubmissionRevisionState(pinned, null)); });
    return () => controller.abort();
  }, [submitting, client, context, identity, pinned]);

  /*
   * A draft written against an earlier head is kept, and kept apart. Its line
   * numbers describe code this revision no longer shows, so it is listed with
   * the revision it belongs to rather than offered for publication onto lines
   * it was never read on. Everything else — including a thread-action record,
   * which is not written against a comparison at all — stays in the main list
   * whatever revision is showing.
   */
  const earlier = useMemo(() => reviewPrDraftPlacement(drafts, pinned).onAnEarlierRevision, [drafts, pinned]);
  const onThisRevision = useMemo(() => {
    const dated = new Set(earlier.map((draft) => draft.id));
    return drafts.filter((draft) => !dated.has(draft.id));
  }, [drafts, earlier]);

  const update = (change: (current: ReviewPrDraft[]) => ReviewPrDraft[]) => {
    try {
      const next = mutatePrDrafts(window.localStorage, owner, change);
      if (alive.current) onDraftsChange(next);
      return true;
    } catch {
      if (alive.current) setMessage("The local draft could not be saved. Check browser storage before publishing.");
      return false;
    }
  };
  const start = (publication: ReviewPrPublication) => {
    const draft = { id: crypto.randomUUID(), publication, updatedAt: new Date().toISOString(), saved: false };
    if (update((current) => [...current, draft])) setEditing(draft.id);
  };
  const publish = async (draft: ReviewPrDraft) => {
    if (busy || draft.uncertain) return;
    /*
     * The gate again, at the last moment before anything is sent. What the
     * account may do, and what the host says about this thread, can both
     * change while a confirmation sits open: a refresh arrives, or standing in
     * the repository stops being establishable. The dialog's own button is
     * disabled from the same answer, and this is what decides.
     */
    if (!allowed(draft.publication)) {
      setMessage(restriction ?? "GitHub no longer permits this action here. Refresh the discussion and read it again before publishing.");
      setConfirm(null);
      return;
    }
    try {
      const current = readPrDrafts(window.localStorage, owner).find((item) => item.id === draft.id);
      if (!current || current.uncertain || current.updatedAt !== draft.updatedAt || JSON.stringify(current.publication) !== JSON.stringify(draft.publication)) {
        setMessage("This draft changed after the confirmation opened. Review the current draft before publishing.");
        setConfirm(null);
        return;
      }
    } catch {
      setMessage("The local draft could not be read, so nothing was published.");
      return;
    }
    // Mark before dispatch. A closed tab or lost connection must not offer a blind retry.
    if (!update((current) => current.map((item) => item.id === draft.id ? { ...item, uncertain: true } : item))) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.publish(context, identity, draft.publication);
      if (result.kind === "confirmed") {
        update((current) => acknowledgePrDraft(current, draft));
        if (alive.current) { setMessage("Published to GitHub."); setConfirm(null); onRefresh(); }
      } else {
        if (result.kind === "refused") update((current) => current.map((item) => item.id === draft.id ? { ...item, uncertain: false } : item));
        if (alive.current) { setMessage(result.message); setConfirm(null); }
      }
    } catch {
      if (alive.current) { setMessage("Publication could not be confirmed. Check GitHub before trying again."); setConfirm(null); }
    } finally { if (alive.current) setBusy(false); }
  };
  /**
   * Carry out one thread action, which is a publication in its own right.
   *
   * It sends what the human pressed and nothing else: no draft beside it is
   * read, edited or published by resolving a thread. The record is written
   * immediately before dispatch and marked as possibly sent, so a closed tab
   * cannot offer a blind retry; a refusal the host stated means nothing
   * happened, and the record goes with it.
   */
  const act = async (publication: ReviewPrPublication) => {
    if (busy) return;
    if (!allowed(publication)) {
      setMessage(restriction ?? "GitHub no longer permits this action here. Refresh the discussion and read it again before publishing.");
      setAction(null);
      return;
    }
    /*
     * Nothing goes out at whatever an unconfirmed write was already aimed at.
     * The mark on the record stops that record being sent twice; it does not
     * stop the button that made it being pressed again, and a second press
     * would mint a fresh record and dispatch the same mutation. Storage is
     * read rather than the rendered list, because another tab may have
     * written since this one drew.
     */
    let stored: ReviewPrDraft[];
    try { stored = readPrDrafts(window.localStorage, owner); }
    catch { setMessage("The local drafts could not be read, so nothing was sent."); setAction(null); return; }
    if (outstandingThreadAction(stored, publication)) {
      setMessage("A write to this thread could not be confirmed. Check the pull request on GitHub, then discard the unconfirmed record before trying again.");
      setAction(null);
      return;
    }
    const record: ReviewPrDraft = {
      id: crypto.randomUUID(), publication, updatedAt: new Date().toISOString(), saved: true, uncertain: true,
    };
    if (!update((current) => [...current, record])) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.publish(context, identity, publication);
      update((current) => threadActionRecords(current, record, result));
      if (alive.current) {
        setAction(null);
        if (result.kind === "confirmed") { setMessage("Published to GitHub."); onRefresh(); }
        else setMessage(result.message);
      }
    } catch {
      if (alive.current) { setMessage("Publication could not be confirmed. Check GitHub before trying again."); setAction(null); }
    } finally { if (alive.current) setBusy(false); }
  };
  /** What a submission would send: the verdict, and the comments it carries. */
  const submission = (draft: ReviewPrDraft) => {
    const publication = draft.publication as Extract<ReviewPrPublication, { action: "review" }>;
    const carried = reviewSubmissionComments(drafts, pinned);
    return { carried, request: reviewSubmissionRequest(publication.event, publication.body, carried) };
  };

  /**
   * Submit a review: one verdict, the comments saved against this revision,
   * and nothing a person has not confirmed.
   *
   * The revision is checked before the confirmation opens and again here,
   * because the whole point of the check is that it happens before the write
   * rather than being discovered by a refusal afterwards. Every draft the
   * submission carries is marked possibly-sent before dispatch and cleared
   * only on a confirmed answer, so an interrupted write leaves the work
   * intact and says so.
   */
  const submit = async (draft: ReviewPrDraft) => {
    if (busy || draft.uncertain) return;
    const { carried, request } = submission(draft);
    const refusal = reviewSubmissionRefusal({ request, restriction, canComment, canApprove, canRequestChanges,
      revision: revision ?? { kind: "unknown", message: "Whether this pull request has changed has not been established yet. Try again in a moment." } });
    if (refusal) { setMessage(refusal); setConfirm(null); return; }
    // Taken before anything is marked, so it describes what is being sent.
    setAgreed(reviewSubmissionConfirmation({ identity, request, pinned,
      revision: revision ?? { kind: "unknown", message: "Whether this pull request has changed has not been established yet." } }));
    const sent = [draft, ...carried];
    const ids = new Set(sent.map((item) => item.id));
    // Nothing was sent, so nothing was agreed to: the summary goes back to
    // describing the drafts as they actually stand.
    if (!update((entries) => entries.map((entry) => ids.has(entry.id) ? { ...entry, uncertain: true } : entry))) {
      setAgreed(null);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.publish(context, identity, reviewSubmissionPublication(request));
      const retention = reviewSubmissionRetention(result);
      update((entries) => {
        if (!retention.retain) return acknowledgePrSubmission(entries, sent);
        // A refusal the host stated means nothing left, so the mark goes.
        if (!retention.uncertain) return entries.map((entry) => ids.has(entry.id) ? { ...entry, uncertain: false } : entry);
        return entries;
      });
      if (alive.current) {
        setMessage(retention.message);
        setConfirm(null);
        if (!retention.retain) onRefresh();
      }
    } catch {
      if (alive.current) { setMessage("Publication could not be confirmed. Check GitHub before trying again; your drafts are retained."); setConfirm(null); }
    } finally { if (alive.current) setBusy(false); }
  };

  const allowed = (publication: ReviewPrPublication) =>
    reviewPrActionAllowed({ restriction, canComment, canApprove, canRequestChanges, threads, publication });
  /** Whether an unconfirmed write to this thread or comment is still outstanding. */
  const held = (publication: ReviewPrPublication) => outstandingThreadAction(drafts, publication) !== null;

  /*
   * One way to say a write is unconfirmed, and one way to discard it.
   *
   * Both are used by every card that can show a draft. A second card with its
   * own copy is how a draft written against an earlier revision came to lose
   * its warning and its acknowledgement while keeping its uncertainty.
   */
  const uncertainNotice = (draft: ReviewPrDraft) => draft.uncertain
    ? <p role="status">Publication is unconfirmed. Check the pull request on GitHub before making another attempt. This draft is retained.</p>
    : null;

  const discardButton = (draft: ReviewPrDraft) =>
    <Button size="sm" tone="ghost" disabled={busy}
      onClick={() => { if (draft.uncertain) { setCheckedGitHub(false); setDiscarding(draft); }
        else update((current) => current.filter((item) => item.id !== draft.id)); }}>
      {draft.uncertain ? "Discard unconfirmed record" : "Delete local draft"}</Button>;
  /** Whatever the confirmation is about: a saved draft, or a thread action. */
  const pending: ReviewPrPublication | null = confirm?.publication ?? action;
  /** What a submission is agreeing to: frozen once agreed, live before that. */
  const summary = agreed ?? (submitting && confirm
    ? reviewSubmissionConfirmation({ identity, request: submission(confirm).request, pinned,
        revision: revision ?? { kind: "unknown", message: "Whether this pull request has changed is still being checked." } })
    : null);

  return <div className={styles.discussion}>
    {restriction && <p className={styles.notice} role="status">{restriction}</p>}
    <div className={styles.heading}><strong>Local drafts</strong>
      {restriction
        // A form that cannot publish is not offered. The threads below stay
        // readable, which is the whole point of reading a pull request without
        // being able to write to it.
        ? <span className={styles.muted}>Read-only</span>
        : <Button size="sm" disabled={!canComment && !canApprove && !canRequestChanges} onClick={() => start({ action: "review", event: "comment", body: "" })}>Write review</Button>}
    </div>
    <p className={styles.muted}>Save locally keeps a draft here. Publish to GitHub sends it to this pull request.</p>
    {message && <p role="status">{message}</p>}
    {drafts.length === 0 && <p className={styles.muted}>No local drafts for this revision.</p>}
    {onThisRevision.map((draft) => {
      const publication = draft.publication;
      const body = "body" in publication ? publication.body : "";
      const label = publicationLabel(publication);
      return <section className={styles.card} key={draft.id} aria-label={`Local draft: ${label}`}>
        <strong>{label}</strong>
        {editing === draft.id && "body" in publication ? <>
          {publication.action === "review" && <label className={styles.controls}>Review type<select value={publication.event}
            onChange={(event) => update((current) => current.map((item) => item.id === draft.id ? { ...item, publication: { ...publication, event: event.target.value as "comment" | "approve" | "request_changes" }, updatedAt: new Date().toISOString() } : item))}>
            <option value="comment" disabled={!canComment}>Comment</option><option value="approve" disabled={!canApprove}>Approve</option>
            <option value="request_changes" disabled={!canRequestChanges}>Request changes</option>
          </select></label>}
          <textarea className={styles.input} rows={4} aria-label={`Draft ${label}`} value={body}
            onChange={(event) => update((current) => current.map((item) => item.id === draft.id ? { ...item, publication: { ...publication, body: event.target.value }, saved: false, updatedAt: new Date().toISOString() } : item))} />
          <Button size="sm" disabled={!body.trim() && !(publication.action === "review" && publication.event === "approve")}
            onClick={() => { if (update((current) => current.map((item) => item.id === draft.id ? { ...item, saved: true } : item))) setEditing(null); }}>Save locally</Button>
        </> : <p className={styles.body}>{body}</p>}
        {uncertainNotice(draft)}
        <div className={styles.actions}>
          {onAddToComposer && body && <Button size="sm" tone="ghost" onClick={() => onAddToComposer(`PR #${identity.number} · ${identity.owner}/${identity.repository}\n${label}\n${body}`)}>Add to chat</Button>}
          {!draft.uncertain && "body" in publication && <Button size="sm" tone="ghost" disabled={busy} onClick={() => setEditing(draft.id)}>Edit</Button>}
          {/* The only way out of an unconfirmed write, so it stays available,
              and it asks first because of what it re-opens. */}
          {discardButton(draft)}
          <Button size="sm" disabled={busy || !draft.saved || draft.uncertain || editing === draft.id || !allowed(publication)} onClick={() => setConfirm(draft)}>Publish to GitHub</Button>
        </div>
      </section>;
    })}
    {earlier.length > 0 && <>
      <div className={styles.heading}><strong>Written against an earlier revision</strong></div>
      <p className={styles.muted}>
        These comments are kept exactly as they were written. The lines they were left on are not the lines this
        revision shows, so they are not drawn on the diff and are not offered for publication here. Add one to chat,
        or write it again against the current revision.
      </p>
      {earlier.map((draft) => {
        const publication = draft.publication as Extract<ReviewPrPublication, { action: "inline" }>;
        const label = publicationLabel(publication);
        return <section className={styles.card} key={draft.id} aria-label={`Earlier revision draft: ${label}`}>
          <div className={styles.heading}><strong>{label}</strong>
            <span className={styles.muted}>{reviewPrDraftRevisionLabel(draft)}</span></div>
          <p className={styles.body}>{publication.body}</p>
          {uncertainNotice(draft)}
          <div className={styles.actions}>
            {onAddToComposer && <Button size="sm" tone="ghost" onClick={() => onAddToComposer(`PR #${identity.number} · ${identity.owner}/${identity.repository}\n${label}\n${publication.body}`)}>Add to chat</Button>}
            {discardButton(draft)}
          </div>
        </section>;
      })}
    </>}
    <div className={styles.heading}><strong>Published threads</strong><Button size="sm" tone="ghost" disabled={busy} onClick={onRefresh}>Refresh</Button></div>
    {!complete && <p role="status">Some GitHub threads or replies could not be loaded. This is not the complete discussion.</p>}
    {complete && threads.length === 0 && <p className={styles.muted}>No published review threads.</p>}
    {threads.map((thread) => <section className={styles.card} key={thread.id}>
      <div className={styles.heading}><Button size="sm" tone="ghost" onClick={() => onLocate(thread.path)}>{thread.path}{thread.endLine !== null ? `:${thread.endLine}` : ""}</Button>
        <span className={styles.muted}>{thread.resolved ? "Resolved" : "Open"}{thread.outdated ? " · Outdated" : ""}</span></div>
      {thread.comments.map((comment) => <div className={styles.card} key={comment.id}>
        <div className={styles.heading}><strong>{comment.author}</strong><time className={styles.muted} dateTime={comment.createdAt}>{comment.createdAt}</time></div>
        <p className={styles.body}>{comment.body}</p>
        <div className={styles.actions}>
          <a href={comment.url} target="_blank" rel="noreferrer">View on GitHub</a>
          {allowed({ action: "edit", commentId: comment.id, body: comment.body })
            && <Button size="sm" tone="ghost" disabled={busy || held({ action: "edit", commentId: comment.id, body: comment.body })}
              onClick={() => start({ action: "edit", commentId: comment.id, body: comment.body })}>Edit</Button>}
          {allowed({ action: "delete", commentId: comment.id })
            && <Button size="sm" tone="ghost" disabled={busy || held({ action: "delete", commentId: comment.id })}
              onClick={() => setAction({ action: "delete", commentId: comment.id })}>Delete from GitHub</Button>}
          {/* An unconfirmed write aimed at this comment, rather than at the
              thread, disables these two. The reason belongs beside them:
              elsewhere it reads as a dead button with nothing to explain it. */}
          {held({ action: "delete", commentId: comment.id })
            && <span className={styles.muted}>A write to this comment is unconfirmed. Check GitHub, then discard the record before trying again.</span>}
        </div>
      </div>)}
      <div className={styles.actions}>
        {allowed({ action: "reply", threadId: thread.id, body: "" })
          && <Button size="sm" disabled={busy || held({ action: "reply", threadId: thread.id, body: "" })}
            onClick={() => start({ action: "reply", threadId: thread.id, body: "" })}>Write reply</Button>}
        {allowed({ action: thread.resolved ? "unresolve" : "resolve", threadId: thread.id })
          && <Button size="sm" tone="ghost" disabled={busy || held({ action: thread.resolved ? "unresolve" : "resolve", threadId: thread.id })}
            onClick={() => setAction({ action: thread.resolved ? "unresolve" : "resolve", threadId: thread.id })}>{thread.resolved ? "Unresolve" : "Resolve"}</Button>}
        {/* The reason for the disabled buttons, beside them rather than in a
            drafts list that may be scrolled away from this thread. */}
        {held({ action: "reply", threadId: thread.id, body: "" })
          && <span className={styles.muted}>A write to this thread is unconfirmed. Check GitHub, then discard the record before trying again.</span>}
        {restriction && <span className={styles.muted}>Read-only</span>}
      </div>
    </section>)}
    <Dialog open={pending !== null} title={summary ? summary.title : "Publish to GitHub"} size="sm" dismissible={!busy}
      onOpenChange={(open) => { if (!open) { setConfirm(null); setAction(null); } }}>
      {summary
        ? <p>{summary.detail}</p>
        : <p>This sends the {pending ? publicationLabel(pending) : ""} action to {identity.owner}/{identity.repository} #{identity.number} as {identity.account}.</p>}
      {pending && "body" in pending && <p className={styles.body}>{pending.body}</p>}
      {submitting && revision === null && <p role="status">Checking whether this pull request has changed…</p>}
      {summary?.warning && <p role="alert">{summary.warning}</p>}
      {pending && !allowed(pending) && <p role="alert">
        {restriction ?? "GitHub no longer permits this action here. Refresh the discussion and read it again before publishing."}
      </p>}
      <div className={styles.actions}>
        <Button tone="ghost" disabled={busy} onClick={() => { setConfirm(null); setAction(null); }}>Cancel</Button>
        <Button disabled={busy || (pending !== null && !allowed(pending)) || (submitting && revision === null)}
          onClick={() => { if (confirm) { if (submitting) void submit(confirm); else void publish(confirm); } else if (action) void act(action); }}>
          {busy ? "Publishing…" : submitting ? "Submit review" : "Publish to GitHub"}</Button></div>
    </Dialog>
    <Dialog open={discarding !== null} title="Discard unconfirmed record" size="sm"
      onOpenChange={(open) => { if (!open) { setDiscarding(null); setCheckedGitHub(false); } }}>
      <p>
        This record is the only sign that a {discarding ? publicationLabel(discarding.publication).toLowerCase() : "write"} may
        already have reached {identity.owner}/{identity.repository} #{identity.number}. Discarding it does not undo anything on
        GitHub. It re-enables the action here, so the next press could publish the same thing a second time.
      </p>
      <label className={styles.controls}>
        <input type="checkbox" checked={checkedGitHub} onChange={(event) => setCheckedGitHub(event.target.checked)} />
        I have checked this pull request on GitHub and know whether it landed
      </label>
      <div className={styles.actions}>
        <Button tone="ghost" onClick={() => { setDiscarding(null); setCheckedGitHub(false); }}>Keep the record</Button>
        <Button disabled={!checkedGitHub}
          onClick={() => { const target = discarding; setDiscarding(null); setCheckedGitHub(false);
            if (target) update((current) => current.filter((item) => item.id !== target.id)); }}>Discard the record</Button>
      </div>
    </Dialog>
  </div>;
}
