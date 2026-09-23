import {
  MAX_ATTACHED_IMAGES,
  isBase64ImageWithinLimits,
} from "./image-attachments";
import type { ComposerAttachmentDescriptor } from "./composer-attachment-state";

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

function cloneDraft(draft: ChatDraft): ChatDraft {
  return {
    value: draft.value,
    images: draft.images.map((image) => ({ ...image })),
    ...(draft.attachments?.length ? { attachments: draft.attachments.map((attachment) => ({
      ...attachment,
      selection: { ...attachment.selection },
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
  if (isEmptyDraft(draft)) {
    drafts.delete(key);
    return;
  }
  drafts.set(key, cloneDraft(draft));
}

export function clearDraft(key: string): void {
  drafts.delete(key);
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
  clearDraft(previousKey);
  if (!previous) return next;

  const merged = next
    ? mergeRestoredSubmissionDraft(next.value, next.images, previous.value, previous.images, next.attachments, previous.attachments)
    : previous;
  setDraft(nextKey, merged);
  return cloneDraft(merged);
}
