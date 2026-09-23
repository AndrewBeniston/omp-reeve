export function getAttachmentPicker(): (() => Promise<string[]>) | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: { selectAttachments?: () => Promise<string[]> };
  }).ompDesktop;
  return bridge?.selectAttachments;
}

export function getSecureAttachmentPicker(): (() => Promise<PickerAttachment[]>) | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: { selectAttachmentsWithCapabilities?: () => Promise<PickerAttachment[]> };
  }).ompDesktop;
  return bridge?.selectAttachmentsWithCapabilities;
}
import type { PickerAttachment } from "./composer-attachment-state";
