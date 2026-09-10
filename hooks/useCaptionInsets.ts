"use client";

import { useEffect } from "react";

/**
 * Publishes the width the system reserves for its caption buttons.
 *
 * Windows and Linux draw the close, minimise, and maximise buttons over the
 * top of the window, and the renderer must not put a control under them. The
 * width is never a constant: it changes with the window zoom, with a
 * right-to-left layout, and with the system's own caption metrics.
 *
 * navigator.windowControlsOverlay reports the live rectangle and does not exist
 * on macOS, so the variable stays at zero there and the macOS rules are
 * untouched. ADR-0008 records the decision.
 */

const CAPTION_INSET_END = "--ui-caption-inset-end";
const CAPTION_INSET_START = "--ui-caption-inset-start";
const OVERLAY_ATTRIBUTE = "ompCaptionOverlay";

type OverlayRect = { x: number; y: number; width: number; height: number };

type WindowControlsOverlay = {
  visible: boolean;
  getTitlebarAreaRect: () => OverlayRect;
  addEventListener: (type: "geometrychange", listener: () => void) => void;
  removeEventListener: (type: "geometrychange", listener: () => void) => void;
};

function readOverlay(): WindowControlsOverlay | undefined {
  return (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlay })
    .windowControlsOverlay;
}

export function readCaptionInsets(
  rect: OverlayRect,
  viewportWidth: number,
): { start: number; end: number } {
  // The rectangle is the space left for the page, so the caption buttons are
  // whatever sits outside it. A right-to-left window puts them on the leading
  // edge instead, and this arithmetic covers both without asking which.
  const start = Math.max(0, Math.round(rect.x));
  const end = Math.max(0, Math.round(viewportWidth - rect.x - rect.width));
  return { start, end };
}

export function useCaptionInsets(): void {
  useEffect(() => {
    const root = document.documentElement;
    const overlay = readOverlay();

    if (!overlay) {
      // macOS, and every browser tab. Nothing reserves space.
      delete root.dataset[OVERLAY_ATTRIBUTE];
      root.style.removeProperty(CAPTION_INSET_END);
      root.style.removeProperty(CAPTION_INSET_START);
      return;
    }

    // geometrychange fires many times inside one resize, so the write waits for
    // the next frame rather than running per event.
    let frame = 0;
    const publish = () => {
      frame = 0;
      root.dataset[OVERLAY_ATTRIBUTE] = String(overlay.visible);
      if (!overlay.visible) {
        root.style.setProperty(CAPTION_INSET_END, "0px");
        root.style.setProperty(CAPTION_INSET_START, "0px");
        return;
      }
      const { start, end } = readCaptionInsets(
        overlay.getTitlebarAreaRect(),
        window.innerWidth,
      );
      root.style.setProperty(CAPTION_INSET_END, `${end}px`);
      root.style.setProperty(CAPTION_INSET_START, `${start}px`);
    };

    const schedule = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(publish);
    };

    publish();
    overlay.addEventListener("geometrychange", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      overlay.removeEventListener("geometrychange", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
}

