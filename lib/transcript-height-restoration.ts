export interface TranscriptHeightMetrics {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

export interface HeightRestorationRecord<Element> {
  element: Element;
  height: number;
  scrollHeight: number;
  distanceFromEnd: number;
}

export function captureHeightRestoration<Element>(
  element: Element,
  height: number,
  metrics: TranscriptHeightMetrics,
): HeightRestorationRecord<Element> {
  return {
    element,
    height,
    scrollHeight: metrics.scrollHeight,
    distanceFromEnd: metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop,
  };
}

export function resolveHeightRestoration<Element>(
  record: HeightRestorationRecord<Element>,
  element: Element,
  height: number,
  metrics: TranscriptHeightMetrics,
): number | null {
  if (record.element !== element || record.height === height || record.scrollHeight === metrics.scrollHeight) {
    return null;
  }
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight - record.distanceFromEnd);
}
