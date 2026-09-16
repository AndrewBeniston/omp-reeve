"use client";

import { MenuItem } from "@/components/ui/Menu";
import { reviewDisplayPreferences, type ReviewDisplayPreferences as DisplayPreferences } from "@/lib/review-display-preferences";

export interface ReviewDisplayPreferencesProps {
  preferences: DisplayPreferences;
  onChange: (preferences: DisplayPreferences) => void;
  fullFileLoadingAvailable: boolean;
}

export type ReviewDisplayRowProps = Omit<ReviewDisplayPreferencesProps, "fullFileLoadingAvailable">;

/*
 * Every label below is imperative: it names what the click will do, so the
 * text reports the current state inversely. That is the reference's own
 * wording, recorded against Review 19, including "white space" as two words.
 *
 * The rows are exported one by one because the reference's options menu is
 * two ordered groups with rows from three different preference stores
 * between them. Only the owning menu can interleave them in that order.
 */

/** Expand or collapse every diff. Reeve's own row; the reference groups it elsewhere. */
export function ReviewExpandDiffsItem({ preferences: stored, onChange }: ReviewDisplayRowProps) {
  const preferences = reviewDisplayPreferences(stored);
  return <MenuItem onClick={() => onChange({ ...preferences, expanded: !preferences.expanded })}>
    {preferences.expanded ? "Collapse all diffs" : "Expand all diffs"}
  </MenuItem>;
}

/** The lower group's first row. */
export function ReviewFullFilesItem({ preferences: stored, onChange }: ReviewDisplayRowProps) {
  const preferences = reviewDisplayPreferences(stored);
  return <MenuItem role="menuitemcheckbox" checked={preferences.loadFullFiles}
    onClick={() => onChange({ ...preferences, loadFullFiles: !preferences.loadFullFiles })}>
    {preferences.loadFullFiles ? "Don't load full files" : "Load full files"}
  </MenuItem>;
}

export function ReviewWordDiffsItem({ preferences: stored, onChange }: ReviewDisplayRowProps) {
  const preferences = reviewDisplayPreferences(stored);
  return <MenuItem role="menuitemcheckbox" checked={preferences.wordDiffs}
    onClick={() => onChange({ ...preferences, wordDiffs: !preferences.wordDiffs })}>
    {preferences.wordDiffs ? "Disable word diffs" : "Enable word diffs"}
  </MenuItem>;
}

/**
 * White space is shown until it is hidden, per R4's reading of the shipped
 * setting's own initial value.
 */
export function ReviewWhiteSpaceItem({ preferences: stored, onChange }: ReviewDisplayRowProps) {
  const preferences = reviewDisplayPreferences(stored);
  return <MenuItem role="menuitemcheckbox" checked={preferences.hideWhitespace}
    onClick={() => onChange({ ...preferences, hideWhitespace: !preferences.hideWhitespace })}>
    {preferences.hideWhitespace ? "Show white space" : "Hide white space"}
  </MenuItem>;
}

/**
 * The display rows for a menu that has no rich preview or patch of its own,
 * which is the pull-request display options menu.
 */
export function ReviewDisplayPreferences({ preferences, onChange, fullFileLoadingAvailable }: ReviewDisplayPreferencesProps) {
  return <>
    <ReviewExpandDiffsItem preferences={preferences} onChange={onChange} />
    {fullFileLoadingAvailable && <ReviewFullFilesItem preferences={preferences} onChange={onChange} />}
    <ReviewWordDiffsItem preferences={preferences} onChange={onChange} />
    <ReviewWhiteSpaceItem preferences={preferences} onChange={onChange} />
  </>;
}
