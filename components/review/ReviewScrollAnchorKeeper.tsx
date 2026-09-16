"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@pierre/diffs/react";
import {
  chooseReviewScrollAnchor,
  reviewScrollRestoreStep,
  type ReviewScrollAnchor,
  type ReviewSectionOffset,
} from "@/lib/review-scroll-anchor";

/*
 * How long a restore waits for the list to be ready.
 *
 * A list mounts with no sections attached and shorter than its content, and
 * both fill in over the frames that follow. The restore waits for them, and
 * this budget bounds the wait so a scope that never becomes ready still ends.
 * About one second at sixty frames a second.
 */
const RESTORE_FRAME_LIMIT = 60;

function scrollElement(root: HTMLElement | Document | undefined): HTMLElement | null {
  if (!root) return null;
  return root instanceof Document ? root.scrollingElement as HTMLElement | null : root;
}

/**
 * Keeps and returns the reading position of the review diff list.
 *
 * Drawn inside the Virtualizer because the wrapper forwards no ref: the
 * instance is only reachable from a child, through its context.
 *
 * It renders nothing. It watches the scroll container, holds the current
 * anchor in a ref, and writes it exactly one time, when the list unmounts.
 * That is the only moment worth a write: a scope change is what destroys the
 * container, and a write on every scroll frame would rewrite the Tab's stored
 * selection sixty times a second.
 */
export function ReviewScrollAnchorKeeper({ owner, anchor, getSections, onAnchorChange, restore = true }: {
  /** The Session and directory this reading belongs to. */
  owner: string;
  /** The anchor this list mounted with, or nothing. */
  anchor: ReviewScrollAnchor | null;
  /** Every drawn file section, by path. */
  getSections: () => Iterable<readonly [string, HTMLElement]>;
  /** Called one time, on unmount, with the place the reader left. */
  onAnchorChange: (anchor: ReviewScrollAnchor | null) => void;
  /**
   * False when the list must open where it is told to rather than where it was
   * left: a single-file review, or a mount that follows an explicit file
   * selection. The keeper still records, it only declines to move the list.
   */
  restore?: boolean;
}) {
  const virtualizer = useVirtualizer();
  const live = useRef<ReviewScrollAnchor | null>(anchor);
  const commit = useRef(onAnchorChange);
  commit.current = onAnchorChange;
  const sectionsRef = useRef(getSections);
  sectionsRef.current = getSections;
  /*
   * Read at mount and cleared, so a later render cannot move a list the reader
   * has already scrolled. A filter keystroke re-renders this component, and
   * nothing here reacts to it.
   */
  const wanted = useRef(restore ? anchor : null);

  useEffect(() => {
    if (!virtualizer) return;
    const readSections = (): ReviewSectionOffset[] => {
      const offsets: ReviewSectionOffset[] = [];
      for (const [path, element] of sectionsRef.current()) {
        offsets.push({ path, top: virtualizer.getOffsetInScrollContainer(element) });
      }
      return offsets;
    };
    const element = scrollElement(virtualizer.getRoot());

    const target = wanted.current;
    let frames = 0;
    let handle: number | null = null;
    let restoring = target !== null;
    const cancelFrame = () => {
      if (handle !== null) cancelAnimationFrame(handle);
      handle = null;
    };
    /*
     * The restore is over, and no later run of this effect may start it again.
     * React can stop an effect and start it again on a component that stays
     * mounted, so the target waits in the ref until a restore ends for a real
     * reason: the list moved, the file is not in this scope, or the reader
     * took the position. Clearing the target when the effect starts loses it,
     * because the first run's cleanup ends that attempt before a frame runs.
     */
    const finishRestore = () => {
      restoring = false;
      wanted.current = null;
      cancelFrame();
    };
    const step = () => {
      handle = null;
      if (!restoring || !target) return;
      const decision = reviewScrollRestoreStep({
        anchor: target,
        owner,
        sections: readSections(),
        reachable: element ? element.scrollHeight - element.clientHeight : 0,
        budgetSpent: frames >= RESTORE_FRAME_LIMIT,
      });
      if (decision.action === "stop") { finishRestore(); return; }
      if (decision.action === "scroll") {
        virtualizer.scrollTo({ top: decision.top, behavior: "instant" });
        finishRestore();
        return;
      }
      frames += 1;
      handle = requestAnimationFrame(step);
    };
    if (restoring) handle = requestAnimationFrame(step);

    const onScroll = () => {
      // A reader who scrolls owns the position from here, so a restore still
      // waiting for measurement gives way rather than pulling them back.
      finishRestore();
      if (!element) return;
      /*
       * Read now, not in a requested frame. The anchor is written one time, at
       * unmount, and a cleanup cancels a frame that has not run yet. A scroll
       * in the last frame before a scope change would be the one lost, and
       * that is the scroll the reader most wants back. Nothing here is written
       * to disk, so there is no per-frame cost to avoid: it is one scrollTop
       * read and one offset read for each drawn file.
       */
      live.current = chooseReviewScrollAnchor({ owner, scrollTop: element.scrollTop, sections: readSections() });
    };
    element?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      restoring = false;
      cancelFrame();
      element?.removeEventListener("scroll", onScroll);
    };
  }, [owner, virtualizer]);

  /*
   * The write, and the only one. It runs after the effect above has stopped
   * listening, and it reads the ref rather than the DOM, because by this point
   * the container is being removed and every offset in it is gone.
   */
  useEffect(() => () => { commit.current(live.current); }, []);

  return null;
}
