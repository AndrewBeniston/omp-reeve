"use client";

import { IconButton } from "@/components/ui/IconButton";
import { useI18n } from "@/hooks/useI18n";
import { useAcceleratorLabel } from "@/hooks/useShortcutLabel";
import { MAXIMISE_PANEL_ACCELERATOR } from "@/lib/panel-actions";
import { PanelVisibilityToggle } from "./PanelVisibilityToggle";
import styles from "./shell.module.css";

/*
 * The control the reference puts after the right panel's Tab strip: fill the
 * workspace with the panel, or give the width back.
 *
 * Panel visibility belongs to the header, there as here, and joins this
 * cluster only while the panel fills the workspace. The reference's header
 * spans its shell and stays in sight at full width; Reeve's is inside the
 * column the panel covers, so at full width this is the same top-right corner
 * the reference's toggle keeps, running the same action.
 */
export function PanelControls({ maximised, onToggleMaximised, panelOpen, onTogglePanel }: {
  maximised: boolean;
  onToggleMaximised: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const { t } = useI18n();
  const acceleratorLabel = useAcceleratorLabel();
  const label = maximised ? t("layout.restorePanel") : t("layout.maximisePanel");

  return (
    <div className={styles.rightPanelControls}>
      <IconButton
        className={styles.rightPanelWidthControl}
        label={label}
        title={`${label} · ${acceleratorLabel(MAXIMISE_PANEL_ACCELERATOR)}`}
        pressed={maximised}
        onClick={onToggleMaximised}
      >
        {maximised ? <RestoreWidthIcon /> : <MaximiseWidthIcon />}
      </IconButton>
      {maximised && <PanelVisibilityToggle open={panelOpen} onToggle={onTogglePanel} />}
    </div>
  );
}

function MaximiseWidthIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.8 2.4h3.8v3.8" />
      <path d="m13.6 2.4-4.3 4.3" />
      <path d="M6.2 13.6H2.4V9.8" />
      <path d="m2.4 13.6 4.3-4.3" />
    </svg>
  );
}

function RestoreWidthIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.6 6.7H9.8V2.9" />
      <path d="m9.8 6.7 4.1-4.1" />
      <path d="M2.4 9.3h3.8v3.8" />
      <path d="m6.2 9.3-4.1 4.1" />
    </svg>
  );
}
