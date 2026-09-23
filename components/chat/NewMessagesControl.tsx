"use client";

import { useI18n } from "@/hooks/useI18n";
import type { FollowMode } from "@/lib/transcript-follow";
import styles from "./chat-window.module.css";

export interface NewMessagesControlProps {
  mode: FollowMode;
  button: { visible: boolean; workingDots: boolean };
  /** Return the transcript to the newest content. */
  onGoToNewest: () => void;
}

/**
 * A control above the composer. The follow reducer decides when the reader
 * has left the end. The live region announces the control when it appears.
 */
export function NewMessagesControl({ mode, button, onGoToNewest }: NewMessagesControlProps) {
  const { t } = useI18n();
  const visible = button.visible && mode !== "user_follow" && mode !== "prework_follow";

  return (
    <div className={styles.newMessagesBar} role="status" aria-live="polite">
      <button
        type="button"
        aria-label={t("localConversation.scrollToBottomButton")}
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        data-visible={visible}
        className={styles.newMessagesButton}
        onClick={(event) => {
          event.currentTarget.blur();
          onGoToNewest();
        }}
      >
        {button.workingDots ? <span className={styles.workingDots} aria-hidden="true"><span /><span /><span /></span> : <svg
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
