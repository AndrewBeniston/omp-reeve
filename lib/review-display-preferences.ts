export interface ReviewDisplayPreferences {
  expanded: boolean;
  wordDiffs: boolean;
  loadFullFiles: boolean;
  /**
   * Whether a whitespace-only change is read as a change at all.
   *
   * The reference makes this a read rather than a display filter: its diff
   * cache is keyed on whether whitespace was ignored, so the two readings are
   * separate results. Reeve follows that, which is why the flag travels to the
   * server with the request instead of filtering rendered lines.
   */
  hideWhitespace: boolean;
}

/**
 * The shipped defaults, per R4 in the reference research.
 *
 * Five of the nine settings R4 records live here; diff view mode and line
 * wrapping are held on the selection, and generated-file filtering and revert
 * confirmation belong to their own tickets. `expanded` is Reeve's own and has
 * no referent in that table.
 */
export const DEFAULT_REVIEW_DISPLAY_PREFERENCES: Readonly<ReviewDisplayPreferences> = {
  expanded: true,
  wordDiffs: false,
  loadFullFiles: true,
  hideWhitespace: false,
};

/**
 * One complete set of preferences, whatever the caller had stored.
 *
 * A Review tab's selection is persisted, so a tab written before a preference
 * existed restores without it. Reading such a value directly gives `undefined`
 * where a boolean is expected, which renders as the wrong default rather than
 * as an error. Every read inside the diff goes through here instead.
 */
export function reviewDisplayPreferences(stored?: Partial<Record<keyof ReviewDisplayPreferences, unknown>>): Readonly<ReviewDisplayPreferences> {
  if (!stored) return DEFAULT_REVIEW_DISPLAY_PREFERENCES;
  const resolved = { ...DEFAULT_REVIEW_DISPLAY_PREFERENCES };
  for (const key of Object.keys(resolved) as (keyof ReviewDisplayPreferences)[]) {
    if (typeof stored[key] === "boolean") resolved[key] = stored[key];
  }
  return resolved;
}
