import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, rename, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";
import {
  FILE_SOURCE_EDITABLE_LIMIT,
  FILE_SOURCE_READ_LIMIT,
  FILE_SOURCE_SNIFF_BYTES,
  type FileSourceRead,
  type FileSourceSave,
} from "./file-source-limits";

/**
 * Reading and writing one file's whole text, for the source view beside a
 * diff.
 *
 * Server-only. The thresholds and the shapes live in `file-source-limits.ts`,
 * which the browser can import: a read is refused outright past 20 MiB, a file
 * past 10 MiB opens read-only, and whether a file is text is decided by
 * sampling its first 4096 bytes rather than by its suffix.
 *
 * The generic file preview refuses anything past 256 KiB, which is why a
 * reviewed file needs its own reader: a 400 KiB source file is ordinary, and
 * the route into it from a review is the one place a human is certain to want
 * to read past a diff that was too large to draw.
 */

/**
 * A handle on the file itself, never on a name.
 *
 * `O_NOFOLLOW` refuses a symlink at open, and the identity check afterwards
 * refuses the case the flag cannot cover: the path being replaced between the
 * caller naming it and this opening it. Both matter because the path arrives
 * from a browser, and because the write side of this module truncates whatever
 * it holds.
 *
 * It is the last component that is tested, not the whole path. A parent
 * directory being a symlink is ordinary — on macOS every temporary directory
 * is one, and so is any project kept behind one — and refusing those would
 * refuse files a human can plainly see.
 */
async function openFileItself(absolutePath: string, flags: number) {
  const named = await lstat(absolutePath);
  if (named.isSymbolicLink() || !named.isFile()) throw new Error("Not a file");
  const handle = await open(absolutePath, flags | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    // The same file the name was checked on, and not one swapped in since.
    if (!stat.isFile() || named.dev !== stat.dev || named.ino !== stat.ino) {
      throw new Error("File identity changed");
    }
    return { handle, stat };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * Whether a buffer is text, decided the way the reference decides it: a NUL
 * byte within the first 4096 bytes, and nothing else. A suffix test would call
 * an extensionless script binary and a `.ts` video file text.
 */
function looksLikeText(sample: Uint8Array): boolean {
  return !sample.subarray(0, FILE_SOURCE_SNIFF_BYTES).includes(0);
}

function decodeText(buffer: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

/** Raised when the file moved while it was being read, so the read is worthless. */
const MOVED = Symbol("moved");

/** How many times a read is retried before the file is called unavailable. */
const READ_ATTEMPTS = 3;

/**
 * One reading of the file, or `MOVED` if it changed under us.
 *
 * The modification time returned here is what a later save is checked against,
 * so it has to belong to the bytes returned beside it. A file being appended
 * to while it is read would otherwise hand back short content stamped with the
 * time of the longer file — and the save that followed would overwrite the
 * rest of it without ever reporting a conflict.
 */
async function readOnce(absolutePath: string): Promise<FileSourceRead | typeof MOVED> {
  let opened;
  try {
    opened = await openFileItself(absolutePath, constants.O_RDONLY);
  } catch {
    return { status: "unavailable" };
  }
  const { handle, stat } = opened;
  try {
    const sizeBytes = stat.size;
    if (sizeBytes > FILE_SOURCE_READ_LIMIT) {
      return { status: "too-large", sizeBytes, limitBytes: FILE_SOURCE_READ_LIMIT };
    }
    const buffer = Buffer.alloc(sizeBytes);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await handle.stat();
    if (length !== sizeBytes || after.size !== sizeBytes || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino) {
      return MOVED;
    }
    const read = buffer.subarray(0, length);
    if (!looksLikeText(read)) return { status: "binary", sizeBytes };
    const content = decodeText(read);
    // Text that is not UTF-8 is binary for every purpose this view has: it
    // cannot be shown faithfully, and it certainly cannot be written back.
    if (content === null) return { status: "binary", sizeBytes };
    return {
      status: "ready",
      content,
      sizeBytes: length,
      mtimeMs: after.mtimeMs,
      readOnly: sizeBytes > FILE_SOURCE_EDITABLE_LIMIT,
    };
  } catch {
    return { status: "unavailable" };
  } finally {
    await handle.close();
  }
}

/**
 * One file's whole text, with the limits that decide how it may be shown.
 *
 * A file that keeps moving is reported as unavailable rather than read a
 * fourth time: something is writing it continuously, and no reading of it
 * would be safe to edit from.
 */
export async function readFileSource(absolutePath: string): Promise<FileSourceRead> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    const result = await readOnce(absolutePath);
    if (result !== MOVED) return result;
  }
  return { status: "unavailable" };
}

/**
 * Write a file back, but only over the version the editor started from — and
 * never in a way that can leave the file holding half of each text.
 *
 * The modification time the caller read is the guard, and a mismatch returns
 * the disk's own text rather than an error: what to do about somebody else's
 * change is a decision for the merge, not for this.
 *
 * An ordinary file is replaced rather than overwritten. The new text is
 * written beside it, given the original's permissions, checked once more
 * against the file it is about to replace, and renamed over it. A failure
 * anywhere in that leaves the original exactly as it was, because nothing has
 * touched it.
 *
 * A file with more than one link is written in place instead: renaming over
 * the name would leave every other link on the old text, which is the one
 * thing a hard link exists to prevent. Its original bytes are written beside
 * it first, so a failure puts them back and a crash leaves them to recover
 * from.
 */
export async function saveFileSource(absolutePath: string, content: string, expectedMtimeMs: number): Promise<FileSourceSave> {
  const written = await writeIfUnchanged(absolutePath, content, expectedMtimeMs);
  // The disk's own text is read once nothing is holding the file, so the read
  // is never racing the write that just refused.
  return written.outcome === "conflict"
    ? { outcome: "conflict", disk: await readFileSource(absolutePath) }
    : written;
}

/** Every byte, or a thrown error. A single write may satisfy only part of one. */
async function writeWhole(handle: FileHandle, bytes: Buffer): Promise<void> {
  let written = 0;
  while (written < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, written, bytes.length - written, written);
    if (!bytesWritten) throw new Error("Write stalled");
    written += bytesWritten;
  }
}

async function readWhole(handle: FileHandle, size: number): Promise<Buffer> {
  const buffer = Buffer.alloc(size);
  let length = 0;
  while (length < buffer.length) {
    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
    if (!bytesRead) break;
    length += bytesRead;
  }
  if (length !== size) throw new Error("Short read");
  return buffer;
}

/**
 * A new file beside the target, carrying these bytes.
 *
 * Beside it on purpose: the same directory is the same filesystem, which is
 * what lets the rename below be atomic. The name is hidden and unique so that
 * two saves, or a save and something else entirely, cannot collide.
 */
async function writeBeside(absolutePath: string, bytes: Buffer, mode: number): Promise<string> {
  const temporary = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
  try {
    await writeWhole(handle, bytes);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await discard(temporary);
    throw error;
  }
  await handle.close();
  return temporary;
}

async function discard(temporary: string): Promise<void> {
  await unlink(temporary).catch(() => {});
}

async function writeIfUnchanged(absolutePath: string, content: string, expectedMtimeMs: number): Promise<FileSourceSave> {
  const bytes = Buffer.from(content, "utf8");
  if (bytes.length > FILE_SOURCE_EDITABLE_LIMIT) {
    return { outcome: "too-large", limitBytes: FILE_SOURCE_EDITABLE_LIMIT };
  }
  let opened;
  try {
    opened = await openFileItself(absolutePath, constants.O_RDONLY);
  } catch {
    return { outcome: "unavailable" };
  }
  const { handle, stat } = opened;
  let original: Buffer | null = null;
  try {
    // A file already past the editable limit is read-only however it was
    // opened; the browser is not the only thing that can have changed since.
    if (stat.size > FILE_SOURCE_EDITABLE_LIMIT) return { outcome: "unavailable" };
    if (stat.mtimeMs !== expectedMtimeMs) return { outcome: "conflict", disk: { status: "unavailable" } };
    // Only the file that will be written in place needs its old bytes kept.
    if (stat.nlink > 1) original = await readWhole(handle, stat.size);
  } catch {
    return { outcome: "unavailable" };
  } finally {
    await handle.close();
  }
  return original ? writeInPlace(absolutePath, bytes, original, stat) : replaceAtomically(absolutePath, bytes, stat);
}

async function replaceAtomically(absolutePath: string, bytes: Buffer, before: Stats): Promise<FileSourceSave> {
  let temporary: string;
  try {
    temporary = await writeBeside(absolutePath, bytes, before.mode & 0o7777);
  } catch {
    // Nothing has touched the original, so there is nothing to put back.
    return { outcome: "unavailable" };
  }
  try {
    /*
     * One last look at what is being replaced, as late as it can be taken. A
     * rename cannot be made conditional, so this is what keeps the save from
     * taking over a name somebody else has since put a different file at.
     */
    const named = await lstat(absolutePath);
    if (named.isSymbolicLink() || !named.isFile() || named.dev !== before.dev
      || named.ino !== before.ino || named.mtimeMs !== before.mtimeMs) {
      await discard(temporary);
      return { outcome: "conflict", disk: { status: "unavailable" } };
    }
    await rename(temporary, absolutePath);
  } catch {
    await discard(temporary);
    return { outcome: "unavailable" };
  }
  const after = await lstat(absolutePath).catch(() => null);
  return after
    ? { outcome: "saved", mtimeMs: after.mtimeMs, sizeBytes: bytes.length }
    : { outcome: "unavailable" };
}

async function writeInPlace(absolutePath: string, bytes: Buffer, original: Buffer, before: Stats): Promise<FileSourceSave> {
  let recovery: string;
  try {
    recovery = await writeBeside(absolutePath, original, before.mode & 0o7777);
  } catch {
    // Without somewhere to put the old text, this write is not safe to start.
    return { outcome: "unavailable" };
  }
  let opened;
  try {
    opened = await openFileItself(absolutePath, constants.O_WRONLY);
  } catch {
    await discard(recovery);
    return { outcome: "unavailable" };
  }
  const { handle, stat } = opened;
  try {
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.mtimeMs !== before.mtimeMs) {
      await discard(recovery);
      return { outcome: "conflict", disk: { status: "unavailable" } };
    }
    await writeWhole(handle, bytes);
    await handle.truncate(bytes.length);
    await handle.sync();
    const after = await handle.stat();
    await discard(recovery);
    return { outcome: "saved", mtimeMs: after.mtimeMs, sizeBytes: bytes.length };
  } catch {
    try {
      // Put the original back through the same handle, so the file the bytes
      // were taken out of is the file they go back into.
      await writeWhole(handle, original);
      await handle.truncate(original.length);
      await handle.sync();
      await discard(recovery);
      return { outcome: "unavailable" };
    } catch {
      /*
       * The write failed and so did putting it back. The file is not what it
       * was and not what was asked for, and saying "unavailable" here would
       * describe losing somebody's work as a failure to do anything. The old
       * bytes are still beside it, and the caller is told exactly where.
       */
      return { outcome: "damaged", recoveryPath: recovery };
    }
  } finally {
    await handle.close();
  }
}
