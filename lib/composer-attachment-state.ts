import type { SelectedAttachmentPath } from "./attachment-paths";

export interface PickerAttachment extends SelectedAttachmentPath {
  kind: "file" | "folder";
  readError?: string | null;
}

export interface ComposerAttachmentDescriptor {
  id: number;
  selection?: SelectedAttachmentPath;
  upload?: BrowserUpload & { sessionId: string };
  name: string;
  kind: "file" | "folder";
  pathSummary: string;
  readError: string | null;
  pastedText?: string;
}

export const PASTED_TEXT_THRESHOLD = 5000;

export interface BrowserUpload {
  id: string;
  name: string;
  size: number;
  mediaType: string;
  state: "ready";
}

const uploadKeys = new WeakMap<File, string>();

/** The File object retains its key across a retry within this page. */
export async function uploadBrowserFile(sessionId: string, file: File): Promise<BrowserUpload> {
  let key = uploadKeys.get(file);
  if (!key) {
    key = crypto.randomUUID();
    uploadKeys.set(file, key);
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/uploads`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/octet-stream",
      "idempotency-key": key,
      "x-reeve-file-name": encodeURIComponent(file.name),
      "x-reeve-file-size": String(file.size),
      "x-reeve-media-type": file.type || "application/octet-stream",
    },
    body: file,
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
      ? result.error
      : `Upload failed (${response.status})`;
    throw new Error(message);
  }
  if (!result || typeof result !== "object") throw new Error("Invalid upload response");
  const upload = result as Partial<BrowserUpload>;
  if (typeof upload.id !== "string" || !/^up_[0-9a-f]{32}$/.test(upload.id)
    || upload.name !== file.name || upload.size !== file.size
    || typeof upload.mediaType !== "string" || upload.state !== "ready") {
    throw new Error("Invalid upload response");
  }
  return upload as BrowserUpload;
}

export async function deleteBrowserUpload(sessionId: string, id: string): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/uploads/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok && response.status !== 404) throw new Error(`Upload deletion failed (${response.status})`);
}

export function selectedBrowserUploadIds(attachments: ComposerAttachmentDescriptor[], sessionId: string): string[] {
  return attachments.flatMap(({ upload }) => {
    if (!upload) return [];
    if (upload.sessionId !== sessionId) throw new Error("The upload belongs to another Session");
    return [upload.id];
  });
}

function describePath(path: string): { name: string; pathSummary: string } {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts.at(-1) ?? path;
  const parents = parts.slice(0, -1);
  const pathSummary = parents.length >= 2
    ? `…/${parents.slice(-2).join("/")}`
    : `${path.startsWith("/") ? "/" : ""}${parents.join("/")}`;
  return { name, pathSummary };
}

export function addComposerAttachments(
  current: ComposerAttachmentDescriptor[],
  selections: PickerAttachment[],
): ComposerAttachmentDescriptor[] {
  let nextId = current.reduce((max, attachment) => Math.max(max, attachment.id), 0) + 1;
  return [
    ...current,
    ...selections.map(({ path, issuedAt, signature, kind, readError }) => ({
      id: nextId++,
      selection: { path, issuedAt, signature },
      ...describePath(path),
      kind,
      readError: readError ?? null,
    })),
  ];
}

export function removeComposerAttachment(
  current: ComposerAttachmentDescriptor[],
  id: number,
): ComposerAttachmentDescriptor[] {
  return current.filter((attachment) => attachment.id !== id);
}

export function addPastedTextAttachment(
  current: ComposerAttachmentDescriptor[],
  text: string,
): ComposerAttachmentDescriptor[] {
  const id = current.reduce((max, attachment) => Math.max(max, attachment.id), 0) + 1;
  return [...current, {
    id,
    name: "Pasted text.txt",
    kind: "file",
    pathSummary: "",
    readError: null,
    pastedText: text,
  }];
}

export function pastedTextFromAttachment(attachment: ComposerAttachmentDescriptor): string | null {
  return attachment.pastedText ?? null;
}

export function replacePastedTextAttachment(
  current: ComposerAttachmentDescriptor[],
  id: number,
  upload: BrowserUpload & { sessionId: string },
): ComposerAttachmentDescriptor[] {
  return current.map((attachment) => attachment.id === id ? {
    id,
    upload: { ...upload },
    name: upload.name,
    kind: "file",
    pathSummary: "",
    readError: null,
    pastedText: attachment.pastedText,
  } : attachment);
}

export function selectedAttachmentPaths(attachments: ComposerAttachmentDescriptor[]): SelectedAttachmentPath[] {
  return attachments.flatMap(({ selection }) => selection ? [{ ...selection }] : []);
}

export function addBrowserUpload(
  current: ComposerAttachmentDescriptor[],
  sessionId: string,
  upload: BrowserUpload,
  readError: string | null = null,
): ComposerAttachmentDescriptor[] {
  const id = current.reduce((max, attachment) => Math.max(max, attachment.id), 0) + 1;
  return [...current, {
    id, upload: { ...upload, sessionId }, name: upload.name,
    kind: "file", pathSummary: "", readError,
  }];
}

export function markComposerAttachmentError(
  attachments: ComposerAttachmentDescriptor[],
  error: string,
): ComposerAttachmentDescriptor[] {
  return attachments.map((attachment) => ({ ...attachment, readError: error }));
}
