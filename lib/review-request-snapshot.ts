import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-coding-agent";
import { reviewFilesFromPatch } from "./review-files";
import type { ReviewDiff } from "./review-git";
import type { ReviewedFileSnapshot } from "./review-findings";

/**
 * What a review request was composed against.
 *
 * A model writes a line number against the tree it read, and nothing in its
 * answer says which tree that was. Reeve therefore records the scope itself, at
 * the one moment it can vouch for: when it composes the prompt. A finding is
 * bound to this record, or it is bound to nothing and says so.
 *
 * The record lives under the agent directory, never in the Project, and holds
 * no words of the answer. It is evidence about revisions, not a second copy of
 * the conversation.
 */
const DIRECTORY = "omp-web-review-requests";

/** How many requests one Session keeps. A review supersedes the one before it. */
export const MAX_RETAINED_REVIEW_REQUESTS = 8;

/**
 * What the kept patches may occupy in one record. Above this the record keeps
 * every revision and no patch, so a finding still anchors while the file is
 * unchanged and says "revision-changed" once it is not.
 */
export const REVIEW_REQUEST_SNAPSHOT_BYTE_CAP = 4 * 1024 * 1024;

export interface ReviewRequestSnapshot {
  requestId: string;
  sessionId: string;
  /** The Worktree the request was composed for, exactly as the owner gave it. */
  cwd: string;
  composedAt: string;
  /** The composed prompt, which is how the transcript's turn is recognised. */
  prompt: string;
  files: Record<string, ReviewedFileSnapshot>;
  /** True when the patches were too large to keep and only revisions remain. */
  patchesOmitted?: boolean;
}

/** The files a diff holds, each with its revision and its own patch. */
export function reviewedFilesFromDiff(diff: Pick<ReviewDiff, "patch" | "fileRevisions" | "conflictedFiles">): Record<string, ReviewedFileSnapshot> {
  const files: Record<string, ReviewedFileSnapshot> = {};
  for (const file of reviewFilesFromPatch(diff.patch, diff.conflictedFiles)) {
    const revision = diff.fileRevisions[file.path];
    if (!revision) continue;
    files[file.path] = { revision, patch: file.patch };
  }
  return files;
}

function directoryFor(sessionId: string, agentDir?: string): string {
  return path.join(agentDir ?? getAgentDir(), DIRECTORY, encodeURIComponent(sessionId));
}

/**
 * Record what this request is about to ask for review.
 *
 * Nothing here may stop a review. A record that cannot be written costs the
 * findings their lines, which they then say out loud, and costs the human
 * nothing else, so every failure returns null rather than raising.
 */
export async function recordReviewRequestSnapshot(input: {
  sessionId: string;
  cwd: string;
  prompt: string;
  files: Record<string, ReviewedFileSnapshot>;
  agentDir?: string;
  now?: () => Date;
}): Promise<ReviewRequestSnapshot | null> {
  const requestId = randomUUID();
  const composedAt = (input.now?.() ?? new Date()).toISOString();
  const snapshot: ReviewRequestSnapshot = {
    requestId,
    sessionId: input.sessionId,
    cwd: input.cwd,
    composedAt,
    prompt: input.prompt,
    files: input.files,
  };
  const kept = withinByteCap(snapshot);
  const directory = directoryFor(input.sessionId, input.agentDir);
  const file = path.join(directory, `${composedAt.replace(/[:.]/g, "-")}-${requestId}.json`);
  try {
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(kept), "utf8");
    await rename(temporary, file);
  } catch {
    return null;
  }
  await forgetOldRequests(directory);
  return kept;
}

/** The records this Session kept, oldest first. */
export async function readReviewRequestSnapshots(sessionId: string, agentDir?: string): Promise<ReviewRequestSnapshot[]> {
  const directory = directoryFor(sessionId, agentDir);
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const snapshots: ReviewRequestSnapshot[] = [];
  for (const name of names) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path.join(directory, name), "utf8"));
      const snapshot = checkedSnapshot(parsed);
      // A record naming another Session is not this Session's evidence, however
      // it came to be in this directory.
      if (snapshot && snapshot.sessionId === sessionId) snapshots.push(snapshot);
    } catch {
      continue;
    }
  }
  return snapshots.sort((first, second) => first.composedAt.localeCompare(second.composedAt));
}

/** The record, or the same record with its patches dropped for size. */
function withinByteCap(snapshot: ReviewRequestSnapshot): ReviewRequestSnapshot {
  const bytes = Object.values(snapshot.files).reduce((total, file) => total + (file.patch?.length ?? 0), 0);
  if (bytes <= REVIEW_REQUEST_SNAPSHOT_BYTE_CAP) return snapshot;
  const files: Record<string, ReviewedFileSnapshot> = {};
  for (const [filePath, file] of Object.entries(snapshot.files)) files[filePath] = { revision: file.revision };
  return { ...snapshot, files, patchesOmitted: true };
}

async function forgetOldRequests(directory: string): Promise<void> {
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    for (const name of names.slice(0, Math.max(0, names.length - MAX_RETAINED_REVIEW_REQUESTS))) {
      await rm(path.join(directory, name), { force: true });
    }
  } catch {
    // Retention is housekeeping. Failing it costs disk, never a review.
  }
}

function checkedSnapshot(value: unknown): ReviewRequestSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.requestId !== "string" || typeof record.sessionId !== "string") return null;
  if (typeof record.cwd !== "string" || typeof record.composedAt !== "string") return null;
  if (typeof record.prompt !== "string" || !record.prompt) return null;
  if (typeof record.files !== "object" || record.files === null) return null;
  const files: Record<string, ReviewedFileSnapshot> = {};
  for (const [filePath, file] of Object.entries(record.files as Record<string, unknown>)) {
    if (typeof file !== "object" || file === null) continue;
    const entry = file as Record<string, unknown>;
    if (typeof entry.revision !== "string" || !entry.revision) continue;
    files[filePath] = typeof entry.patch === "string"
      ? { revision: entry.revision, patch: entry.patch }
      : { revision: entry.revision };
  }
  return {
    requestId: record.requestId,
    sessionId: record.sessionId,
    cwd: record.cwd,
    composedAt: record.composedAt,
    prompt: record.prompt,
    files,
    ...(record.patchesOmitted === true ? { patchesOmitted: true } : {}),
  };
}
