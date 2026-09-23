"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import styles from "./UserMessageEditor.module.css";

export function UserMessageEditor({
  initialText,
  pending,
  onSubmit,
  onCancel,
}: {
  initialText: string;
  pending: boolean;
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(initialText.length, initialText.length);
  }, [initialText]);

  const submit = () => {
    if (pending) return;
    void onSubmit(text).catch(() => {});
  };

  return (
    <div className={styles.editor}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={t("codex.userMessage.editPlaceholder")}
        aria-label={t("codex.userMessage.editTextareaAriaLabel")}
        disabled={pending}
        rows={3}
      />
      <div className={styles.actions}>
        <button type="button" onClick={onCancel} disabled={pending}>
          {t("codex.userMessage.cancelEditMessage")}
        </button>
        <button type="button" onClick={submit} disabled={pending} aria-busy={pending || undefined}>
          {t("codex.userMessage.sendEditedMessage")}
        </button>
      </div>
    </div>
  );
}
