/**
 * What may be read, what may be edited, and how a file is judged to be text.
 *
 * Separate from `file-source.ts` because the browser needs these numbers and
 * these shapes, and that module touches the filesystem. A client component
 * importing a value from a module that imports `node:fs/promises` breaks the
 * build outright, so the boundary is a file, not a convention.
 *
 * Every value is a shipped reference value recorded under R2 in
 * `docs/research/review-reference.md`.
 */

/** Past this, the file is not read at all. */
export const FILE_SOURCE_READ_LIMIT = 20 * 1024 * 1024;

/** Past this, the file is read but never offered for editing. */
export const FILE_SOURCE_EDITABLE_LIMIT = 10 * 1024 * 1024;

/** How much of the start of a file decides whether it is text. */
export const FILE_SOURCE_SNIFF_BYTES = 4096;

export type FileSourceRead =
  | { status: "ready"; content: string; sizeBytes: number; mtimeMs: number; readOnly: boolean }
  | { status: "too-large"; sizeBytes: number; limitBytes: number }
  | { status: "binary"; sizeBytes: number }
  | { status: "unavailable" };

export type FileSourceSave =
  | { outcome: "saved"; mtimeMs: number; sizeBytes: number }
  | { outcome: "conflict"; disk: FileSourceRead }
  | { outcome: "too-large"; limitBytes: number }
  /**
   * The write failed and putting the original back failed too. The old bytes
   * are on disk at `recoveryPath`. Distinct from `unavailable` on purpose:
   * one means nothing happened, this one means something did.
   */
  | { outcome: "damaged"; recoveryPath: string }
  | { outcome: "unavailable" };
