/*
 * What happened to a file, in words, above its lines.
 *
 * A pure rename and a mode-only change have no changed lines at all, so the
 * panel draws no diff for them and they would otherwise appear as a file with
 * nothing in it. Reading this from the patch header rather than from the
 * renderer's parsed file is what lets those two cases be described at all:
 * they never reach the renderer.
 */

/** One changed file, as the panel already holds it. */
export interface ReviewPresentedFile {
  path: string;
  oldPath: string;
  patch: string;
}

/** Git's own file modes, named rather than left as six digits. */
const MODE_NAMES: Record<string, string> = {
  "100644": "a regular file",
  "100755": "an executable file",
  "120000": "a symbolic link",
  "160000": "a submodule",
  "040000": "a directory",
};

function describeMode(mode: string): string {
  const name = MODE_NAMES[mode];
  return name ? `${name} (${mode})` : `mode ${mode}`;
}

/**
 * The patch's own header, which is everything before its first hunk.
 *
 * A rename with no content change has no hunk at all, so the end of the patch
 * ends the header as readily as its first hunk does.
 */
function patchHeader(patch: string): string[] {
  // The body is cut away before the split rather than after it, because a
  // large file's patch is megabytes of text this never needs to look at.
  const firstHunk = patch.startsWith("@@") ? 0 : patch.indexOf("\n@@");
  return (firstHunk === -1 ? patch : patch.slice(0, firstHunk)).split("\n");
}

function headerValue(header: string[], prefix: string): string | null {
  const line = header.find((candidate) => candidate.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}

/** Sentences to print. Empty for an ordinary edit, which needs no caption. */
export function describeReviewFileChange(file: ReviewPresentedFile): string[] {
  const header = patchHeader(file.patch);
  const added = headerValue(header, "new file mode ") !== null;
  const deleted = headerValue(header, "deleted file mode ") !== null;
  const renamed = file.oldPath !== file.path;
  const notes: string[] = [];
  if (added) notes.push("New file.");
  if (deleted) notes.push("File deleted.");
  if (renamed) {
    // Git states a similarity only when it detected the rename, and states it
    // as 100% when nothing inside the file moved with it.
    const identical = headerValue(header, "similarity index ") === "100%";
    notes.push(identical
      ? `Renamed from ${file.oldPath}, with no change to its contents.`
      : `Renamed from ${file.oldPath}.`);
  }
  /*
   * A patch carries both modes only when they differ, but they are compared
   * anyway rather than trusted to differ by their presence alone.
   */
  const previousMode = headerValue(header, "old mode ");
  const currentMode = headerValue(header, "new mode ");
  if (previousMode && currentMode && previousMode !== currentMode) {
    notes.push(`Mode changed from ${describeMode(previousMode)} to ${describeMode(currentMode)}.`);
  }
  return notes;
}
