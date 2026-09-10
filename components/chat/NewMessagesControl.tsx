"use client";

import { useI18n } from "@/hooks/useI18n";
import { useEffect, useState, type RefObject } from "react";
import styles from "./chat-window.module.css";

export interface NewMessagesControlProps {
  /** True while the transcript follows the newest content. */
  pinned: boolean;
  /** True while the agent or a command keeps producing content. */
  streaming: boolean;
  /** Return the transcript to the newest content and restore the pin. */
  onGoToNewest: () => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

/**
 * A control above the composer. It appears only when the agent keeps writing
 * and the reader has left the end of the transcript. The live region tells a
 * screen reader that the control arrived.
 */
export function NewMessagesControl({ pinned, streaming, onGoToNewest, scrollContainerRef }: NewMessagesControlProps) {
  const { t } = useI18n();
  const [away, setAway] = useState(!pinned);
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;
    let frame: number | null = null;
    const update = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const spacer = container.querySelector<HTMLElement>("[data-response-spacer]");
        const distance = container.scrollHeight - container.clientHeight - container.scrollTop;
        setAway(distance > (spacer?.getBoundingClientRect().height ?? 0) + 24);
      });
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(container);
    const content = container.querySelector<HTMLElement>("[data-transcript-navigation-content]");
    if (content) observer.observe(content);
    return () => {
      container.removeEventListener("scroll", update);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollContainerRef]);
  if (!(scrollContainerRef ? away : !pinned)) return null;

  return (
    <div className={styles.newMessagesBar} role="status" aria-live="polite">
      <button
        type="button"
        aria-label={t("chat.scrollToBottom")}
        className={styles.newMessagesButton}
        onClick={onGoToNewest}
      >
        {streaming ? <span className={styles.workingDots} aria-hidden="true"><span /><span /><span /></span> : <svg
          className={styles.newMessagesArrow}
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 1.5v9M2.5 7 6 10.5 9.5 7" />
        </svg>}
      </button>
    </div>
  );
}
