"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  APPLICATION_MENU_IDS,
  type ApplicationMenuId,
  readMenuOwner,
  showApplicationMenu,
} from "@/lib/desktop-application-menu";
import styles from "./shell.module.css";

interface ApplicationMenuBarProps {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
}

const MENU_LABEL_KEYS: Record<ApplicationMenuId, string> = {
  file: "menu.file",
  edit: "menu.edit",
  view: "menu.view",
  help: "menu.help",
};

/**
 * The 36px bar above the application on Windows and Linux.
 *
 * It carries the one sidebar toggle, the history arrows, and the four menu
 * names. The system draws its caption buttons over the trailing end of the
 * same bar, and the measured inset keeps a control from landing under them.
 * macOS draws none of this, because the system owns the menu there. ADR-0008.
 */
export function ApplicationMenuBar({ sidebarOpen, onSidebarToggle }: ApplicationMenuBarProps) {
  const { t } = useI18n();
  const [ownsMenu, setOwnsMenu] = useState(false);
  const openIdRef = useRef<ApplicationMenuId | null>(null);

  useEffect(() => {
    setOwnsMenu(readMenuOwner() === "application-menu");
  }, []);

  const openMenu = useCallback((id: ApplicationMenuId, button: HTMLButtonElement) => {
    if (openIdRef.current === id) return;
    const rect = button.getBoundingClientRect();
    openIdRef.current = id;
    void showApplicationMenu(id, { x: rect.left, y: rect.bottom }).finally(() => {
      openIdRef.current = null;
    });
  }, []);

  if (!ownsMenu) return null;

  return (
    <div className={styles.applicationMenuBar} data-testid="application-menu-bar">
      <button
        type="button"
        className={styles.applicationMenuControl}
        onClick={onSidebarToggle}
        title={sidebarOpen ? t("sidebar.hide") : t("sidebar.show")}
        aria-label={sidebarOpen ? t("sidebar.hide") : t("sidebar.show")}
        aria-pressed={sidebarOpen}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.applicationMenuControl}
        onClick={() => window.history.back()}
        title={t("sidebar.back")}
        aria-label={t("sidebar.back")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.applicationMenuControl}
        onClick={() => window.history.forward()}
        title={t("sidebar.forward")}
        aria-label={t("sidebar.forward")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      <div className={styles.applicationMenuItems}>
        {APPLICATION_MENU_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.applicationMenuName}
            data-menu={id}
            onClick={(event) => openMenu(id, event.currentTarget)}
          >
            {t(MENU_LABEL_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
