"use client";

import { Button } from "@/components/ui/Button";
import { MenuItem } from "@/components/ui/Menu";
import { reviewNoisePreferences, type ReviewNoisePreferences as NoisePreferences } from "@/lib/review-noise-preferences";
import styles from "./review-noise.module.css";

export interface ReviewNoisePreferenceProps {
  preferences: NoisePreferences;
  onChange: (preferences: NoisePreferences) => void;
}

/**
 * The generated-file filter, for the changed-files tree's filter menu.
 *
 * One boolean, off until it is turned on, and turning it off again is the
 * whole of the reveal. R5 found no per-file reveal in the reference.
 */
export function ReviewGeneratedFilterItem({ preferences: stored, onChange }: ReviewNoisePreferenceProps) {
  const preferences = reviewNoisePreferences(stored);
  return <MenuItem role="menuitemcheckbox" checked={preferences.hideGenerated}
    onClick={() => onChange({ ...preferences, hideGenerated: !preferences.hideGenerated })}>
    Hide generated files
  </MenuItem>;
}

/**
 * The rich preview switch, for the panel's options menu.
 *
 * The label is the reference's own, recorded against Review 19. In Reeve the
 * switch governs markdown and SVG only, because images and PDFs preview
 * either way, so the label is broader than what turning it off changes.
 */
export function ReviewRichPreviewItem({ preferences: stored, onChange }: ReviewNoisePreferenceProps) {
  const preferences = reviewNoisePreferences(stored);
  return <MenuItem role="menuitemcheckbox" checked={preferences.richPreview}
    onClick={() => onChange({ ...preferences, richPreview: !preferences.richPreview })}>
    {preferences.richPreview ? "Disable rich preview" : "Enable rich preview"}
  </MenuItem>;
}

/**
 * What the filter is holding back, and the way to see it.
 *
 * Shown only while files are actually hidden, so the list carries no standing
 * furniture for a filter nobody turned on.
 */
export function ReviewGeneratedNotice({ hiddenCount, onReveal }: { hiddenCount: number; onReveal: () => void }) {
  if (hiddenCount < 1) return null;
  return <p className={styles.reveal} role="status">
    <span>{hiddenCount === 1 ? "1 generated file hidden" : `${hiddenCount.toLocaleString("en-GB")} generated files hidden`}</span>
    <Button size="sm" tone="ghost" onClick={onReveal}>Show them</Button>
  </p>;
}
