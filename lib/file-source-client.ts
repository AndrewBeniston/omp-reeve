import type { FileSourceRead } from "./file-source-limits";
import type { AutosaveResult } from "./file-source-autosave";
import type { ExternalEditorListing } from "./external-editor-registry";

/**
 * The browser's side of the file-source routes.
 *
 * Every import here is from a module with no filesystem code in it, so the
 * limits and the shapes have one definition and nothing drags `node:fs` into
 * the browser bundle.
 */

export type FileSourceLoad = FileSourceRead | { status: "error"; message: string };

export async function fetchFileSource(filePath: string, signal?: AbortSignal): Promise<FileSourceLoad> {
  try {
    const response = await fetch(`/api/file-source?path=${encodeURIComponent(filePath)}`, { signal });
    const body = await response.json() as FileSourceRead & { error?: string };
    if (!response.ok) return { status: "error", message: body.error ?? "This file could not be read." };
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { status: "error", message: "This file could not be read." };
  }
}

/**
 * What one save means to the editor waiting on it.
 *
 * Separate from the request so the same reading applies wherever a save
 * outcome comes from, and so it can be exercised against a real file rather
 * than only against a fetch.
 */
export function autosaveResultFrom(ok: boolean, body: Record<string, unknown>): AutosaveResult {
  if (!ok) return { outcome: "failed", message: typeof body.error === "string" ? body.error : "This file could not be saved." };
  if (body.outcome === "saved" && typeof body.mtimeMs === "number") return { outcome: "saved", mtimeMs: body.mtimeMs };
  /*
   * A conflict comes back with the disk's own text. A conflict whose text
   * could not be read is reported as a failure instead: merging against
   * nothing would silently discard whatever the other writer did.
   */
  const disk = body.disk as { status?: string; content?: string; mtimeMs?: number } | undefined;
  if (body.outcome === "conflict" && disk?.status === "ready" && typeof disk.content === "string" && typeof disk.mtimeMs === "number") {
    return { outcome: "conflict", content: disk.content, mtimeMs: disk.mtimeMs };
  }
  return { outcome: "failed", message: "This file changed on disk and could not be read back." };
}

export async function saveFileSourceContent(filePath: string, content: string, expectedMtimeMs: number): Promise<AutosaveResult> {
  try {
    const response = await fetch("/api/file-source", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content, expectedMtimeMs }),
    });
    return autosaveResultFrom(response.ok, await response.json() as Record<string, unknown>);
  } catch {
    return { outcome: "failed", message: "This file could not be saved." };
  }
}

export async function fetchExternalEditors(filePath: string, signal?: AbortSignal): Promise<ExternalEditorListing | null> {
  try {
    const response = await fetch(`/api/external-editors?path=${encodeURIComponent(filePath)}`, { signal });
    if (!response.ok) return null;
    return await response.json() as ExternalEditorListing;
  } catch {
    return null;
  }
}

/**
 * Open a file in one application. Review never persists the choice, which is
 * why nothing here offers to: picking an application in a review menu is about
 * this one reading.
 */
export async function openInExternalEditor(filePath: string, targetId: string, line?: number): Promise<string | null> {
  try {
    const response = await fetch("/api/external-editors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, targetId, line }),
    });
    if (response.ok) return null;
    const body = await response.json().catch(() => ({})) as { error?: string };
    return body.error ?? "That application could not be opened.";
  } catch {
    return "That application could not be opened.";
  }
}
