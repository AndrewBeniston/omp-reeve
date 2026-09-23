import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  captureScrollDistance,
  getNextVisibleCount,
  restoreScrollTop,
  shouldLoadHistory,
  VISIBLE_PAGE_SIZE,
} from "@/lib/chat-lazy-load";
import { applySessionHistoryResult, createSessionHistoryState, sessionHistoryRequest } from "@/lib/session-history-state";
import type { SessionHistoryFailure, SessionHistoryResult } from "@/lib/session-history";

export type HistoryLoadStatus = "idle" | "loading" | "exhausted" | "failed" | "cancelled";

export async function fetchSessionHistoryPage(
  sessionId: string,
  cursor: string | null,
  leafId: string | null,
  signal: AbortSignal,
): Promise<SessionHistoryResult> {
  const query = new URLSearchParams();
  if (cursor !== null) query.set("cursor", cursor);
  if (leafId !== null) query.set("leafId", leafId);
  const url = `/api/sessions/${encodeURIComponent(sessionId)}/history?${query}`;
  try {
    const response = await fetch(url, { signal });
    const result = await response.json() as SessionHistoryResult;
    if (result.ok === true || result.ok === false) return result;
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return {
    ok: false,
    sessionId,
    cursor,
    error: { code: "read_failed", message: "Could not read Session history", retryable: true },
  };
}

interface PendingPrepend {
  sessionKey: string | null;
  leafId: string | null;
  scrollHeight: number;
  distance: number;
}

export function useTranscriptHistory({
  containerRef,
  sessionKey,
  sessionId,
  leafId = null,
  pagedHiddenHistory = false,
  autoLoadOnMount = false,
  loadPage = fetchSessionHistoryPage,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  sessionKey: string | null;
  sessionId: string | null;
  leafId?: string | null;
  pagedHiddenHistory?: boolean;
  autoLoadOnMount?: boolean;
  loadPage?: typeof fetchSessionHistoryPage;
}) {
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE_SIZE);
  const [status, setStatus] = useState<HistoryLoadStatus>("idle");
  const [failure, setFailure] = useState<SessionHistoryFailure["error"] | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HistoryLoadStatus>("idle");
  const requestRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingPrepend | null>(null);
  const identityRef = useRef({ sessionKey, leafId });
  const previousIdentityRef = useRef({ sessionKey, leafId });
  const historyRef = useRef(createSessionHistoryState(sessionId ?? ""));
  identityRef.current = { sessionKey, leafId };

  const changeStatus = useCallback((next: HistoryLoadStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    const switched = previousIdentityRef.current.sessionKey !== sessionKey
      || previousIdentityRef.current.leafId !== leafId;
    previousIdentityRef.current = { sessionKey, leafId };
    requestRef.current?.abort();
    requestRef.current = null;
    pendingRef.current = null;
    historyRef.current = createSessionHistoryState(sessionId ?? "");
    setVisibleCount(VISIBLE_PAGE_SIZE);
    setFailure(null);
    changeStatus(switched ? "cancelled" : "idle");
    return () => {
      requestRef.current?.abort();
      pendingRef.current = null;
    };
  }, [changeStatus, leafId, sessionId, sessionKey]);

  const requestMoreHistory = useCallback((retry = false): boolean => {
    const container = containerRef.current;
    if (!container || !sentinelRef.current || requestRef.current || pendingRef.current) return false;
    if (statusRef.current === "loading" || statusRef.current === "exhausted") return false;
    if (statusRef.current === "failed" && !retry) return false;
    if (retry && !failure?.retryable) return false;
    if (sessionId && historyRef.current.sessionId !== sessionId) return false;

    const before: PendingPrepend = {
      sessionKey,
      leafId,
      scrollHeight: container.scrollHeight,
      distance: captureScrollDistance(container.scrollHeight, container.scrollTop),
    };
    changeStatus("loading");
    setFailure(null);

    // The Session payload already holds the render rows. A finished API cursor
    // stops network requests, while any remaining local rows can still appear.
    const request = pagedHiddenHistory && sessionId ? sessionHistoryRequest(historyRef.current) : null;
    if (!request) {
      pendingRef.current = before;
      setVisibleCount((count) => getNextVisibleCount(count));
      return true;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    void loadPage(request.sessionId, request.cursor, leafId, controller.signal).then((result) => {
      if (controller.signal.aborted || identityRef.current.sessionKey !== sessionKey
        || identityRef.current.leafId !== leafId) return;
      const previous = historyRef.current;
      const next = applySessionHistoryResult(previous, result);
      if (next === previous) {
        setFailure({ code: "read_failed", message: "Could not read Session history", retryable: true });
        changeStatus("failed");
        return;
      }
      historyRef.current = { ...next, entries: [] };
      if (next.failure) {
        setFailure(next.failure);
        changeStatus("failed");
        return;
      }
      pendingRef.current = before;
      setVisibleCount((count) => getNextVisibleCount(count));
    }).catch(() => {
      if (controller.signal.aborted || identityRef.current.sessionKey !== sessionKey
        || identityRef.current.leafId !== leafId) return;
      setFailure({ code: "read_failed", message: "Could not read Session history", retryable: true });
      changeStatus("failed");
    }).finally(() => {
      if (requestRef.current === controller) requestRef.current = null;
    });
    return true;
  }, [changeStatus, containerRef, failure?.retryable, leafId, loadPage, pagedHiddenHistory, sessionId, sessionKey]);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending || pending.sessionKey !== sessionKey || pending.leafId !== leafId) return;
    pendingRef.current = null;
    const container = containerRef.current;
    if (!container) {
      changeStatus("cancelled");
      return;
    }
    if (container.scrollHeight <= pending.scrollHeight) {
      changeStatus("exhausted");
      return;
    }
    container.scrollTop = restoreScrollTop(container.scrollHeight, pending.distance);
    changeStatus(!sentinelRef.current ? "exhausted" : "idle");
  }, [changeStatus, containerRef, leafId, sessionKey, visibleCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sentinelRef.current) return;
    const onScroll = () => {
      if (shouldLoadHistory({
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        pagedHiddenHistory,
      })) requestMoreHistory();
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && container.scrollTop <= 0) requestMoreHistory();
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    if ((autoLoadOnMount || visibleCount > VISIBLE_PAGE_SIZE) && statusRef.current === "idle") onScroll();
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onWheel);
    };
  }, [autoLoadOnMount, containerRef, pagedHiddenHistory, requestMoreHistory, visibleCount]);

  const retry = useCallback(() => requestMoreHistory(true), [requestMoreHistory]);
  const revealAll = useCallback((count: number) => {
    requestRef.current?.abort();
    requestRef.current = null;
    pendingRef.current = null;
    setFailure(null);
    changeStatus("exhausted");
    setVisibleCount(count);
  }, [changeStatus]);
  return { visibleCount, sentinelRef, status, failure, requestMoreHistory, retry, revealAll };
}
