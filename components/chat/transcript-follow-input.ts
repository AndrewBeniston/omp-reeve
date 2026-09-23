import type { TranscriptFollowInput } from "@/lib/transcript-follow";

type Direction = NonNullable<TranscriptFollowInput["userIntent"]>["direction"];
export type ScrollIntent = { direction: Direction; at: number };

export function selectScrollIntent(
  intent: ScrollIntent | null,
  programmaticScrollAt: number,
  now: number,
): ScrollIntent | null {
  if (now - programmaticScrollAt < 700 && (!intent || intent.at < programmaticScrollAt)) return null;
  return intent;
}

export function normalizeWheelIntent(input: {
  deltaY: number;
  deltaMode: number;
  viewportHeight: number;
  at: number;
}): (ScrollIntent & { deltaY: number }) | null {
  const multiplier = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? input.viewportHeight : 1;
  const deltaY = input.deltaY * multiplier;
  if (!Number.isFinite(deltaY) || deltaY === 0) return null;
  return { direction: deltaY < 0 ? "away" : "toward", at: input.at, deltaY };
}

export function normalizeTouchIntent(input: {
  startX: number;
  startY: number;
  x: number;
  y: number;
  at: number;
}): ScrollIntent | null {
  const deltaX = input.x - input.startX;
  const deltaY = input.y - input.startY;
  if (Math.abs(deltaY) < 8 || Math.abs(deltaY) <= Math.abs(deltaX)) return null;
  return { direction: deltaY > 0 ? "away" : "toward", at: input.at };
}

export function normalizeKeyIntent(input: {
  key: string;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  editableTarget?: boolean;
  buttonTarget?: boolean;
  at: number;
}): ScrollIntent | null {
  if (input.repeat || input.defaultPrevented || input.editableTarget) return null;
  const space = input.key === " " || input.key === "Space" || input.key === "Spacebar";
  if (space && input.buttonTarget) return null;
  if (space) return { direction: input.shiftKey ? "away" : "toward", at: input.at };
  if (["ArrowUp", "Home", "PageUp"].includes(input.key)) return { direction: "away", at: input.at };
  if (["ArrowDown", "End", "PageDown"].includes(input.key)) return { direction: "toward", at: input.at };
  return null;
}

export interface ScrollbarPointer {
  startY: number;
  trackTop: number;
  trackHeight: number;
  startScrollTop: number;
  scrollableHeight: number;
  thumbTop: number;
  thumbHeight: number;
}

export function captureScrollbarPointer(input: {
  x: number;
  y: number;
  rect: { left: number; right: number; top: number; bottom: number };
  clientWidth: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): ScrollbarPointer | null {
  const scrollableHeight = input.scrollHeight - input.clientHeight;
  const trackHeight = input.rect.bottom - input.rect.top;
  if (scrollableHeight <= 0 || trackHeight <= 0) return null;
  const scrollbarWidth = Math.max(12, input.rect.right - input.rect.left - input.clientWidth);
  const atRight = input.x >= input.rect.right - scrollbarWidth && input.x <= input.rect.right;
  const atLeft = input.x >= input.rect.left && input.x <= input.rect.left + scrollbarWidth;
  if ((!atRight && !atLeft) || input.y < input.rect.top || input.y > input.rect.bottom) return null;
  const thumbHeight = Math.min(trackHeight, trackHeight * input.clientHeight / input.scrollHeight);
  const thumbTop = input.rect.top + (input.scrollTop / scrollableHeight) * (trackHeight - thumbHeight);
  return {
    startY: input.y,
    trackTop: input.rect.top,
    trackHeight,
    startScrollTop: input.scrollTop,
    scrollableHeight,
    thumbTop,
    thumbHeight,
  };
}

export function normalizeScrollbarPointerDownIntent(pointer: ScrollbarPointer, at: number): ScrollIntent | null {
  if (pointer.startY < pointer.thumbTop) return { direction: "away", at };
  if (pointer.startY > pointer.thumbTop + pointer.thumbHeight) return { direction: "toward", at };
  return null;
}

export function normalizeScrollbarDragIntent(
  pointer: ScrollbarPointer,
  input: { y: number; at: number },
): ScrollIntent | null {
  const deltaY = input.y - pointer.startY;
  if (Math.abs(deltaY) <= 1) return null;
  return { direction: deltaY < 0 ? "away" : "toward", at: input.at };
}
