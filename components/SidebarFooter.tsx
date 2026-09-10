"use client";

import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { useI18n } from "@/hooks/useI18n";
import { openExternal } from "@/lib/open-external";
import styles from "./shell/sidebar-footer.module.css";

interface SidebarFooterProps {
  onOpenSettings: () => void;
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.39.33.74.6 1 .3.28.69.42 1.1.4h.09v4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 7.5a2.3 2.3 0 1 1 3.6 1.9c-.9.6-1.4 1-1.4 2" />
      <path d="M10 14h.01" />
    </svg>
  );
}

export function SidebarFooter({ onOpenSettings }: SidebarFooterProps) {
  const { t } = useI18n();
  const helpLabel = t("sidebar.help");

  return (
    <footer className={styles.footer}>
      <div className={styles.footerRow}>
        <Button
          onClick={onOpenSettings}
          title={t("common.settings")}
          fullWidth
          size="sm"
          tone="ghost"
          className={styles.settingsButton}
        >
          <SettingsIcon />
          {t("common.settings")}
        </Button>
        <IconButton
          label={helpLabel}
          size="sm"
          className={styles.helpButton}
          onClick={() => openExternal("https://omp.sh")}
        >
          <HelpIcon />
        </IconButton>
      </div>
    </footer>
  );
}
