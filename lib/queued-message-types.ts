export type QueuedMessageKind = "steer" | "followUp";

export interface QueuedMessageItem {
  id: string;
  kind: QueuedMessageKind;
  text: string;
  imageCount: number;
  imagePreview?: string;
}

export interface QueuedMessageSnapshot {
  items: QueuedMessageItem[];
  paused: boolean;
}

export interface QueuedMessageDraft {
  editToken: string;
  id: string;
  kind: QueuedMessageKind;
  text: string;
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
}
