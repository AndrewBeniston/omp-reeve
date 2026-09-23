import type { SelectedAttachmentPath } from "./attachment-paths";

export interface PickerAttachment extends SelectedAttachmentPath {
  kind: "file" | "folder";
  readError?: string | null;
}

export interface ComposerAttachmentDescriptor {
  id: number;
  selection: SelectedAttachmentPath;
  name: string;
  kind: "file" | "folder";
  pathSummary: string;
  readError: string | null;
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

export function selectedAttachmentPaths(attachments: ComposerAttachmentDescriptor[]): SelectedAttachmentPath[] {
  return attachments.map(({ selection }) => ({ ...selection }));
}

export function markComposerAttachmentError(
  attachments: ComposerAttachmentDescriptor[],
  error: string,
): ComposerAttachmentDescriptor[] {
  return attachments.map((attachment) => ({ ...attachment, readError: error }));
}
