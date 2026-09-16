/**
 * Where a review reading was left, so a scope change can return to it.
 *
 * ReviewPanel replaces the whole file list with a loading message the moment
 * the scope changes, before any read answers, so the scrolling element is
 * destroyed and its scrollTop with it. The selected file survives that because
 * it lives in the Tab's selection rather than inside the list. This is the
 * same home for the reading position.
 *
 * A file path and an offset inside that file, not a raw scroll position: two
 * scopes hold different diffs, so the same pixel in Staged and in Uncommitted
 * is not the same place. The owner travels with it because a Tab moved to
 * another Session or directory must not return to a stranger's place.
 */

/** A place in a review, named by the file it sits in. */
export interface ReviewScrollAnchor {
  /** The Session and directory the reading belonged to. */
  owner: string;
  /** The file the top of the viewport was resting in. */
  path: string;
  /** Pixels from the top of that file's section to the top of the viewport. */
  offset: number;
}

/** One drawn file section, and where it starts in the scroll container. */
export interface ReviewSectionOffset {
  path: string;
  top: number;
}

/**
 * An anchor read back from disk, or nothing.
 *
 * The selection file is one a human can edit, so nothing here is trusted. A
 * missing field, a wrong type, or a number that is not finite drops the whole
 * anchor rather than restoring a reading to an arbitrary place.
 */
export function sanitizeReviewScrollAnchor(value: unknown): ReviewScrollAnchor | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { owner, path, offset } = record;
  if (typeof owner !== "string" || owner === "") return null;
  if (typeof path !== "string" || path === "") return null;
  if (typeof offset !== "number" || !Number.isFinite(offset)) return null;
  return { owner, path, offset };
}

function byTop(sections: readonly ReviewSectionOffset[]): ReviewSectionOffset[] {
  return [...sections].sort((left, right) => left.top - right.top);
}

/**
 * The file the viewport is resting in, and how far into it.
 *
 * The last section that starts at or above the viewport top, which is the file
 * a reader would say they are looking at. A reading at the very top returns
 * nothing: there is no place to restore, and writing one would make every
 * untouched review carry an anchor.
 */
export function chooseReviewScrollAnchor({ owner, scrollTop, sections }: {
  owner: string;
  scrollTop: number;
  sections: readonly ReviewSectionOffset[];
}): ReviewScrollAnchor | null {
  if (!owner || scrollTop <= 0) return null;
  const ordered = byTop(sections);
  if (ordered.length === 0) return null;
  let resting = ordered[0];
  for (const section of ordered) {
    if (section.top > scrollTop) break;
    resting = section;
  }
  return { owner, path: resting.path, offset: scrollTop - resting.top };
}

/**
 * Where to scroll to return to an anchor, or nothing.
 *
 * Nothing in three cases, and each one is a case where restoring would be
 * wrong rather than merely difficult: no anchor was kept, the anchor belongs to
 * another Session or directory, or the file it names is not in this scope.
 */
export function resolveReviewScrollTop({ anchor, owner, sections }: {
  anchor: ReviewScrollAnchor | null;
  owner: string;
  sections: readonly ReviewSectionOffset[];
}): number | null {
  if (!anchor || anchor.owner !== owner) return null;
  const section = sections.find((candidate) => candidate.path === anchor.path);
  if (!section) return null;
  return Math.max(0, section.top + anchor.offset);
}


/** What a restore attempt should do on this frame. */
export type ReviewScrollRestoreStep =
  | { action: "wait" }
  | { action: "scroll"; top: number }
  | { action: "stop" };

/**
 * One frame of a restore, decided.
 *
 * Three things can be missing when a list mounts, and only one of them is a
 * reason to give up. The sections attach as the list draws them, so an empty
 * list and a list without this file are both "not yet" while the frame budget
 * holds. The container also mounts shorter than its content and grows, so a
 * scroll issued too early is clamped to a height that does not exist. Only a
 * foreign owner is final at once, because no later frame can change it.
 */
export function reviewScrollRestoreStep({ anchor, owner, sections, reachable, budgetSpent }: {
  anchor: ReviewScrollAnchor | null;
  owner: string;
  sections: readonly ReviewSectionOffset[];
  /** How far the container can scroll now: scrollHeight less clientHeight. */
  reachable: number;
  /** True when no frame is left to wait for. */
  budgetSpent: boolean;
}): ReviewScrollRestoreStep {
  if (!anchor || anchor.owner !== owner) return { action: "stop" };
  const top = resolveReviewScrollTop({ anchor, owner, sections });
  // The file is not drawn yet, or it is not in this scope at all. Those two
  // look the same from here, so the budget decides between them.
  if (top === null) return budgetSpent ? { action: "stop" } : { action: "wait" };
  if (reachable >= top || budgetSpent) return { action: "scroll", top };
  return { action: "wait" };
}
