"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { FollowMode, FollowTurnPhase } from "@/lib/transcript-follow";
import {
  ACTIVE_TURN_BOTTOM_DISTANCE_PX,
  ACTIVE_TURN_SPACER_DURATION_MS,
  consumeActiveTurnSpacerHeight,
  getActiveTurnResponseSpacerHeight,
  prefersReducedMotion,
  shouldPlaceLatestTurnAtEnd,
} from "./transcript-follow";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import styles from "./chat-window.module.css";

interface ActiveTurnResponseSpacerProps {
  active: boolean;
  phase: FollowTurnPhase;
  followMode: FollowMode;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onConsumed: () => void;
}

function usableHeight(container: HTMLElement): number {
  const padding = Number.parseFloat(window.getComputedStyle?.(container).scrollPaddingBottom ?? "0") || 0;
  return Math.max(0, container.clientHeight - padding);
}

export function ActiveTurnResponseSpacer({
  active,
  phase,
  followMode,
  scrollContainerRef,
  onConsumed,
}: ActiveTurnResponseSpacerProps) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const heightRef = useRef(0);
  const goalHeightRef = useRef(0);
  const targetHeightRef = useRef(0);
  const consumedHeightRef = useRef(0);
  const springFrameRef = useRef<number | null>(null);
  const placementScrollTopRef = useRef<number | null>(null);
  const openingRef = useRef(false);
  const openingFollowRef = useRef(false);
  const armedRef = useRef(false);
  const wasActiveRef = useRef(false);
  const wasPhaseRef = useRef(phase);
  const resetPendingRef = useRef(false);
  const onConsumedRef = useRef(onConsumed);
  onConsumedRef.current = onConsumed;

  const stopSpring = useCallback(() => {
    if (springFrameRef.current === null) return;
    cancelAnimationFrame(springFrameRef.current);
    springFrameRef.current = null;
  }, []);

  const animateHeightTo = useCallback((target: number) => {
    stopSpring();
    goalHeightRef.current = target;
    if (prefersReducedMotion()) {
      heightRef.current = target;
      setHeight(target);
      return;
    }
    const start = heightRef.current;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / ACTIVE_TURN_SPACER_DURATION_MS);
      const springTime = progress * 7.5;
      const springProgress = 1 - (1 + springTime) * Math.exp(-springTime);
      const nextHeight = progress === 1 ? target : start + (target - start) * springProgress;
      heightRef.current = nextHeight;
      setHeight(nextHeight);
      springFrameRef.current = progress === 1 ? null : requestAnimationFrame(tick);
    };
    springFrameRef.current = requestAnimationFrame(tick);
  }, [stopSpring]);

  useLayoutEffect(() => stopSpring, [stopSpring]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let frame: number | null = null;

    const updateHeight = () => {
      if (!armedRef.current) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const targetHeight = getActiveTurnResponseSpacerHeight(usableHeight(container));
        const nextHeight = Math.max(0, targetHeight - consumedHeightRef.current);
        if (Math.abs(nextHeight - goalHeightRef.current) <= 24) return;
        targetHeightRef.current = targetHeight;
        animateHeightTo(nextHeight);
      });
    };

    if (active && !wasActiveRef.current) {
      stopSpring();
      armedRef.current = true;
      targetHeightRef.current = getActiveTurnResponseSpacerHeight(usableHeight(container));
      consumedHeightRef.current = 0;
      heightRef.current = 0;
      goalHeightRef.current = 0;
      placementScrollTopRef.current = null;
      openingRef.current = true;
      openingFollowRef.current = false;
      setHeight(0);
    }
    wasActiveRef.current = active;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateHeight);
    observer?.observe(container);
    window.addEventListener("resize", updateHeight, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [active, animateHeightTo, scrollContainerRef, stopSpring]);

  useLayoutEffect(() => {
    const fromPreworkFollow = wasPhaseRef.current === "prework"
      && phase === "final-answer" && followMode === "prework_follow";
    wasPhaseRef.current = phase;
    if (!fromPreworkFollow || !armedRef.current) return;
    stopSpring();
    armedRef.current = false;
    openingRef.current = false;
    openingFollowRef.current = false;
    heightRef.current = 0;
    goalHeightRef.current = 0;
    targetHeightRef.current = 0;
    consumedHeightRef.current = 0;
    resetPendingRef.current = true;
    setHeight(0);
  }, [phase, followMode, stopSpring]);

  useLayoutEffect(() => {
    if (!resetPendingRef.current || height !== 0) return;
    resetPendingRef.current = false;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    onConsumedRef.current();
  }, [height, scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const spacer = spacerRef.current;
    if (!container || !spacer || !armedRef.current) return;
    if (openingRef.current && height === 0) {
      openingRef.current = false;
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (shouldPlaceLatestTurnAtEnd(distance, height)) {
        container.scrollTop = Math.max(
          0,
          container.scrollHeight - container.clientHeight - ACTIVE_TURN_BOTTOM_DISTANCE_PX,
        );
        placementScrollTopRef.current = container.scrollTop;
        openingFollowRef.current = true;
      }
      animateHeightTo(targetHeightRef.current);
      return;
    }
    if (!openingFollowRef.current || placementScrollTopRef.current === null) return;
    container.scrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight - ACTIVE_TURN_BOTTOM_DISTANCE_PX,
    );
    placementScrollTopRef.current = container.scrollTop;
    if (springFrameRef.current === null) openingFollowRef.current = false;
  }, [active, animateHeightTo, height, scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const consumeSpacer = () => {
      const placementScrollTop = placementScrollTopRef.current;
      if (!armedRef.current || placementScrollTop === null || goalHeightRef.current <= 0) return;
      if (container.scrollTop < placementScrollTop - ACTIVE_TURN_BOTTOM_DISTANCE_PX) {
        openingFollowRef.current = false;
      }
      const nextHeight = consumeActiveTurnSpacerHeight({
        currentHeight: goalHeightRef.current,
        targetHeight: targetHeightRef.current,
        placementScrollTop,
        currentScrollTop: container.scrollTop,
      });
      if (nextHeight >= goalHeightRef.current || goalHeightRef.current - nextHeight <= 24) return;
      consumedHeightRef.current = Math.max(consumedHeightRef.current, targetHeightRef.current - nextHeight);
      animateHeightTo(nextHeight);
      if (nextHeight === 0) {
        armedRef.current = false;
        onConsumedRef.current();
      }
    };
    container.addEventListener("scroll", consumeSpacer, { passive: true });
    return () => container.removeEventListener("scroll", consumeSpacer);
  }, [animateHeightTo, scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const spacer = spacerRef.current;
    if (!container || !spacer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.at(-1);
      if (!entry || !armedRef.current || placementScrollTopRef.current === null
        || heightRef.current <= 0 || entry.boundingClientRect.height <= 1) return;
      if (entry.intersectionRect.height > 1) return;
      stopSpring();
      armedRef.current = false;
      heightRef.current = 0;
      goalHeightRef.current = 0;
      consumedHeightRef.current = targetHeightRef.current;
      setHeight(0);
      onConsumedRef.current();
    }, { root: container, threshold: [0, 0.01, 1] });
    observer.observe(spacer);
    return () => observer.disconnect();
  }, [scrollContainerRef, stopSpring]);

  return (
    <DynamicStyleVars
      aria-hidden="true"
      data-response-spacer
      className={styles.responseSpacer}
      data-consuming={height < targetHeightRef.current ? "true" : "false"}
      elementRef={spacerRef}
      variables={{ "--ui-response-spacer-height": `${height}px` }}
    />
  );
}
