"use client";

import { useI18n } from "@/hooks/useI18n";
import { useAcceleratorLabel } from "@/hooks/useShortcutLabel";
import { TOGGLE_PANEL_ACCELERATOR } from "@/lib/panel-actions";
import shellStyles from "./shell.module.css";
import stateStyles from "./state-styles.module.css";

/*
 * Show or hide the panel beside a chat.
 *
 * The header owns this control, as the reference's header does. It is drawn a
 * second time at the end of the panel's Tab strip only while the panel fills
 * the workspace, because Reeve's header is inside the column the panel covers
 * and the reference's is not. One component, one state, one action.
 */
export function PanelVisibilityToggle({ open, onToggle }: {
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const acceleratorLabel = useAcceleratorLabel();
  const label = open ? t("files.hidePanel") : t("files.showPanel");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-controls="file-panel"
      aria-pressed={open}
      title={`${label} · ${acceleratorLabel(TOGGLE_PANEL_ACCELERATOR)}`}
      aria-label={label}
      className={`${shellStyles.filePanelToggle} ${stateStyles.filePanelToggle}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    </button>
  );
}
