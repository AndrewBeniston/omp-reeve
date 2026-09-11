"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { useI18n } from "@/hooks/useI18n";
import { Launcher, type LauncherAction } from "./Launcher";
import styles from "./new-tab-launcher.module.css";

interface Props {
  actions: LauncherAction[];
}

/**
 * The plus control at the end of the Tab strip.
 *
 * It opens the same launcher the empty panel shows, rather than a menu of its
 * own: one surface, two ways in, which is how the reference behaves.
 */
export function NewTabLauncher({ actions }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const closing = actions.map((action) => ({
    ...action,
    run: () => {
      setOpen(false);
      action.run();
    },
  }));

  return (
    <div ref={root} className={styles.launcher}>
      <IconButton
        className={styles.trigger}
        label={t("tabs.newTab")}
        title={t("tabs.newTab")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
      </IconButton>
      {open && (
        <div className={styles.sheet} role="dialog" aria-label={t("tabs.newTab")}>
          <Launcher actions={closing} label={t("tabs.suggested")} />
        </div>
      )}
    </div>
  );
}

