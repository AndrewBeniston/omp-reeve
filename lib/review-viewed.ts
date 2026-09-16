/**
 * The viewed mark, and what clears it.
 *
 * A mark records the revision of the file it was made against, so it survives
 * a restart with the Tab's stored selection and still means what it said: the
 * human read *that* version. When the file changes underneath the mark, the
 * revision on screen no longer matches the one recorded and the file is
 * unviewed again - nothing needs to go looking for it and clear it.
 *
 * A mark for a path the review no longer carries is simply never asked about.
 */
export function isReviewFileViewed(
  viewedRevisions: Readonly<Record<string, string>> | undefined,
  path: string,
  revision: string | undefined,
): boolean {
  if (!viewedRevisions || !revision) return false;
  return viewedRevisions[path] === revision;
}

/** How many of the files on screen have been read at the revision on screen. */
export function reviewViewedCount(
  viewedRevisions: Readonly<Record<string, string>> | undefined,
  fileRevisions: Readonly<Record<string, string>>,
  paths: readonly string[],
): number {
  return paths.reduce((total, path) => total + (isReviewFileViewed(viewedRevisions, path, fileRevisions[path]) ? 1 : 0), 0);
}
