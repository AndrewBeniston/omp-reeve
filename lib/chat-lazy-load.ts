export const VISIBLE_PAGE_SIZE = 50;
export const HISTORY_LOAD_DISTANCE_PX = 64;

export function shouldLoadHistory({ scrollTop, clientHeight, pagedHiddenHistory }: {
  scrollTop: number;
  clientHeight: number;
  pagedHiddenHistory: boolean;
}): boolean {
  const distance = pagedHiddenHistory
    ? Math.max(clientHeight, HISTORY_LOAD_DISTANCE_PX)
    : HISTORY_LOAD_DISTANCE_PX;
  return scrollTop <= distance;
}

export function getVisibleRenderWindow(totalCount: number, visibleCount: number): {
  startIndex: number;
  hasMore: boolean;
} {
  const clampedVisibleCount = Math.min(Math.max(visibleCount, 0), Math.max(totalCount, 0));
  const startIndex = Math.max(0, totalCount - clampedVisibleCount);
  return { startIndex, hasMore: startIndex > 0 };
}

export function getNextVisibleCount(currentVisibleCount: number, pageSize = VISIBLE_PAGE_SIZE): number {
  return currentVisibleCount + pageSize;
}

export function captureScrollDistance(scrollHeight: number, scrollTop: number): number {
  return scrollHeight - scrollTop;
}

export function restoreScrollTop(scrollHeight: number, savedDistance: number): number {
  return Math.max(0, scrollHeight - savedDistance);
}
