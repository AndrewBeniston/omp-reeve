export type ComposerAttachmentLayout = "card" | "icon";

export const COMPOSER_PLAIN_TEXT_MODE_SETTING_PATH = "web.composer-plain-text-mode";
export const COMPOSER_PLAIN_TEXT_MODE_STORAGE_KEY = "reeve-composer-plain-text-mode";
export const COMPOSER_ATTACHMENT_LAYOUT_SETTING_PATH = "web.composer-attachment-layout";
export const COMPOSER_ATTACHMENT_LAYOUT_STORAGE_KEY = "reeve-composer-attachment-layout";
export const COMPOSER_TOP_INSET_SETTING_PATH = "web.composer-top-inset";
export const COMPOSER_TOP_INSET_STORAGE_KEY = "reeve-composer-top-inset";

export const DEFAULT_COMPOSER_PLAIN_TEXT_MODE = false;
export const DEFAULT_COMPOSER_ATTACHMENT_LAYOUT: ComposerAttachmentLayout = "card";
export const DEFAULT_COMPOSER_TOP_INSET_PX = 0;

export function readComposerPlainTextMode(value: string | null): boolean {
  return value === "true";
}

export function readComposerAttachmentLayout(value: string | null): ComposerAttachmentLayout {
  return value === "icon" ? "icon" : DEFAULT_COMPOSER_ATTACHMENT_LAYOUT;
}

export function readComposerTopInsetPx(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return DEFAULT_COMPOSER_TOP_INSET_PX;
  const inset = Number(value);
  return Number.isSafeInteger(inset) && inset <= 64 ? inset : DEFAULT_COMPOSER_TOP_INSET_PX;
}
