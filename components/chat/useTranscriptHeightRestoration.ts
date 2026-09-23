import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  captureHeightRestoration,
  resolveHeightRestoration,
  type HeightRestorationRecord,
  type TranscriptHeightMetrics,
} from "@/lib/transcript-height-restoration";

const RESIZABLE_ITEM = "[data-message-role], [data-transcript-resizable-item]";

function readMetrics(container: HTMLElement): TranscriptHeightMetrics {
  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
  };
}

function readHeight(element: HTMLElement): number {
  return element.getBoundingClientRect?.().height ?? element.offsetHeight;
}

export function useTranscriptHeightRestoration(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  sessionKey: string | null,
  active: boolean,
) {
  const syncRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!active || !container || !content) return;

    const heights = new Map<HTMLElement, number>();
    let baseline = readMetrics(container);
    let pending: HeightRestorationRecord<HTMLElement> | null = null;
    let frame: number | null = null;

    const clearPending = () => {
      pending = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const queueRestoration = (element: HTMLElement, oldHeight: number, newHeight: number) => {
      heights.set(element, newHeight);
      if (oldHeight === newHeight || pending) return;
      pending = captureHeightRestoration(element, oldHeight, baseline);
      frame = requestAnimationFrame(() => {
        frame = null;
        const record = pending;
        pending = null;
        if (record && heights.has(record.element)) {
          const metrics = readMetrics(container);
          const target = resolveHeightRestoration(record, record.element, readHeight(record.element), metrics);
          if (target !== null) container.scrollTop = target;
        }
        baseline = readMetrics(container);
      });
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const oldHeight = heights.get(element);
        if (oldHeight === undefined) continue;
        queueRestoration(element, oldHeight, readHeight(element));
      }
      if (!pending) baseline = readMetrics(container);
    });

    const sync = () => {
      const current = new Set(Array.from(content.childNodes)
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node.matches(RESIZABLE_ITEM)));
      for (const element of heights.keys()) {
        if (current.has(element)) continue;
        if (pending?.element === element) clearPending();
        observer?.unobserve(element);
        heights.delete(element);
      }
      for (const element of current) {
        const height = readHeight(element);
        const oldHeight = heights.get(element);
        if (oldHeight === undefined) {
          heights.set(element, height);
          observer?.observe(element);
        } else {
          queueRestoration(element, oldHeight, height);
        }
      }
      if (!pending) baseline = readMetrics(container);
    };

    const onScroll = () => {
      clearPending();
      baseline = readMetrics(container);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    syncRef.current = sync;
    sync();
    return () => {
      syncRef.current = null;
      clearPending();
      observer?.disconnect();
      container.removeEventListener("scroll", onScroll);
    };
  }, [active, contentRef, scrollContainerRef, sessionKey]);

  useLayoutEffect(() => {
    syncRef.current?.();
  });
}
