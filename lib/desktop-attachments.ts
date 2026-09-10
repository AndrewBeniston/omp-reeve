export function getAttachmentPicker(): (() => Promise<string[]>) | undefined {
  const bridge = (globalThis as unknown as {
    ompDesktop?: { selectAttachments?: () => Promise<string[]> };
  }).ompDesktop;
  return bridge?.selectAttachments;
}
