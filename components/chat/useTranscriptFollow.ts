import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createTranscriptFollowState,
  distanceFromBottom,
  reduceTranscriptFollow,
  AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
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

const BUTTON_SCROLL_DURATION_MS = 260;

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
  const phaseRef = useRef(phase);
  const workingRef = useRef(working);
  const heldRef = useRef(activeTurnHeld);
  phaseRef.current = phase;
  workingRef.current = working;
  heldRef.current = activeTurnHeld;

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
  }, [cancelScrollAnimation, scrollContainerRef, sessionKey]);

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const record = (intent: ScrollIntent | null) => {
      if (intent) intentRef.current = intent;
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
  }, [messageCount, observe, scrollContainerRef, sessionKey]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messageCount === 0) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      scrollToEnd();
      stateRef.current = createTranscriptFollowState({
        scrollTop: Math.max(0, container.scrollHeight - container.clientHeight),
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
      setMode(stateRef.current.mode);
    }
    observe("content");
  }, [activeTurnHeld, contentChange, messageCount, observe, phase, scrollToEnd, working]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => observe("content"));
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [contentRef, messageCount, observe, scrollContainerRef]);

  return { mode, button, goToNewest };
}
