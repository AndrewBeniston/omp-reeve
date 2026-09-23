import {
  MAX_ATTACHED_IMAGES,
  isBase64ImageWithinLimits,
} from "./image-attachments";
import { deleteBrowserUpload, type ComposerAttachmentDescriptor } from "./composer-attachment-state";

export interface ChatDraftImage {
  data: string;
  mimeType: string;
}

export interface ChatDraft {
  value: string;
  images: ChatDraftImage[];
  attachments?: ComposerAttachmentDescriptor[];
}

const drafts = new Map<string, ChatDraft>();

function releaseUnownedUploads(draft: ChatDraft | null): void {
  const uploads = draft?.attachments?.flatMap(attachment => attachment.upload ? [attachment.upload] : []) ?? [];
  for (const upload of uploads) {
    const stillOwned = [...drafts.values()].some(current => current.attachments?.some(attachment => (
      attachment.upload?.id === upload.id && attachment.upload.sessionId === upload.sessionId
    )));
    if (!stillOwned) void deleteBrowserUpload(upload.sessionId, upload.id).catch(() => {
      // The server expiry policy handles a failed browser deletion.
    });
  }
}

function cloneDraft(draft: ChatDraft): ChatDraft {
  return {
    value: draft.value,
    images: draft.images.map((image) => ({ ...image })),
    ...(draft.attachments?.length ? { attachments: draft.attachments.map((attachment) => ({
      ...attachment,
      ...(attachment.selection ? { selection: { ...attachment.selection } } : {}),
      ...(attachment.upload ? { upload: { ...attachment.upload } } : {}),
    })) } : {}),
  };
}

function isEmptyDraft(draft: ChatDraft): boolean {
  return !draft.value && draft.images.length === 0 && !draft.attachments?.length;
}

export function getDraft(key: string): ChatDraft | null {
  const draft = drafts.get(key);
  return draft ? cloneDraft(draft) : null;
}

export function setDraft(key: string, draft: ChatDraft): void {
  const previous = drafts.get(key) ?? null;
  if (isEmptyDraft(draft)) {
    drafts.delete(key);
  } else {
    drafts.set(key, cloneDraft(draft));
  }
  releaseUnownedUploads(previous);
}

export function clearDraft(key: string, options: { preserveUploads?: boolean } = {}): void {
  const previous = drafts.get(key) ?? null;
  drafts.delete(key);
  if (!options.preserveUploads) releaseUnownedUploads(previous);
}

export function mergeRestoredSubmissionText(submitted: string, current: string): string {
  if (!submitted.trim()) return current;
  if (!current.trim()) return submitted;
  return `${submitted}\n\n${current}`;
}

export function mergeRestoredSubmissionDraft(
  submittedText: string,
  submittedImages: ChatDraftImage[] | undefined,
  currentText: string,
  currentImages: ChatDraftImage[],
  submittedAttachments?: ComposerAttachmentDescriptor[],
  currentAttachments?: ComposerAttachmentDescriptor[],
): ChatDraft {
  const images = [...(submittedImages ?? []), ...currentImages]
    .filter(isBase64ImageWithinLimits)
    .slice(0, MAX_ATTACHED_IMAGES)
    .map(({ data, mimeType }) => ({ data, mimeType }));

  const attachments = [...(submittedAttachments ?? []), ...(currentAttachments ?? [])];
  return {
    value: mergeRestoredSubmissionText(submittedText, currentText),
    images,
    ...(attachments.length ? { attachments: cloneDraft({ value: "", images: [], attachments }).attachments } : {}),
  };
}

export function restoreDraftSubmission(
  key: string,
  text: string,
  images?: ChatDraftImage[],
  attachments?: ComposerAttachmentDescriptor[],
): ChatDraft {
  const current = getDraft(key) ?? { value: "", images: [] };
  const restored = mergeRestoredSubmissionDraft(
    text,
    images,
    current.value,
    current.images,
    attachments,
    current.attachments,
  );
  setDraft(key, restored);
  return restored;
}

export function rekeyDraft(
  previousKey: string,
  nextKey: string,
  currentDraft?: ChatDraft,
): ChatDraft | null {
  if (previousKey === nextKey) return currentDraft ? cloneDraft(currentDraft) : getDraft(nextKey);

  const storedPrevious = getDraft(previousKey);
  const previous = currentDraft && !isEmptyDraft(currentDraft)
    ? cloneDraft(currentDraft)
    : (storedPrevious ?? (currentDraft ? cloneDraft(currentDraft) : null));
  const next = getDraft(nextKey);
  drafts.delete(previousKey);
  if (!previous) return next;

  const merged = next
    ? mergeRestoredSubmissionDraft(next.value, next.images, previous.value, previous.images, next.attachments, previous.attachments)
    : previous;
  drafts.set(nextKey, cloneDraft(merged));
  releaseUnownedUploads(storedPrevious);
  releaseUnownedUploads(next);
  return cloneDraft(merged);
}
