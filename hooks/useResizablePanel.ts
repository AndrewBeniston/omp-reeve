"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { clampPanelWidth } from "@/lib/panel-layout";

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
  target: HTMLDivElement;
  previousBodyResizeState: string | undefined;
}

interface UseResizablePanelOptions {
  ariaLabel: string;
  defaultWidth: number;
  getDefaultWidth?: () => number;
  getMaxWidth: () => number;
  growthDirection: "left" | "right";
  maxWidth: number;
  minWidth: number;
  storageKey: string;
  widthRef: MutableRefObject<number>;
}

interface CommitOptions {
  forcePersist?: boolean;
  persist?: boolean;
}

function readStoredWidth(storageKey: string): number | null {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredWidth(storageKey: string, width: number): void {
  try {
    window.localStorage.setItem(storageKey, String(width));
  } catch {
    // Resizing remains available when storage is unavailable.
  }
}

export function useResizablePanel(options: UseResizablePanelOptions) {
  const {
    ariaLabel,
    defaultWidth,
    getDefaultWidth,
    getMaxWidth,
    growthDirection,
    maxWidth,
    minWidth,
    storageKey,
    widthRef,
  } = options;
  const dragRef = useRef<DragState | null>(null);
  const restoredRef = useRef(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);

  const effectiveMaxWidth = useCallback(
    () => Math.min(maxWidth, Math.max(minWidth, getMaxWidth())),
    [getMaxWidth, maxWidth, minWidth],
  );

  const clampWidth = useCallback(
    (candidate: number) => clampPanelWidth(candidate, minWidth, effectiveMaxWidth()),
    [effectiveMaxWidth, minWidth],
  );

  const applyLiveWidth = useCallback((nextWidth: number) => {
    widthRef.current = nextWidth;
    setWidth(nextWidth);
  }, [widthRef]);

  const commitWidth = useCallback((candidate: number, commitOptions: CommitOptions = {}) => {
    const { forcePersist = false, persist = true } = commitOptions;
    const nextWidth = clampWidth(candidate);
    const changed = nextWidth !== widthRef.current;
    applyLiveWidth(nextWidth);
    if (persist && (changed || forcePersist)) writeStoredWidth(storageKey, nextWidth);
    return nextWidth;
  }, [applyLiveWidth, clampWidth, storageKey, widthRef]);

  const restoreBodyState = useCallback((drag: DragState) => {
    if (drag.previousBodyResizeState === undefined) {
      delete document.body.dataset.panelResizing;
    } else {
      document.body.dataset.panelResizing = drag.previousBodyResizeState;
    }
  }, []);

  const finishResize = useCallback((pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    dragRef.current = null;
    restoreBodyState(drag);
    setIsResizing(false);
    commitWidth(widthRef.current, { forcePersist: true });

    try {
      if (drag.target.hasPointerCapture(pointerId)) {
        drag.target.releasePointerCapture(pointerId);
      }
    } catch {
      // The browser may have already released capture after pointer cancellation.
    }
  }, [commitWidth, restoreBodyState, widthRef]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    // The handle takes no focus from a pointer. preventDefault above stops the
    // browser's own focus, and a focus() call here made :focus-visible match,
    // so the accent ring stayed on the handle after the pointer release. A
    // keyboard user still reaches the handle with Tab and sees the ring.
    const activeDrag = dragRef.current;
    if (activeDrag) finishResize(activeDrag.pointerId);

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
      target,
      previousBodyResizeState: document.body.dataset.panelResizing,
    };
    document.body.dataset.panelResizing = "true";
    setIsResizing(true);
  }, [finishResize, widthRef]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) {
      finishResize(event.pointerId);
      return;
    }
    event.preventDefault();

    const direction = growthDirection === "right" ? 1 : -1;
    const nextWidth = clampWidth(drag.startWidth + ((event.clientX - drag.startX) * direction));
    applyLiveWidth(nextWidth);
    event.currentTarget.setAttribute("aria-valuenow", String(nextWidth));
    event.currentTarget.setAttribute("aria-valuetext", `${nextWidth} px`);
  }, [applyLiveWidth, clampWidth, finishResize, growthDirection]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const onPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const onLostPointerCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    finishResize(event.pointerId);
  }, [finishResize]);

  const resetWidth = useCallback(() => {
    const nextDefault = getDefaultWidth?.() ?? defaultWidth;
    commitWidth(nextDefault, { forcePersist: true });
  }, [commitWidth, defaultWidth, getDefaultWidth]);

  const reclampWidth = useCallback(() => {
    commitWidth(widthRef.current);
  }, [commitWidth, widthRef]);

  /**
   * Widen the panel to at least `width`, never narrowing it.
   *
   * A panel that has been dragged narrow keeps that width, which is right for a
   * file and wrong for a web page: the human is left with a column too thin to
   * read. This raises the floor for the content that needs the room and leaves
   * a panel that is already wide enough alone, so it never fights a deliberate
   * choice to make it wider.
   */
  const growToAtLeast = useCallback((minimum: number) => {
    if (widthRef.current >= minimum) return;
    commitWidth(minimum, { forcePersist: true });
  }, [commitWidth, widthRef]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 12;
    const growKey = growthDirection === "right" ? "ArrowRight" : "ArrowLeft";
    const shrinkKey = growthDirection === "right" ? "ArrowLeft" : "ArrowRight";

    if (event.key === growKey) {
      event.preventDefault();
      commitWidth(widthRef.current + step, { forcePersist: true });
    } else if (event.key === shrinkKey) {
      event.preventDefault();
      commitWidth(widthRef.current - step, { forcePersist: true });
    } else if (event.key === "Home") {
      event.preventDefault();
      commitWidth(minWidth, { forcePersist: true });
    } else if (event.key === "End") {
      event.preventDefault();
      commitWidth(effectiveMaxWidth(), { forcePersist: true });
    } else if (event.key === "Enter") {
      event.preventDefault();
      resetWidth();
    }
  }, [commitWidth, effectiveMaxWidth, growthDirection, minWidth, resetWidth, widthRef]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const storedWidth = readStoredWidth(storageKey);
    const candidate = storedWidth ?? getDefaultWidth?.() ?? defaultWidth;
    const restoredWidth = commitWidth(candidate, { persist: false });
    if (storedWidth !== null && storedWidth !== restoredWidth) {
      writeStoredWidth(storageKey, restoredWidth);
    }
  }, [commitWidth, defaultWidth, getDefaultWidth, storageKey]);

  useEffect(() => {
    if (!restoredRef.current) return;
    commitWidth(widthRef.current);

    const onResize = () => {
      commitWidth(widthRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [commitWidth, widthRef]);

  useEffect(() => {
    if (!isResizing) return;
    const cancelResize = () => {
      const drag = dragRef.current;
      if (drag) finishResize(drag.pointerId);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") cancelResize();
    };
    window.addEventListener("blur", cancelResize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancelResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [finishResize, isResizing]);

  useEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      restoreBodyState(drag);
    };
  }, [restoreBodyState]);

  return {
    growToAtLeast,
    isResizing,
    reclampWidth,
    resetWidth,
    separatorProps: {
      "aria-label": ariaLabel,
      "aria-orientation": "vertical" as const,
      "aria-valuemax": effectiveMaxWidth(),
      "aria-valuemin": minWidth,
      "aria-valuenow": width,
      "aria-valuetext": `${width} px`,
      onDoubleClick: resetWidth,
      onKeyDown,
      onLostPointerCapture,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      role: "separator" as const,
      tabIndex: 0,
    },
    width,
  };
}
