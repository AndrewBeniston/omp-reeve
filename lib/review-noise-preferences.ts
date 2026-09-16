/**
 * The two settings that decide how much of a change Review shows: whether
 * generated files are held back, and whether rich content previews.
 *
 * They are kept apart from the display preferences because they decide what
 * is drawn at all rather than how drawn lines read, and because R5 and R6
 * record them as separate shipped settings with separate defaults.
 */
export interface ReviewNoisePreferences {
  /**
   * Whether markdown and SVG preview.
   *
   * R6: two rich preview settings exist in the reference and they disagree.
   * The right panel binds the global one, whose initial value is false, so
   * rich preview is off here until the human turns it on. The file-source
   * view reads the other and defaults the other way; a single value for both
   * surfaces would be wrong in one of them.
   */
  richPreview: boolean;
  /**
   * Whether files carrying Git's `linguist-generated` attribute are held back.
   *
   * R5: the persisted preference defaults to off, and the same checkbox is
   * the reveal.
   */
  hideGenerated: boolean;
}

export const DEFAULT_REVIEW_NOISE_PREFERENCES: Readonly<ReviewNoisePreferences> = {
  richPreview: false,
  hideGenerated: false,
};

/**
 * One complete set of preferences, whatever the caller had stored.
 *
 * A Review tab's selection is persisted, so a tab written before either of
 * these existed restores without them. Reading such a value directly gives
 * `undefined` where a boolean is expected, which renders as the wrong default
 * rather than as an error.
 */
export function reviewNoisePreferences(
  stored?: Partial<Record<keyof ReviewNoisePreferences, unknown>>,
): Readonly<ReviewNoisePreferences> {
  if (!stored) return DEFAULT_REVIEW_NOISE_PREFERENCES;
  const resolved = { ...DEFAULT_REVIEW_NOISE_PREFERENCES };
  for (const key of Object.keys(resolved) as (keyof ReviewNoisePreferences)[]) {
    if (typeof stored[key] === "boolean") resolved[key] = stored[key];
  }
  return resolved;
}
