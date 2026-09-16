"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/Button";
import type { ReviewFile } from "@/lib/review-files";
import { reviewLineRangeLabel, type ReviewComment, type ReviewCommentDraft } from "@/lib/review-comments";
import { captureReviewCommentAnchor, type PlacedReviewComment } from "@/lib/review-comment-anchor";
import { REVIEW_OPERATION_LABELS, type ReviewOperation, type ReviewOperationRequest } from "@/lib/review-operations";
import { hunkLineRange, patchHunks } from "@/lib/review-patch";
import { ReviewCommentCard } from "./ReviewCommentCard";
import { ReviewPrThreadCard } from "./ReviewPrThreadCard";
import { ReviewFindingCard } from "./ReviewFindingCard";
import { reviewPrThreadPlacement, type ReviewPrThread } from "@/lib/review-pr-ui";
import { reviewFindingSitsOnALine, type PlacedReviewFinding, type ReviewFindingsHandling } from "@/lib/review-findings";
import type { ReviewScope } from "@/lib/review-git";
import type { ReviewRequestContext } from "@/lib/review-owner";
import type { ReviewViewAnnotation } from "./ReviewDiffView";
import type { ReviewDisplayPreferences } from "@/lib/review-display-preferences";
import styles from "./review.module.css";
import findingStyles from "./review-findings.module.css";

const ReviewDiffView = dynamic(() => import("./ReviewDiffView").then((module) => module.ReviewDiffView), {
  ssr: false,
  loading: () => <p className={styles.message} role="status">Loading diff viewer…</p>,
});

interface DraftRange {
  side: "additions" | "deletions";
  startLine: number;
  endLine: number;
}

/** One comment editor: whether it is open, and what has been typed into it. */
interface CommentEditor {
  editing: boolean;
  body: string;
}

/** The key the not-yet-saved comment's editor is held under. */
const DRAFT_EDITOR = "draft";


/** One renderer per file keeps expanded context and original hunk targets together. */
export function ReviewFileDiff({ onCommentEditingChange, commentSaveLabel, displayPreferences, context, scope, file, revision, operations, busy, onOperate, onOpenFile, wrapLines, diffMode, comments, threads, findings, canAddToChat, onSaveComment, onRemoveComment, onAddCommentToChat }: {
  onCommentEditingChange?: (id: string, editing: boolean) => void;
  commentSaveLabel?: string;
  displayPreferences?: ReviewDisplayPreferences;
  /** The Tab and owner expanding this file, carried on every read. */
  context: ReviewRequestContext;
  scope: ReviewScope;
  file: ReviewFile;
  revision?: string;
  operations: ReviewOperation[];
  busy: boolean;
  onOperate: (request: ReviewOperationRequest) => void;
  /** Opens this file in its own tab, offered when its diff is too large to draw. */
  onOpenFile?: () => void;
  wrapLines: boolean;
  diffMode: "unified" | "split";
  /** This file's saved comments, already placed against this patch. */
  comments: readonly PlacedReviewComment[];
  /** This file's published pull-request threads, owned by the host. */
  threads?: ReviewPrThread[];
  /** This file's findings from the latest review, already placed. */
  findings?: ReviewFindingsHandling;
  canAddToChat: boolean;
  onSaveComment: (draft: ReviewCommentDraft) => void;
  onRemoveComment: (id: string) => void;
  onAddCommentToChat: (entry: PlacedReviewComment) => void;
}) {
  const [draft, setDraft] = useState<DraftRange | null>(null);
  /*
   * Held here, above the rows the renderer virtualises, so scrolling away from
   * a comment being written does not discard it. The panel is told which
   * editors are open from here too, under keys that do not change when a row
   * is unmounted and drawn again — it defers a background refresh while an
   * editor is open, and a row that reported itself closed on unmount would let
   * that refresh through mid-sentence.
   */
  const [editors, setEditors] = useState<Record<string, CommentEditor>>({});
  const openEditor = (comment?: ReviewComment): CommentEditor => ({ editing: !comment, body: comment?.body ?? "" });
  const editorFor = (key: string, comment?: ReviewComment) => editors[key] ?? openEditor(comment);
  const updateEditor = (key: string, comment: ReviewComment | undefined, next: Partial<CommentEditor>) =>
    setEditors((current) => ({ ...current, [key]: { ...current[key] ?? openEditor(comment), ...next } }));
  const forgetEditor = (key: string) => setEditors((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
  const openKeys = Object.entries(editors).filter(([, editor]) => editor.editing).map(([key]) => key).join("\n");
  useEffect(() => {
    if (!onCommentEditingChange) return;
    const keys = openKeys ? openKeys.split("\n") : [];
    for (const key of keys) onCommentEditingChange(`${file.path}:${key}`, true);
    return () => { for (const key of keys) onCommentEditingChange(`${file.path}:${key}`, false); };
  }, [openKeys, file.path, onCommentEditingChange]);
  const expansion = useMemo(() => revision ? { context, scope, path: file.path, revision } : undefined, [context, scope, file.path, revision]);
  const hunks = useMemo(() => patchHunks(file.patch).map((text, index) => ({ index, range: hunkLineRange(text), text })), [file.patch]);

  // Placed by the panel, which works every comment out once so that this diff
  // and the text handed to the composer cannot disagree about one of them.
  const detached = comments.filter((entry) => entry.placement.state === "detached");
  /*
   * The findings of this file that no line here can carry: the ones written
   * against lines this revision no longer shows, and the ones Reeve could
   * never place at all. They are drawn above the diff, beside the detached
   * comments, because the alternative is drawing the model's words on a line
   * it may not be about.
   */
  const findingsOff = (findings?.findings ?? []).filter((entry) => !reviewFindingSitsOnALine(entry));

  /** One finding, read-only, with the only two acts this panel offers on it. */
  const addFindingToChat = findings?.onAddFindingToChat;
  const findingCard = (placed: PlacedReviewFinding) => findings
    ? <ReviewFindingCard key={placed.finding.id} placed={placed}
        dismissed={findings.isFindingDismissed(placed.finding.id)}
        canAddToChat={Boolean(addFindingToChat)}
        onDismiss={() => findings.onDismissFinding(placed.finding.id)}
        onRestore={() => findings.onRestoreFinding(placed.finding.id)}
        onAddToChat={addFindingToChat ? () => addFindingToChat(placed) : undefined} />
    : null;

  /**
   * A saved comment, named by the lines it is on now rather than the ones it
   * was written against, and marked whenever those two have parted.
   */
  const savedCard = ({ comment, placement }: PlacedReviewComment) => {
    const editor = editorFor(comment.id, comment);
    return <ReviewCommentCard saveLabel={commentSaveLabel} key={comment.id} comment={comment}
      editing={editor.editing} body={editor.body}
      onEditingChange={(editing) => updateEditor(comment.id, comment, { editing })}
      onBodyChange={(body) => updateEditor(comment.id, comment, { body })}
      rangeLabel={placement.state === "detached"
        ? reviewLineRangeLabel(comment.startLine, comment.endLine)
        : reviewLineRangeLabel(placement.startLine, placement.endLine)}
      status={placement.state === "anchored" ? undefined : placement.state}
      canAddToChat={canAddToChat}
      onCancel={() => forgetEditor(comment.id)}
      onSave={(body) => { onSaveComment({ id: comment.id, side: comment.side, startLine: comment.startLine, endLine: comment.endLine, body }); forgetEditor(comment.id); }}
      onRemove={() => onRemoveComment(comment.id)}
      onAddToChat={() => onAddCommentToChat({ comment, placement })} />;
  };

  const annotationsFor = () => {
    const grouped = new Map<string, { side: "additions" | "deletions"; lineNumber: number; metadata: ReviewViewAnnotation }>();
    for (const entry of comments) {
      const { comment, placement } = entry;
      // A detached comment is drawn above the diff instead. There is no line
      // here it can honestly be put against, and inventing one is the failure
      // this whole arrangement exists to avoid.
      if (placement.state === "detached") continue;
      const key = `${comment.side}:${placement.startLine}`;
      const existing = grouped.get(key);
      if (existing?.metadata.comments) existing.metadata.comments.push(entry);
      else grouped.set(key, { side: comment.side, lineNumber: placement.startLine, metadata: { comments: [entry] } });
    }
    const merge = (side: "additions" | "deletions", lineNumber: number, metadata: ReviewViewAnnotation) => {
      const key = `${side}:${lineNumber}`;
      const existing = grouped.get(key);
      if (existing) Object.assign(existing.metadata, metadata);
      else grouped.set(key, { side, lineNumber, metadata });
    };
    // Published threads sit on the same lines as anything written here, so
    // they are grouped by the same key and drawn in the same place.
    for (const thread of reviewPrThreadPlacement(threads ?? []).anchored) {
      const side = thread.side;
      const line = thread.startLine as number;
      const existing = grouped.get(`${side}:${line}`);
      if (existing?.metadata.threads) existing.metadata.threads.push(thread);
      else merge(side, line, { threads: [thread] });
    }
    if (draft) merge(draft.side, draft.startLine, { draft: { startLine: draft.startLine, endLine: draft.endLine } });
    /*
     * A finding sits on the same line key as everything else written about
     * that line, so the model's words and the human's are drawn together
     * rather than in two places a scroll apart.
     */
    for (const entry of findings?.findings ?? []) {
      const placement = entry.placement;
      if (placement.state !== "anchored" && placement.state !== "moved") continue;
      const existing = grouped.get(`${entry.finding.side}:${placement.startLine}`);
      if (existing?.metadata.findings) existing.metadata.findings.push(entry);
      else merge(entry.finding.side, placement.startLine, { findings: [entry] });
    }
    /*
     * A hunk drawn while whitespace is hidden comes from a different reading of
     * the diff, so it carries the whole hunk as its name and the server finds
     * the exact hunk behind it by the file lines it covers. The operation is
     * offered here either way; what cannot be resolved is refused there.
     */
    if (operations.length && revision) {
      for (const hunk of hunks) {
        if (!hunk.range) continue;
        const side = hunk.range.additions.end >= hunk.range.additions.start ? "additions" : "deletions";
        const lineNumber = hunk.range[side].start;
        if (lineNumber > 0) merge(side, lineNumber, { hunkIndex: hunk.index });
      }
    }
    return [...grouped.values()];
  };

  const renderCommentAnnotation = (annotation: { metadata?: ReviewViewAnnotation }) => {
    const metadata = annotation.metadata;
    if (!metadata) return null;
    if (metadata.draft) {
      const { startLine, endLine } = metadata.draft;
      const label = reviewLineRangeLabel(startLine, endLine);
      const editor = editorFor(DRAFT_EDITOR);
      // A published thread on this line stays drawn while a comment is being
      // written under it: the words being answered must not vanish mid-reply.
      return <div className={styles.commentStack}>
        {(metadata.findings ?? []).map(findingCard)}
        {(metadata.threads ?? []).map((thread) => <ReviewPrThreadCard key={thread.id} thread={thread} />)}
        <ReviewCommentCard saveLabel={commentSaveLabel} rangeLabel={label} canAddToChat={false}
        editing={editor.editing} body={editor.body}
        onEditingChange={(editing) => updateEditor(DRAFT_EDITOR, undefined, { editing })}
        onBodyChange={(body) => updateEditor(DRAFT_EDITOR, undefined, { body })}
        onCancel={() => { setDraft(null); forgetEditor(DRAFT_EDITOR); }}
        onSave={(body) => {
          if (!draft) return;
          onSaveComment({
            side: draft.side, startLine: draft.startLine, endLine: draft.endLine, body,
            // Taken here, where the lines are, so the comment can find them
            // again once this revision has passed.
            anchor: captureReviewCommentAnchor(file.patch, draft.side, draft.startLine, draft.endLine),
          });
          setDraft(null);
          forgetEditor(DRAFT_EDITOR);
        }} />
      </div>;
    }
    return <div className={styles.commentStack}>
      {/* The model first, then the host, then the human's own words. */}
      {(metadata.findings ?? []).map(findingCard)}
      {(metadata.threads ?? []).map((thread) => <ReviewPrThreadCard key={thread.id} thread={thread} />)}
      {(metadata.comments ?? []).map(savedCard)}
    </div>;
  };

  const renderAnnotation = (annotation: { metadata?: ReviewViewAnnotation }) => {
    const index = annotation.metadata?.hunkIndex;
    return <>
      {index !== undefined && revision && <div className={styles.hunkActions}>
        {operations.map((operation) => <Button key={operation} size="sm" tone="ghost" disabled={busy}
          className={styles.hunkAction}
          aria-label={`${REVIEW_OPERATION_LABELS[operation].hunk} hunk ${index + 1} in ${file.path}`}
          onClick={() => onOperate({ operation, targetKind: "hunk", targets: [{ path: file.path, revision, hunkIndex: index, hunkText: hunks[index]?.text }], path: file.path, hunkNumber: index + 1 })}
        >{REVIEW_OPERATION_LABELS[operation].hunk}</Button>)}
      </div>}
      {renderCommentAnnotation(annotation)}
    </>;
  };

  const onLineSelected = (range: { start: number; end: number; side?: "additions" | "deletions" } | null) => {
    if (!range) return;
    const side = range.side ?? "additions";
    setDraft({ side, startLine: Math.min(range.start, range.end), endLine: Math.max(range.start, range.end) });
  };

  return <>
    {findingsOff.length > 0 && <div className={findingStyles.findingGroup} role="group" aria-label={`Findings not on a line of ${file.path}`}>
      <p className={findingStyles.findingPath}>
        {findingsOff.length === 1
          ? "One finding from the review is not on a line of this file. It is kept here rather than drawn on a line it might not be about."
          : `${findingsOff.length} findings from the review are not on lines of this file. They are kept here rather than drawn on lines they might not be about.`}
      </p>
      {findingsOff.map(findingCard)}
    </div>}
    {detached.length > 0 && <div className={styles.detachedComments} role="group" aria-label={`Detached comments on ${file.path}`}>
      <p className={styles.detachedNote}>
        {detached.length === 1
          ? "One comment was written against lines this revision does not show. It is kept here rather than moved to a line it might not be about."
          : `${detached.length} comments were written against lines this revision does not show. They are kept here rather than moved to lines they might not be about.`}
      </p>
      {detached.map(savedCard)}
    </div>}
    <ReviewDiffView displayPreferences={displayPreferences} key={`${context.tabId}:${JSON.stringify(scope)}:${revision}`} expansion={expansion}
      patch={file.patch} wrapLines={wrapLines} diffMode={diffMode} onOpenFile={onOpenFile}
      lineAnnotations={annotationsFor()} renderAnnotation={renderAnnotation} onLineSelected={onLineSelected} />
  </>;
}
