import type { PickerAttachment } from "./composer-attachment-state";

export function getAttachmentPicker(): (() => Promise<string[]>) | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: { selectAttachments?: () => Promise<string[]> };
  }).ompDesktop;
  return bridge?.selectAttachments;
}

export type SecureAttachmentPicker = ((kind?: "file" | "folder") => Promise<PickerAttachment[]>) & {
  selectFiles?: () => Promise<PickerAttachment[]>;
  selectFolder?: () => Promise<PickerAttachment[]>;
};

export function getSecureAttachmentPicker(): SecureAttachmentPicker | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: {
      selectAttachmentsWithCapabilities?: (kind?: "file" | "folder") => Promise<PickerAttachment[]>;
    };
  }).ompDesktop;
  const selectAttachments = bridge?.selectAttachmentsWithCapabilities;
  if (!selectAttachments) return undefined;
  const picker = selectAttachments as SecureAttachmentPicker;
  picker.selectFiles = () => selectAttachments("file");
  picker.selectFolder = () => selectAttachments("folder");
  return picker;
}
