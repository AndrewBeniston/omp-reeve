import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createTranscriptFollowState,
  distanceFromBottom,
  reduceTranscriptFollow,
  AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
  USER_SCROLL_INTENT_DURATION_MS,
  type FollowTurnPhase,
  type TranscriptFollowInput,
  type TranscriptFollowState,
} from "@/lib/transcript-follow";
import {
  captureScrollbarPointer,
  normalizeKeyIntent,
  normalizeScrollbarPointerDownIntent,
  normalizeScrollbarDragIntent,
  normalizeTouchIntent,
  normalizeWheelIntent,
  selectScrollIntent,
  type ScrollIntent,
  type ScrollbarPointer,
} from "./transcript-follow-input";
import { prefersReducedMotion, shouldMoveFollowTail } from "./transcript-follow";
import { readTranscriptOffset, writeTranscriptOffset } from "@/lib/transcript-scroll-offset";

const BUTTON_SCROLL_DURATION_MS = 260;
const SCROLL_SETTLE_MS = 160;

function metrics(container: HTMLElement) {
  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  };
}

export function useTranscriptFollow({
  scrollContainerRef,
  contentRef,
  phase,
  working,
  activeTurnHeld,
  contentChange,
  messageCount,
  sessionKey,
  sessionId,
  layoutReady = true,
  origin = "bottom",
  footerRef,
  compactPresentation = false,
  preserveFooterPosition = true,
  historyVersion = 0,
  onNeedHistory,
  onGoToNewest,
}: {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  phase: FollowTurnPhase;
  working: boolean;
  activeTurnHeld: boolean;
  contentChange: unknown;
  messageCount: number;
  sessionKey: string | null;
  sessionId?: string | null;
  layoutReady?: boolean;
  origin?: "bottom" | "top";
  footerRef?: RefObject<HTMLDivElement | null>;
  compactPresentation?: boolean;
  preserveFooterPosition?: boolean;
  historyVersion?: number;
  onNeedHistory?: () => boolean;
  onGoToNewest: () => void;
}) {
  const stateRef = useRef<TranscriptFollowState>(createTranscriptFollowState({
    scrollTop: 0, scrollHeight: 0, clientHeight: 0,
  }));
  const [mode, setMode] = useState(stateRef.current.mode);
  const [button, setButton] = useState({ visible: false, workingDots: false });
  const intentRef = useRef<ScrollIntent | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ id: number; geometry: ScrollbarPointer } | null>(null);
  const programmaticScrollAtRef = useRef(-Infinity);
  const scrollAnimationRef = useRef<number | null>(null);
  const preworkStartHeightRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);
  const skipInitialContentRef = useRef(false);
  const pendingRestoreFrameRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const [initialReady, setInitialReady] = useState(false);
  const phaseRef = useRef(phase);
  const workingRef = useRef(working);
  const heldRef = useRef(activeTurnHeld);
  phaseRef.current = phase;
  workingRef.current = working;
  heldRef.current = activeTurnHeld;
  sessionIdRef.current = sessionId;

  const cancelPendingRestore = useCallback(() => {
    if (pendingRestoreFrameRef.current === null) return;
    cancelAnimationFrame(pendingRestoreFrameRef.current);
    pendingRestoreFrameRef.current = null;
  }, []);

  const cancelPendingSave = useCallback(() => {
    if (pendingSaveRef.current === null) return;
    clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = null;
  }, []);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationRef.current === null) return;
    cancelAnimationFrame(scrollAnimationRef.current);
    scrollAnimationRef.current = null;
  }, []);

  const scrollToEnd = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    cancelScrollAnimation();
    programmaticScrollAtRef.current = Date.now();
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "instant",
    });
  }, [cancelScrollAnimation, scrollContainerRef]);

  const observe = useCallback((event: TranscriptFollowInput["event"], now = Date.now()) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const currentPhase = phaseRef.current;
    const contentHeight = contentRef.current?.getBoundingClientRect().height ?? 0;
    if (currentPhase === "prework" && stateRef.current.phase !== "prework") {
      preworkStartHeightRef.current = contentHeight;
    } else if (currentPhase !== "prework") {
      preworkStartHeightRef.current = null;
    }
    const spacer = container.querySelector<HTMLElement>("[data-response-spacer]");
    const spacerHeight = spacer?.getBoundingClientRect().height ?? 0;
    const userIntent = selectScrollIntent(intentRef.current, programmaticScrollAtRef.current, now) ?? undefined;
    const result = reduceTranscriptFollow(stateRef.current, {
      turn: { phase: currentPhase },
      metrics: metrics(container),
      preworkContentHeight: Math.max(0, contentHeight - (preworkStartHeightRef.current ?? contentHeight)),
      spacerHeight,
      working: workingRef.current,
      now,
      event,
      userIntent,
    });
    const previousMode = stateRef.current.mode;
    stateRef.current = result.state;
    if (previousMode !== result.state.mode) setMode(result.state.mode);
    setButton((current) => current.visible === result.button.visible
      && current.workingDots === result.button.workingDots ? current : result.button);
    if (shouldMoveFollowTail(result.scrollToEndInstantly, heldRef.current)) scrollToEnd();
  }, [contentRef, scrollContainerRef, scrollToEnd]);

  const goToNewest = useCallback(() => {
    onGoToNewest();
    observe("button");
    const container = scrollContainerRef.current;
    if (!container) return;
    cancelScrollAnimation();
    const distance = distanceFromBottom(metrics(container));
    if (prefersReducedMotion() || distance <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX) {
      scrollToEnd();
      return;
    }
    const startTop = container.scrollTop;
    let startedAt: number | null = null;
    const move = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / BUTTON_SCROLL_DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const endTop = Math.max(0, container.scrollHeight - container.clientHeight);
      programmaticScrollAtRef.current = Date.now();
      container.scrollTo({ top: startTop + (endTop - startTop) * eased, behavior: "instant" });
      if (distanceFromBottom(metrics(container)) <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX || progress === 1) {
        scrollAnimationRef.current = null;
        return;
      }
      scrollAnimationRef.current = requestAnimationFrame(move);
    };
    scrollAnimationRef.current = requestAnimationFrame(move);
  }, [cancelScrollAnimation, observe, onGoToNewest, scrollContainerRef, scrollToEnd]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    cancelScrollAnimation();
    cancelPendingRestore();
    cancelPendingSave();
    stateRef.current = createTranscriptFollowState(container ? metrics(container) : {
      scrollTop: 0, scrollHeight: 0, clientHeight: 0,
    });
    setMode(stateRef.current.mode);
    setButton({ visible: false, workingDots: false });
    intentRef.current = null;
    touchRef.current = null;
    pointerRef.current = null;
    preworkStartHeightRef.current = null;
    initialScrollDoneRef.current = false;
    skipInitialContentRef.current = false;
    setInitialReady(false);
    return () => {
      cancelPendingRestore();
      cancelPendingSave();
    };
  }, [cancelPendingRestore, cancelPendingSave, cancelScrollAnimation, scrollContainerRef, sessionKey]);

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const footer = footerRef?.current;
    if (!container || !footer) return;
    let previousHeight: number | null = null;
    let focusFrame: number | null = null;
    let focused = footer.contains(document.activeElement);
    const publishPadding = (height: number) => {
      const padding = focused ? 0 : height + (compactPresentation ? 0 : 16);
      container.style.setProperty("--transcript-scroll-padding-bottom", `${padding}px`);
    };
    const readHeight = () => Math.max(0, footer.getBoundingClientRect().height);
    const onResize = () => {
      const height = readHeight();
      const delta = previousHeight === null ? 0 : height - previousHeight;
      previousHeight = height;
      publishPadding(height);
      if (delta === 0 || !preserveFooterPosition || !initialScrollDoneRef.current) return;
      const distanceBeforeResize = distanceFromBottom(metrics(container)) - delta;
      const intent = intentRef.current;
      const now = Date.now();
      const userInterrupted = intent !== null && now >= intent.at
        && now - intent.at <= USER_SCROLL_INTENT_DURATION_MS;
      if (distanceBeforeResize <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX || userInterrupted) return;
      programmaticScrollAtRef.current = now;
      container.scrollTo({ top: container.scrollTop + delta, behavior: "instant" });
    };
    const onFocusIn = () => {
      focused = true;
      publishPadding(previousHeight ?? readHeight());
    };
    const onFocusOut = () => {
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null;
        focused = footer.contains(document.activeElement);
        publishPadding(previousHeight ?? readHeight());
      });
    };
    onResize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    observer?.observe(footer);
    footer.addEventListener("focusin", onFocusIn);
    footer.addEventListener("focusout", onFocusOut);
    return () => {
      observer?.disconnect();
      footer.removeEventListener("focusin", onFocusIn);
      footer.removeEventListener("focusout", onFocusOut);
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    };
  }, [compactPresentation, footerRef, layoutReady, preserveFooterPosition, scrollContainerRef, sessionKey]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const record = (intent: ScrollIntent | null) => {
      if (!intent) return;
      intentRef.current = intent;
      if (!initialScrollDoneRef.current) {
        cancelPendingRestore();
        initialScrollDoneRef.current = true;
        setInitialReady(true);
        stateRef.current = createTranscriptFollowState(metrics(container));
        setMode(stateRef.current.mode);
      }
    };
    const onWheel = (event: WheelEvent) => {
      record(normalizeWheelIntent({
        deltaY: event.deltaY, deltaMode: event.deltaMode,
        viewportHeight: container.clientHeight, at: Date.now(),
      }));
    };
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      touchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      const start = touchRef.current;
      if (!touch || !start) return;
      const intent = normalizeTouchIntent({
        startX: start.x, startY: start.y, x: touch.clientX, y: touch.clientY, at: Date.now(),
      });
      record(intent);
      if (intent) touchRef.current = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = () => { touchRef.current = null; };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editableTarget = target instanceof Element
        && Boolean(target.closest("input, select, textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']"));
      const buttonTarget = target instanceof Element && Boolean(target.closest("button"));
      record(normalizeKeyIntent({
        key: event.key, shiftKey: event.shiftKey, repeat: event.repeat,
        defaultPrevented: event.defaultPrevented, editableTarget, buttonTarget, at: Date.now(),
      }));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.target !== container) return;
      const rect = container.getBoundingClientRect();
      const geometry = captureScrollbarPointer({
        x: event.clientX, y: event.clientY, rect,
        clientWidth: container.clientWidth,
        scrollTop: container.scrollTop, scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
      pointerRef.current = geometry ? { id: event.pointerId, geometry } : null;
      if (geometry) record(normalizeScrollbarPointerDownIntent(geometry, Date.now()));
    };
    const onPointerMove = (event: PointerEvent) => {
      const pointer = pointerRef.current;
      if (!pointer || event.pointerId !== pointer.id) return;
      record(normalizeScrollbarDragIntent(pointer.geometry, { y: event.clientY, at: Date.now() }));
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId === pointerRef.current?.id) pointerRef.current = null;
    };
    const onScroll = () => {
      const pointer = pointerRef.current;
      if (pointer && container.scrollTop !== stateRef.current.previousScrollTop) {
        record({ direction: container.scrollTop < stateRef.current.previousScrollTop ? "away" : "toward", at: Date.now() });
      }
      observe("scroll");
      if (initialScrollDoneRef.current && sessionId) {
        cancelPendingSave();
        pendingSaveRef.current = setTimeout(() => {
          pendingSaveRef.current = null;
          if (sessionIdRef.current !== sessionId) return;
          writeTranscriptOffset(window.localStorage, sessionId, Math.max(0, distanceFromBottom(metrics(container))));
        }, SCROLL_SETTLE_MS);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("scroll", onScroll);
    };
  }, [cancelPendingRestore, cancelPendingSave, messageCount, observe, scrollContainerRef, sessionId, sessionKey]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !layoutReady || messageCount === 0 || initialScrollDoneRef.current) return;
    const savedDistance = readTranscriptOffset(window.localStorage, sessionId ?? null);
    let previous = metrics(container);
    let stableFrames = 0;
    const probe = () => {
      pendingRestoreFrameRef.current = null;
      if (initialScrollDoneRef.current || sessionIdRef.current !== sessionId) return;
      const current = metrics(container);
      stableFrames = current.scrollHeight === previous.scrollHeight
        && current.clientHeight === previous.clientHeight ? stableFrames + 1 : 0;
      previous = current;
      if (current.clientHeight <= 0 || stableFrames < 2) {
        pendingRestoreFrameRef.current = requestAnimationFrame(probe);
        return;
      }
      if (origin === "bottom" && savedDistance !== null
        && savedDistance > AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
        && current.scrollHeight - current.clientHeight < savedDistance
        && onNeedHistory?.()) {
        return;
      }
      const maxTop = Math.max(0, current.scrollHeight - current.clientHeight);
      const top = origin === "top" ? 0
        : savedDistance !== null && savedDistance > AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
          ? Math.max(0, maxTop - savedDistance) : maxTop;
      programmaticScrollAtRef.current = Date.now();
      container.scrollTo({ top, behavior: "instant" });
      initialScrollDoneRef.current = true;
      skipInitialContentRef.current = origin === "top";
      setInitialReady(true);
      stateRef.current = createTranscriptFollowState(metrics(container));
      setMode(stateRef.current.mode);
      observe("phase");
    };
    pendingRestoreFrameRef.current = requestAnimationFrame(probe);
    return cancelPendingRestore;
  }, [cancelPendingRestore, historyVersion, layoutReady, messageCount, observe, onNeedHistory, origin, scrollContainerRef, sessionId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messageCount === 0) return;
    if (!initialScrollDoneRef.current) return;
    if (skipInitialContentRef.current) {
      skipInitialContentRef.current = false;
      return;
    }
    observe("content");
  }, [activeTurnHeld, contentChange, initialReady, messageCount, observe, phase, working]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (initialScrollDoneRef.current) observe("content");
    });
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef, messageCount, observe, scrollContainerRef]);

  return { mode, button, goToNewest };
}
