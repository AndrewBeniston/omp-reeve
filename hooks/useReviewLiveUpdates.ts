"use client";

import { useEffect, useRef, useState } from "react";
import { REVIEW_WATCH_UNAVAILABLE, REVIEW_WATCH_WARNING, type ReviewWatchEvent } from "@/lib/review-watch-types";
import { reviewOwnerSearchParams, type ReviewRequestContext } from "@/lib/review-owner";

export interface ReviewInvalidation {
  cwd: string;
  reason: "change" | "connected";
}
export interface ReviewLiveUpdateOptions {
  /** The Tab being watched, and the Worktree its owner names. */
  context: ReviewRequestContext;
  active: boolean;
  /** Refresh in the background; keep existing file components and local drafts mounted. */
  onInvalidate: (event: ReviewInvalidation) => void | Promise<void>;
}
/**
 * `limited` is partial coverage: part of the Worktree reports changes and part
 * of it does not. `unavailable` is a stream that never carried an event at
 * all, which is a different sentence to say to the reader.
 */
export type ReviewWatchStatus = "inactive" | "connecting" | "watching" | "limited" | "unavailable";

const WATCH_MESSAGES: Partial<Record<ReviewWatchStatus, string>> = {
  limited: REVIEW_WATCH_WARNING,
  unavailable: REVIEW_WATCH_UNAVAILABLE,
};

export function useReviewLiveUpdates({ context, active, onInvalidate }: ReviewLiveUpdateOptions) {
  const cwd = context.owner.worktreePath;
  const callback = useRef(onInvalidate);
  callback.current = onInvalidate;
  const owner = useRef({ cwd, active });
  owner.current = { cwd, active };
  const [state, setState] = useState<{ cwd: string; status: ReviewWatchStatus }>({ cwd, status: "inactive" });

  useEffect(() => {
    if (!active || !cwd) return;
    let disposed = false;
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let established = false;
    let pending: ReviewInvalidation["reason"] | undefined;
    const current = () => !disposed && owner.current.cwd === cwd && owner.current.active && document.visibilityState === "visible";
    const status = (value: ReviewWatchStatus) => {
      if (!disposed) setState({ cwd, status: value });
    };
    const schedule = (reason: ReviewInvalidation["reason"]) => {
      pending = reason;
      if (timer || running || !current()) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!current() || !pending) return;
        const reason = pending;
        pending = undefined;
        running = true;
        void Promise.resolve().then(() => current() ? callback.current({ cwd, reason }) : undefined)
          .catch(() => { if (current()) status("limited"); })
          .finally(() => { running = false; if (pending && current()) schedule(pending); });
      }, 200);
    };
    const disconnect = () => {
      source?.close(); source = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined; pending = undefined;
    };
    const connect = () => {
      disconnect();
      if (!current()) { status("inactive"); return; }
      status("connecting");
      const opened = new EventSource(`/api/git/review/events?${reviewOwnerSearchParams(context)}`);
      source = opened;
      opened.onmessage = (message) => {
        if (!current() || source !== opened) return;
        try {
          const event = JSON.parse(message.data) as ReviewWatchEvent;
          if (event.type !== "ready" && event.type !== "change" && event.type !== "status") return;
          established = true;
          status(event.limited ? "limited" : "watching");
          // A status event reports coverage and nothing else: reading the diff
          // again on it would refresh the panel for no change on disk.
          if (event.type !== "status") schedule(event.type === "ready" ? "connected" : "change");
        } catch { status("limited"); }
      };
      opened.onerror = () => { if (current() && source === opened) status(established ? "limited" : "unavailable"); };
    };
    document.addEventListener("visibilitychange", connect);
    connect();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", connect);
      disconnect();
    };
  }, [context, cwd, active]);

  const status = active && state.cwd === cwd ? state.status : "inactive";
  return { status, warning: WATCH_MESSAGES[status] ?? null };
}

/**
 * When the owning Session starts or finishes a prompt.
 *
 * A recorded turn settles in the agent's own store rather than in the
 * Worktree, so no file watcher here sees it arrive. The server already streams
 * which Sessions are running, and a change in this one's membership is the
 * signal that its last turn is worth reading again. The first frame is a
 * catch-up: a turn may have been recorded while the Tab was showing something
 * else.
 */
export function useReviewTurnActivity({ sessionId, active, onActivity }: {
  sessionId: string | null;
  active: boolean;
  /**
   * Called on the first frame and on every change, with whether it runs now,
   * and with `null` when the stream drops and nobody can say.
   */
  onActivity: (running: boolean | null) => void;
}) {
  const callback = useRef(onActivity);
  callback.current = onActivity;

  useEffect(() => {
    if (!active || !sessionId) return;
    let running: boolean | undefined;
    const source = new EventSource("/api/agent/running/events");
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type?: string; runningSessionIds?: unknown };
        if (event.type !== "running" || !Array.isArray(event.runningSessionIds)) return;
        const now = event.runningSessionIds.includes(sessionId);
        const first = running === undefined;
        const changed = running !== now;
        running = now;
        if (first || changed) callback.current(now);
      } catch { /* A frame this client cannot read is not a run that changed. */ }
    };
    /*
     * A dropped stream is not an idle Session. Say so, so a caller waiting for
     * quiet waits rather than treating silence as permission.
     */
    source.onerror = () => {
      running = undefined;
      callback.current(null);
    };
    return () => source.close();
  }, [active, sessionId]);
}
