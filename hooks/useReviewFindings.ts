"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reviewOwnerSearchParams } from "@/lib/review-owner";
import type { ReviewRequestContext } from "@/lib/review-owner";
import {
  placeReviewFindings,
  type PlacedReviewFinding,
  type ReviewModelFinding,
  type ReviewedFileSnapshot,
} from "@/lib/review-findings";
import {
  dismissReviewFinding,
  isReviewFindingDismissed,
  mutateReviewFindingViews,
  readReviewFindingViews,
  restoreReviewFinding,
  type ReviewFindingView,
} from "@/lib/review-finding-store";

/**
 * The findings of the owning Session's latest review, placed against this diff.
 *
 * The answer comes from the server, which reads only the Session this Review
 * Tab belongs to. Which findings the human has put away is this machine's own
 * business and stays in local storage beside the comments, under the same owner
 * key, so one Session never reads what another put away.
 *
 * Placement happens here, once, so the diff and anything handed to the composer
 * cannot come to disagree about where a finding belongs.
 */
export interface ReviewFindingsState {
  /** Every finding of the latest review, in the order the model wrote them. */
  placed: PlacedReviewFinding[];
  /** What the diff should draw: the dismissed ones only when they are asked for. */
  visible: PlacedReviewFinding[];
  /** Findings on no line at all, which no diff row can carry. */
  unplaced: PlacedReviewFinding[];
  dismissedCount: number;
  showDismissed: boolean;
  setShowDismissed: (show: boolean) => void;
  isDismissed: (id: string) => boolean;
  dismiss: (id: string) => void;
  restore: (id: string) => void;
  /** Why there is nothing to show, when that is worth saying out loud. */
  unavailable: string | null;
}

interface FindingsResponse {
  kind: "findings" | "none" | "unavailable";
  findings?: ReviewModelFinding[];
  reviewed?: Record<string, ReviewedFileSnapshot>;
  reason?: string;
}

export function useReviewFindings({ context, ownerKey, files, refresh, enabled = true }: {
  context: ReviewRequestContext;
  /** The owner key the panel already built. Never derived a second time here. */
  ownerKey: string;
  /** The files this review is drawing, by repository-relative path. */
  files: ReadonlyMap<string, { patch: string; revision?: string }>;
  /** Bumped by the panel whenever the review reloads. */
  refresh?: unknown;
  enabled?: boolean;
}): ReviewFindingsState {
  const [answer, setAnswer] = useState<{ owner: string; findings: ReviewModelFinding[]; reviewed: Record<string, ReviewedFileSnapshot>; unavailable: string | null }>(
    { owner: ownerKey, findings: [], reviewed: {}, unavailable: null },
  );
  const [views, setViews] = useState<ReviewFindingView[]>(() => readReviewFindingViews(ownerKey));
  const [showDismissed, setShowDismissed] = useState(false);

  // The owner this hook is working for now, read by the writes below so a
  // dismissal started beside one Session cannot land in another.
  const currentOwner = useRef(ownerKey);
  currentOwner.current = ownerKey;

  useEffect(() => {
    setViews(readReviewFindingViews(ownerKey));
    setShowDismissed(false);
  }, [ownerKey]);

  useEffect(() => {
    if (!enabled) {
      setAnswer({ owner: ownerKey, findings: [], reviewed: {}, unavailable: null });
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/git/review/findings?${reviewOwnerSearchParams(context)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as FindingsResponse;
      })
      .then((value) => {
        if (controller.signal.aborted || !value) return;
        setAnswer({
          owner: ownerKey,
          findings: value.kind === "findings" ? value.findings ?? [] : [],
          reviewed: value.kind === "findings" ? value.reviewed ?? {} : {},
          unavailable: value.kind === "unavailable" ? UNAVAILABLE[value.reason ?? ""] ?? null : null,
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [context, enabled, ownerKey, refresh]);

  const placed = useMemo(() => {
    // A late answer for the Session that was open a moment ago is not this
    // one's, so it draws nothing here.
    if (answer.owner !== ownerKey) return [];
    return placeReviewFindings(answer.findings, new Map(Object.entries(answer.reviewed)), files);
  }, [answer, files, ownerKey]);
  const isDismissed = useCallback((id: string) => isReviewFindingDismissed(views, id), [views]);

  const change = useCallback((apply: (current: ReviewFindingView[]) => ReviewFindingView[]) => {
    const next = mutateReviewFindingViews(ownerKey, currentOwner.current, apply);
    if (next) setViews(next);
  }, [ownerKey]);

  const dismiss = useCallback((id: string) => {
    change((current) => dismissReviewFinding(current, id, new Date().toISOString()));
  }, [change]);
  const restore = useCallback((id: string) => {
    change((current) => restoreReviewFinding(current, id));
  }, [change]);

  const visible = useMemo(
    () => showDismissed ? placed : placed.filter((entry) => !isDismissed(entry.finding.id)),
    [isDismissed, placed, showDismissed],
  );
  const unplaced = useMemo(() => visible.filter((entry) => entry.placement.state !== "anchored" && entry.placement.state !== "moved"), [visible]);
  const dismissedCount = useMemo(() => placed.filter((entry) => isDismissed(entry.finding.id)).length, [isDismissed, placed]);

  return {
    placed,
    visible,
    unplaced,
    dismissedCount,
    showDismissed,
    setShowDismissed,
    isDismissed,
    dismiss,
    restore,
    unavailable: answer.owner === ownerKey ? answer.unavailable : null,
  };
}

/** What a refusal says out loud, which never describes anyone else's work. */
const UNAVAILABLE: Record<string, string> = {
  "session-mismatch": "This Review is not beside the Session that owns it, so its findings are not read here.",
  "no-record": "Reeve could not read this Session, so it has no findings to show.",
};
