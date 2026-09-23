export function getAttachmentPicker(): (() => Promise<string[]>) | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: { selectAttachments?: () => Promise<string[]> };
  }).ompDesktop;
  return bridge?.selectAttachments;
}

export function getSecureAttachmentPicker(): (() => Promise<SelectedAttachmentPath[]>) | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: { selectAttachmentsWithCapabilities?: () => Promise<SelectedAttachmentPath[]> };
  }).ompDesktop;
  return bridge?.selectAttachmentsWithCapabilities;
}
import type { SelectedAttachmentPath } from "./attachment-paths";
