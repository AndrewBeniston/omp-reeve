"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { fetchExternalEditors, openInExternalEditor } from "@/lib/file-source-client";
import type { ExternalEditorListing } from "@/lib/external-editor-registry";
import styles from "./file-source.module.css";

/**
 * "Open in {application}", and everything else this machine has.
 *
 * Every registry target is probed, so an application Reeve knows about but
 * cannot find is shown and disabled. The menu says the same thing every time,
 * and says why an entry is not usable. For a file type the platform answers
 * for, the server also asks the platform which applications open that file and
 * appends them, so the list is not the same on every file.
 *
 * Opening from here never changes what this file opens in next time. That is
 * the reference's own rule for a review menu, and it is the right one: reading
 * a CSV in a spreadsheet once should not send every later file there.
 */
export function OpenWithMenu({ filePath, line }: { filePath: string; line?: number }) {
  const [listing, setListing] = useState<ExternalEditorListing | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setListing(null);
    void fetchExternalEditors(filePath, controller.signal).then((next) => {
      if (!controller.signal.aborted) setListing(next);
    });
    return () => controller.abort();
  }, [filePath]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    // The menu itself answers Escape and restores the trigger focus. This
    // listener is the fallback for the empty menu, where focus never leaves
    // the trigger and the menu's own handler cannot run.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const openIn = async (targetId: string) => {
    setOpen(false);
    setError(await openInExternalEditor(filePath, targetId, line));
  };

  const preferred = listing?.targets.find((target) => target.id === listing.preferredTargetId);
  const offered = listing?.targets.filter((target) => target.id !== listing.preferredTargetId) ?? [];

  return <div className={styles.openWith} ref={container}>
    {error && <span role="alert" className={styles.openWithError}>{error}</span>}
    <Button size="sm" tone="ghost" disabled={!preferred} onClick={() => preferred && void openIn(preferred.id)}>
      {/* While the probe is in flight the control says so rather than
          offering an empty menu. */}
      {listing ? preferred ? `Open in ${preferred.label}` : "No application found" : "Looking for applications…"}
    </Button>
    <Button ref={trigger} size="sm" tone="ghost" aria-haspopup="menu" aria-expanded={open} disabled={!listing}
      onClick={() => setOpen((current) => !current)}>Open with…</Button>
    {listing && <Menu open={open} label="Open with" surface="plain" triggerRef={trigger}
      className={styles.openWithMenu} onClose={() => setOpen(false)}>
      {offered.map((target) => <MenuItem key={target.id} surface="plain" className={styles.openWithItem}
        disabled={!target.available} onClick={() => void openIn(target.id)}>
        <span>{target.label}</span>
        {!target.available && <span className={styles.openWithUnavailable}>Not installed</span>}
      </MenuItem>)}
    </Menu>}
  </div>;
}
