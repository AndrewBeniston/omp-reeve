import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import { generateFileMentionMessages } from "@oh-my-pi/pi-coding-agent/utils/file-mentions";
import type { FileMentionMessage } from "@oh-my-pi/pi-coding-agent/session/messages";

export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_SESSION_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_GLOBAL_BYTES = 2 * 1024 * 1024 * 1024;
/** An upload without a saved Session reference expires after one day without a retry. */
export const UPLOAD_ABANDONED_TTL_MS = 24 * 60 * 60 * 1000;
/** An upload claim without a persisted Session message expires under the same one-day policy. */
export const UPLOAD_CLAIM_TTL_MS = UPLOAD_ABANDONED_TTL_MS;

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_ID = /^up_[0-9a-f]{32}$/;
const IDEMPOTENCY_KEY = SESSION_ID;
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

export interface BrowserUpload {
  id: string;
  name: string;
  size: number;
  mediaType: string;
  state: "ready";
}

interface StoredUpload extends BrowserUpload {
  sessionId: string;
  key: string;
  createdAt?: number;
  lastAttemptAt?: number;
  savedAt?: number;
  claimedAt?: number;
}

export interface UploadInput {
  sessionId: string;
  key: string;
  name: string;
  size: number;
  mediaType: string;
  body: ReadableStream<Uint8Array>;
  root?: string;
}

export class UploadError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "UploadError";
  }
}

export function browserUploadRoot(): string {
  return join(getAgentDir(), "browser-uploads");
}

export function validateSessionId(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) throw new UploadError("Invalid Session id", 400);
}

export function validateUploadId(id: string): void {
  if (!UPLOAD_ID.test(id)) throw new UploadError("Invalid upload id", 400);
}

function validateInput(input: UploadInput): void {
  validateSessionId(input.sessionId);
  if (!IDEMPOTENCY_KEY.test(input.key)) throw new UploadError("Invalid idempotency key", 400);
  if (!input.name || input.name === "." || input.name === ".."
    || /[/\\\x00-\x1f\x7f]/.test(input.name)
    || Buffer.byteLength(input.name, "utf8") > 255) {
    throw new UploadError("Invalid file name", 400);
  }
  if (!MEDIA_TYPE.test(input.mediaType) || input.mediaType.length > 127) {
    throw new UploadError("Invalid media type", 400);
  }
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    throw new UploadError("Invalid file size", 400);
  }
  if (input.size > MAX_UPLOAD_FILE_BYTES) throw new UploadError("File is too large", 413);
  if (!input.body || typeof input.body.getReader !== "function") {
    throw new UploadError("A file body is required", 400);
  }
}

function publicUpload(record: StoredUpload): BrowserUpload {
  return {
    id: record.id,
    name: record.name,
    size: record.size,
    mediaType: record.mediaType,
    state: record.state,
  };
}

function isStoredUpload(value: unknown): value is StoredUpload {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredUpload>;
  return typeof item.id === "string" && UPLOAD_ID.test(item.id)
    && typeof item.sessionId === "string" && SESSION_ID.test(item.sessionId)
    && typeof item.key === "string" && IDEMPOTENCY_KEY.test(item.key)
    && typeof item.name === "string" && item.name.length > 0
    && typeof item.size === "number" && Number.isSafeInteger(item.size) && item.size >= 0
    && typeof item.mediaType === "string" && MEDIA_TYPE.test(item.mediaType)
    && [item.createdAt, item.lastAttemptAt, item.savedAt, item.claimedAt]
      .every(timestamp => timestamp === undefined || (Number.isSafeInteger(timestamp) && timestamp >= 0))
    && item.state === "ready";
}

async function writeRecord(filePath: string, record: StoredUpload): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  const file = await open(temporaryPath, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(record));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporaryPath, filePath);
}

async function readRecord(filePath: string): Promise<StoredUpload | null> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new UploadError("Upload record is damaged", 500);
  }
  if (!isStoredUpload(parsed)) throw new UploadError("Upload record is damaged", 500);
  return parsed;
}

async function findSessionFile(sessionId: string, root?: string): Promise<string | null> {
  const agentDir = getAgentDir();
  const searchDirs = [
    join(agentDir, "sessions"),
    agentDir,
    ...(root ? [join(root, ".."), root] : []),
  ];
  for (const base of searchDirs) {
    try {
      const entries = await readdir(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          if (entry.name.endsWith(`_${sessionId}.jsonl`)) return join(base, entry.name);
          if (entry.name === "session.jsonl") {
            const firstLine = (await readFile(join(base, entry.name), "utf8")).split("\n")[0];
            try {
              const parsed = JSON.parse(firstLine);
              if (parsed?.id === sessionId) return join(base, entry.name);
            } catch {}
          }
        } else if (entry.isDirectory()) {
          try {
            const subfiles = await readdir(join(base, entry.name));
            const match = subfiles.find(f => f.endsWith(`_${sessionId}.jsonl`));
            if (match) return join(base, entry.name, match);
          } catch {}
        }
      }
    } catch {}
  }
  return null;
}

async function checkPersistedMessage(sessionId: string, uploadId: string, root?: string): Promise<boolean> {
  const filePath = await findSessionFile(sessionId, root);
  if (!filePath) return false;
  try {
    const content = await readFile(filePath, "utf8");
    return content.includes(`browser-upload:${uploadId}/`);
  } catch {
    return false;
  }
}

interface Inventory {
  recordsBySession: Map<string, StoredUpload[]>;
  bytesBySession: Map<string, number>;
  globalBytes: number;
}

/** The lock excludes active writers, so every partial file found here survived a failed upload or process exit. */
async function recoverAndInventory(root: string, options: {
  now?: number;
  retry?: { sessionId: string; key: string };
  sessionExists?: (sessionId: string) => Promise<boolean>;
  hasPersistedMessage?: (sessionId: string, uploadId: string) => Promise<boolean> | boolean;
} = {}): Promise<Inventory> {
  const now = options.now ?? Date.now();
  const inventory: Inventory = {
    recordsBySession: new Map(), bytesBySession: new Map(), globalBytes: 0,
  };
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || !SESSION_ID.test(directory.name)) continue;
    const sessionId = directory.name;
    const sessionDirectory = join(root, sessionId);
    if (options.sessionExists && !await options.sessionExists(sessionId)) {
      await rm(sessionDirectory, { recursive: true, force: true });
      continue;
    }
    const entries = await readdir(sessionDirectory, { withFileTypes: true });
    const blobNames = new Set(entries.filter(entry => entry.isFile() && entry.name.endsWith(".blob")).map(entry => entry.name));
    const records: StoredUpload[] = [];
    let sessionBytes = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = join(sessionDirectory, entry.name);
      if (entry.name.endsWith(".part") || entry.name.endsWith(".tmp")) {
        await rm(filePath, { force: true });
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      const record = await readRecord(filePath);
      if (!record || record.sessionId !== sessionId || `${record.id}.json` !== entry.name) {
        throw new UploadError("Upload record is damaged", 500);
      }
      const blobName = `${record.id}.blob`;
      if (!blobNames.has(blobName)) {
        await rm(filePath, { force: true });
        continue;
      }
      const blob = await stat(join(sessionDirectory, blobName));
      if (blob.size !== record.size) throw new UploadError("Upload record is damaged", 500);
      blobNames.delete(blobName);
      const lastAttemptAt = record.lastAttemptAt ?? record.createdAt ?? (await stat(filePath)).mtimeMs;
      const retrying = options.retry?.sessionId === sessionId && options.retry.key === record.key;
      const claimTimestamp = record.claimedAt ?? record.savedAt;
      if (!claimTimestamp && !retrying && now - lastAttemptAt >= UPLOAD_ABANDONED_TTL_MS) {
        await Promise.all([rm(filePath, { force: true }), rm(join(sessionDirectory, blobName), { force: true })]);
        continue;
      }
      if (claimTimestamp && !retrying && now - claimTimestamp >= UPLOAD_CLAIM_TTL_MS) {
        const hasPersisted = options.hasPersistedMessage
          ? await options.hasPersistedMessage(sessionId, record.id)
          : await checkPersistedMessage(sessionId, record.id, root);
        if (!hasPersisted) {
          await Promise.all([rm(filePath, { force: true }), rm(join(sessionDirectory, blobName), { force: true })]);
          continue;
        }
      }
      records.push(record);
      sessionBytes += record.size;
    }
    for (const orphan of blobNames) await rm(join(sessionDirectory, orphan), { force: true });
    inventory.recordsBySession.set(sessionId, records);
    inventory.bytesBySession.set(sessionId, sessionBytes);
    inventory.globalBytes += sessionBytes;
  }
  return inventory;
}

async function withLockedRoot<T>(root: string, action: () => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(root, {
    stale: 10_000,
    update: 3_000,
    retries: { retries: 50, minTimeout: 200, maxTimeout: 200 },
  });
  try {
    return await action();
  } finally {
    await release();
  }
}

async function writeBody(body: ReadableStream<Uint8Array>, filePath: string, expectedSize: number): Promise<void> {
  const file = await open(filePath, "wx", 0o600);
  const reader = body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedSize) throw new UploadError("File exceeds its declared size", 413);
      let offset = 0;
      while (offset < value.byteLength) {
        const result = await file.write(value, offset, value.byteLength - offset);
        if (result.bytesWritten === 0) throw new Error("Could not write upload");
        offset += result.bytesWritten;
      }
    }
    if (received !== expectedSize) throw new UploadError("File size does not match its declaration", 400);
    await file.sync();
  } finally {
    reader.releaseLock();
    await file.close();
  }
}

/** Store one raw browser file. A stable key makes retries return the same record. */
export async function storeBrowserUpload(input: UploadInput): Promise<BrowserUpload> {
  validateInput(input);
  const root = input.root ?? browserUploadRoot();
  return withLockedRoot(root, async () => {
    const inventory = await recoverAndInventory(root, {
      retry: { sessionId: input.sessionId, key: input.key },
    });
    const records = inventory.recordsBySession.get(input.sessionId) ?? [];
    const existing = records.find(record => record.key === input.key);
    if (existing) {
      if (existing.name !== input.name || existing.size !== input.size || existing.mediaType !== input.mediaType) {
        throw new UploadError("Idempotency key belongs to another file", 409);
      }
      await writeRecord(join(root, input.sessionId, `${existing.id}.json`), {
        ...existing,
        lastAttemptAt: Date.now(),
      });
      return publicUpload(existing);
    }
    if ((inventory.bytesBySession.get(input.sessionId) ?? 0) + input.size > MAX_UPLOAD_SESSION_BYTES) {
      throw new UploadError("Session upload quota exceeded", 413);
    }
    if (inventory.globalBytes + input.size > MAX_UPLOAD_GLOBAL_BYTES) {
      throw new UploadError("Global upload quota exceeded", 413);
    }

    const sessionDirectory = join(root, input.sessionId);
    await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
    let id: string;
    do {
      id = `up_${randomBytes(16).toString("hex")}`;
    } while (records.some(record => record.id === id));
    const partialPath = join(sessionDirectory, `${id}.part`);
    const blobPath = join(sessionDirectory, `${id}.blob`);
    const recordPath = join(sessionDirectory, `${id}.json`);
    const temporaryRecordPath = `${recordPath}.tmp`;
    try {
      await writeBody(input.body, partialPath, input.size);
      await rename(partialPath, blobPath);
      const now = Date.now();
      const record: StoredUpload = {
        id, sessionId: input.sessionId, key: input.key,
        name: input.name, size: input.size, mediaType: input.mediaType, state: "ready",
        createdAt: now, lastAttemptAt: now,
      };
      await writeRecord(recordPath, record);
      return publicUpload(record);
    } catch (error) {
      await Promise.all([
        rm(partialPath, { force: true }),
        rm(blobPath, { force: true }),
        rm(temporaryRecordPath, { force: true }),
      ]);
      throw error;
    }
  });
}

/** Release one draft upload. A saved Session reference prevents deletion. */
export async function releaseBrowserUpload({ sessionId, id, root = browserUploadRoot() }: {
  sessionId: string; id: string; root?: string;
}): Promise<boolean> {
  validateSessionId(sessionId);
  validateUploadId(id);
  return withLockedRoot(root, async () => {
    const directory = join(root, sessionId);
    const recordPath = join(directory, `${id}.json`);
    const record = await readRecord(recordPath);
    if (!record || record.sessionId !== sessionId || record.id !== id || record.savedAt || record.claimedAt) return false;
    await rm(recordPath, { force: true });
    await rm(join(directory, `${id}.blob`), { force: true });
    return true;
  });
}

/** Claim uploads before a user message enters OMP, under the same lock as deletion and collection. */
export async function retainBrowserUploads({ sessionId, ids, root = browserUploadRoot() }: {
  sessionId: string; ids: string[]; root?: string;
}): Promise<Array<{ upload: BrowserUpload; filePath: string }>> {
  validateSessionId(sessionId);
  if (!Array.isArray(ids) || ids.length > 32) throw new UploadError("Too many uploads", 400);
  if (ids.some(id => typeof id !== "string")) throw new UploadError("Invalid upload id", 400);
  ids.forEach(validateUploadId);
  return withLockedRoot(root, async () => {
    const inventory = await recoverAndInventory(root);
    const records = inventory.recordsBySession.get(sessionId) ?? [];
    const selected = ids.map(id => {
      const record = records.find(item => item.id === id);
      if (!record) throw new UploadError("Upload not found", 404);
      return record;
    });
    const savedAt = Date.now();
    for (const record of selected) {
      if (!record.savedAt || !record.claimedAt) {
        await writeRecord(join(root, sessionId, `${record.id}.json`), {
          ...record,
          savedAt: record.savedAt ?? savedAt,
          claimedAt: record.claimedAt ?? record.savedAt ?? savedAt,
        });
      }
    }
    return selected.map(record => ({ upload: publicUpload(record), filePath: join(root, sessionId, `${record.id}.blob`) }));
  });
}

/** Convert saved browser uploads to the file context OMP accepts with a user message. */
export async function prepareBrowserUploadMessages({ sessionId, ids, cwd, root }: {
  sessionId: string; ids: unknown; cwd: string; root?: string;
}): Promise<FileMentionMessage[]> {
  if (ids === undefined) return [];
  if (!Array.isArray(ids)) throw new UploadError("Uploads must be a list", 400);
  const selected = await retainBrowserUploads({ sessionId, ids, root });
  const messages: FileMentionMessage[] = [];
  for (const { upload, filePath } of selected) {
    const prepared = await generateFileMentionMessages([filePath], cwd);
    const mention = prepared.find((message): message is FileMentionMessage => message.role === "fileMention");
    if (!mention || mention.files.length !== 1) throw new UploadError("Upload cannot be read", 400);
    messages.push({
      ...mention,
      files: mention.files.map(file => ({
        ...file,
        path: `browser-upload:${upload.id}/${upload.name}`,
        content: `Uploaded file: ${upload.name} (${upload.mediaType})\n${file.content}`,
      })),
    });
  }
  return messages;
}

/** Delete a Session's uploads after the Session file has been removed. */
export async function deleteSessionBrowserUploads({ sessionId, root = browserUploadRoot() }: {
  sessionId: string; root?: string;
}): Promise<void> {
  validateSessionId(sessionId);
  await withLockedRoot(root, () => rm(join(root, sessionId), { recursive: true, force: true }));
}

/** Repair interrupted writes and remove abandoned uploads during server startup or later maintenance. */
export async function collectBrowserUploads({ root = browserUploadRoot(), now = Date.now(), sessionExists, hasPersistedMessage }: {
  root?: string;
  now?: number;
  sessionExists?: (sessionId: string) => Promise<boolean>;
  hasPersistedMessage?: (sessionId: string, uploadId: string) => Promise<boolean> | boolean;
} = {}): Promise<void> {
  await withLockedRoot(root, async () => {
    await recoverAndInventory(root, { now, sessionExists, hasPersistedMessage });
  });
}

/** Resolve an opaque id only inside its Session. The server may use filePath; responses must use upload alone. */
export async function findBrowserUpload({ sessionId, id, root = browserUploadRoot() }: {
  sessionId: string; id: string; root?: string;
}): Promise<{ upload: BrowserUpload; filePath: string } | null> {
  validateSessionId(sessionId);
  validateUploadId(id);
  const directory = join(root, sessionId);
  const record = await readRecord(join(directory, `${id}.json`));
  if (!record || record.sessionId !== sessionId || record.id !== id) return null;
  const filePath = join(directory, `${id}.blob`);
  try {
    const blob = await stat(filePath);
    if (!blob.isFile() || blob.size !== record.size) return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return { upload: publicUpload(record), filePath };
}
