"use client";

import { useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { useI18n } from "@/hooks/useI18n";
import styles from "./command-arguments-dialog.module.css";

export function CommandArgumentsDialog({ command, title, description, onRun, onClose }: {
  command: string;
  title: string;
  description?: string;
  onRun: (command: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [args, setArgs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return <Dialog open title={title} description={description} initialFocus={input}
    dismissible={!busy} onOpenChange={open => { if (!open) onClose(); }}>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); event.stopPropagation();
      if (busy) return;
      setBusy(true); setError(null);
      try {
        await onRun(`${command}${args.trim() ? ` ${args.trim()}` : ""}`);
        onClose();
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setBusy(false); }
    }}>
      <label>{t("composer.commandArguments")}
        <input ref={input} className={styles.input} value={args} disabled={busy}
          onChange={event => setArgs(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <Button type="button" disabled={busy} onClick={onClose}>{t("chat.cancel")}</Button>
        <Button type="submit" disabled={busy}>{t("composer.runCommand")}</Button>
      </div>
    </form>
  </Dialog>;
}
