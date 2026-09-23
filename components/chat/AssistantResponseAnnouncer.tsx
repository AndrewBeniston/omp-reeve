"use client";

import React from "react";
import {
  useAssistantResponseAnnouncer,
  type AssistantResponseAnnouncerProps,
} from "./useAssistantResponseAnnouncer";
import styles from "./assistant-response-announcer.module.css";

export function AssistantResponseAnnouncer(props: AssistantResponseAnnouncerProps) {
  const { announcement } = useAssistantResponseAnnouncer(props);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={styles.srOnly}
      data-component="assistant-response-announcer"
      data-response-id={props.responseId}
    >
      {announcement}
    </div>
  );
}
