"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  ACTIVE_TURN_BOTTOM_DISTANCE_PX,
  consumeActiveTurnSpacerHeight,
  getActiveTurnResponseSpacerHeight,
} from "./transcript-follow";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import styles from "./chat-window.module.css";

interface ActiveTurnResponseSpacerProps {
  active: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onConsumed: () => void;
}

export function ActiveTurnResponseSpacer({
  active,
  scrollContainerRef,
  onConsumed,
}: ActiveTurnResponseSpacerProps) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const heightRef = useRef(0);
  const targetHeightRef = useRef(0);
  const placementScrollTopRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const wasActiveRef = useRef(false);
  const onConsumedRef = useRef(onConsumed);
  onConsumedRef.current = onConsumed;

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let frame: number | null = null;

    const updateHeight = () => {
      if (!armedRef.current) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const targetHeight = getActiveTurnResponseSpacerHeight(container.clientHeight);
        const consumedHeight = Math.max(0, targetHeightRef.current - heightRef.current);
        targetHeightRef.current = targetHeight;
        const nextHeight = Math.max(0, targetHeight - consumedHeight);
        heightRef.current = nextHeight;
        setHeight(nextHeight);
      });
    };

    if (active && !wasActiveRef.current) {
      armedRef.current = true;
      targetHeightRef.current = getActiveTurnResponseSpacerHeight(container.clientHeight);
      heightRef.current = targetHeightRef.current;
      placementScrollTopRef.current = null;
      setHeight(targetHeightRef.current);
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
  }, [active, scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const spacer = spacerRef.current;
    if (!container || !spacer || height <= 0 || placementScrollTopRef.current !== null) return;
    container.scrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight - ACTIVE_TURN_BOTTOM_DISTANCE_PX,
    );
    placementScrollTopRef.current = container.scrollTop;
  }, [height, scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const consumeSpacer = () => {
      const placementScrollTop = placementScrollTopRef.current;
      if (!armedRef.current || placementScrollTop === null || heightRef.current <= 0) return;
      const nextHeight = consumeActiveTurnSpacerHeight({
        currentHeight: heightRef.current,
        targetHeight: targetHeightRef.current,
        placementScrollTop,
        currentScrollTop: container.scrollTop,
      });
      if (nextHeight >= heightRef.current) return;
      heightRef.current = nextHeight;
      setHeight(nextHeight);
      if (nextHeight === 0) {
        armedRef.current = false;
        onConsumedRef.current();
      }
    };
    container.addEventListener("scroll", consumeSpacer, { passive: true });
    return () => container.removeEventListener("scroll", consumeSpacer);
  }, [scrollContainerRef]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const spacer = spacerRef.current;
    if (!container || !spacer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.at(-1);
      if (!entry || !armedRef.current || placementScrollTopRef.current === null
        || heightRef.current <= 0 || entry.boundingClientRect.height <= 1) return;
      if (entry.intersectionRect.height > 1) return;
      armedRef.current = false;
      heightRef.current = 0;
      setHeight(0);
      onConsumedRef.current();
    }, { root: container, threshold: [0, 0.01, 1] });
    observer.observe(spacer);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

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
