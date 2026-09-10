export const STREAMING_MARKDOWN_SEGMENT_DELAY_MS = 16;
export const STREAMING_MARKDOWN_MAX_DELAY_MS = 96;

export interface StreamingMarkdownKeyState {
  nextSegmentId: number;
  previousSegments: Array<{ content: string; key: string }>;
}

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface TextSlot {
  kind: "text";
  node: HastNode;
  segments: string[];
  startIndex: number;
}

interface InlineCodeSlot {
  kind: "inline-code";
  node: HastNode;
  startIndex: number;
}

type SegmentSlot = TextSlot | InlineCodeSlot;

const SKIPPED_TEXT_CONTAINERS = new Set(["math", "pre", "script", "style", "svg", "textarea"]);
const ASCII_WORD_CHARACTER = /^[0-9A-Za-z]$/;
const INCOMPLETE_IMAGE_LINE = /(^|\n)[^\S\n]*!\[[^\]\n]*(?:\](?:\([^\)\n]*)?)?\s*$/;
const INCOMPLETE_LINK = /\[([^\]\n]+)\]\(([^\)\n]+)$/;

/** Keeps incomplete Markdown readable while the final delimiter is still arriving. */
export function stabilizeStreamingMarkdown(markdown: string): string {
  if (markdown.length === 0 || hasUnclosedInlineCode(markdown) || hasOpenCodeFence(markdown)) {
    return markdown;
  }

  let stable = markdown.replace(INCOMPLETE_IMAGE_LINE, "$1");
  stable = stable.replace(INCOMPLETE_LINK, "$1");
  stable = closeUnmatchedEmphasis(stable, "**");
  stable = closeUnmatchedEmphasis(stable, "*");
  return stable;
}

export function createStreamingMarkdownKeyState(): StreamingMarkdownKeyState {
  return { nextSegmentId: 0, previousSegments: [] };
}

/**
 * Mirrors Codex's streamed prose segmentation. ASCII letters and numbers form
 * words. Whitespace and punctuation stay attached to the preceding word.
 */
export function segmentStreamingText(text: string, segmenter?: Intl.Segmenter | null): string[] {
  if (isAscii(text)) return segmentAsciiText(text);

  if (!segmenter) {
    const segments = Array.from(text.match(/\s*\S+(?:\s+|$)/g) ?? []);
    return segments.length > 0 || text.length === 0 ? segments : [text];
  }

  const segments: string[] = [];
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) {
      const previousIndex = Math.max(segments.length - 1, 0);
      segments[previousIndex] ??= "";
      segments[previousIndex] += part.segment;
      continue;
    }
    segments.push(part.segment);
  }
  return segments;
}

/**
 * Preserves a segment key at the same position when its text only grows.
 * It then matches moved equal segments before assigning a new fade key.
 */
export function reconcileStreamingSegmentKeys(
  contents: string[],
  previousState: StreamingMarkdownKeyState,
): { keys: string[]; nextState: StreamingMarkdownKeyState } {
  const candidate: StreamingMarkdownKeyState = {
    nextSegmentId: previousState.nextSegmentId,
    previousSegments: previousState.previousSegments.map((segment) => ({ ...segment })),
  };
  const unusedIndices = new Set(candidate.previousSegments.keys());
  const indicesByContent = new Map<string, number[]>();

  for (let index = candidate.previousSegments.length - 1; index >= 0; index--) {
    const segment = candidate.previousSegments[index];
    const matchingIndices = indicesByContent.get(segment.content) ?? [];
    matchingIndices.push(index);
    indicesByContent.set(segment.content, matchingIndices);
  }

  const keys = contents.map((content, index) => {
    const positionalSegment = candidate.previousSegments[index];
    if (
      positionalSegment
      && unusedIndices.has(index)
      && (
        positionalSegment.content === content
        || (positionalSegment.content.length > 0 && content.startsWith(positionalSegment.content))
      )
    ) {
      unusedIndices.delete(index);
      return positionalSegment.key;
    }

    const matchingIndices = indicesByContent.get(content);
    let matchingIndex = matchingIndices?.pop();
    while (matchingIndex !== undefined && !unusedIndices.has(matchingIndex)) {
      matchingIndex = matchingIndices?.pop();
    }
    if (matchingIndex !== undefined) {
      unusedIndices.delete(matchingIndex);
      return candidate.previousSegments[matchingIndex].key;
    }

    const key = `stream-segment-${candidate.nextSegmentId}`;
    candidate.nextSegmentId += 1;
    return key;
  });

  candidate.previousSegments = keys.map((key, index) => ({
    content: contents[index] ?? "",
    key,
  }));
  return { keys, nextState: candidate };
}

export function createStreamingMarkdownRehypePlugin(
  previousState: StreamingMarkdownKeyState,
  onCandidate: (state: StreamingMarkdownKeyState) => void,
) {
  return function streamingMarkdownRehypePlugin() {
    return function transformStreamingMarkdown(tree: HastNode) {
      const segmenter = createWordSegmenter();
      const slots: SegmentSlot[] = [];
      const contents: string[] = [];
      collectSegmentSlots(tree, null, segmenter, slots, contents);

      const { keys, nextState } = reconcileStreamingSegmentKeys(contents, previousState);
      onCandidate(nextState);
      applySegmentSlots(tree, slots, keys);
    };
  };
}

function collectSegmentSlots(
  node: HastNode,
  parentTag: string | null,
  segmenter: Intl.Segmenter | null,
  slots: SegmentSlot[],
  contents: string[],
): void {
  if (node.type === "text" && typeof node.value === "string") {
    if (node.value.trim().length === 0) return;
    const segments = segmentStreamingText(node.value, segmenter);
    if (segments.length === 0) return;
    slots.push({ kind: "text", node, segments, startIndex: contents.length });
    contents.push(...segments);
    return;
  }

  if (node.type !== "element" || !node.tagName) {
    node.children?.forEach((child) => collectSegmentSlots(child, parentTag, segmenter, slots, contents));
    return;
  }

  const tagName = node.tagName.toLowerCase();
  if (hasClass(node, "katex") || SKIPPED_TEXT_CONTAINERS.has(tagName)) return;

  if (tagName === "code" && parentTag !== "pre") {
    const content = readText(node);
    if (content.length > 0) {
      slots.push({ kind: "inline-code", node, startIndex: contents.length });
      contents.push(content);
    }
    return;
  }

  node.children?.forEach((child) => collectSegmentSlots(child, tagName, segmenter, slots, contents));
}

function applySegmentSlots(tree: HastNode, slots: SegmentSlot[], keys: string[]): void {
  const textSlots = new WeakMap<HastNode, TextSlot>();
  for (const slot of slots) {
    if (slot.kind === "text") textSlots.set(slot.node, slot);
    else setSegmentProperties(slot.node, keys[slot.startIndex], slot.startIndex);
  }

  const replaceTextNodes = (node: HastNode): void => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      const slot = textSlots.get(child);
      if (!slot) {
        replaceTextNodes(child);
        return [child];
      }
      return slot.segments.map((content, localIndex) => {
        const segmentIndex = slot.startIndex + localIndex;
        return {
          type: "element",
          tagName: "span",
          properties: {
            "data-stream-fade-key": keys[segmentIndex],
            "data-stream-fade-index": segmentIndex,
          },
          children: [{ type: "text", value: content }],
        } satisfies HastNode;
      });
    });
  };

  replaceTextNodes(tree);
}

function setSegmentProperties(node: HastNode, key: string | undefined, index: number): void {
  if (!key) return;
  node.properties = {
    ...node.properties,
    "data-stream-fade-key": key,
    "data-stream-fade-index": index,
  };
}

function createWordSegmenter(): Intl.Segmenter | null {
  try {
    return new Intl.Segmenter(undefined, { granularity: "word" });
  } catch {
    return null;
  }
}

function segmentAsciiText(text: string): string[] {
  const segments: string[] = [];
  let index = 0;
  while (index < text.length) {
    if (ASCII_WORD_CHARACTER.test(text[index])) {
      const start = index;
      while (index < text.length && ASCII_WORD_CHARACTER.test(text[index])) index += 1;
      segments.push(text.slice(start, index));
      continue;
    }
    const previousIndex = Math.max(segments.length - 1, 0);
    segments[previousIndex] ??= "";
    segments[previousIndex] += text[index];
    index += 1;
  }
  return segments;
}

function isAscii(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 127) return false;
  }
  return true;
}

function hasClass(node: HastNode, className: string): boolean {
  const value = node.properties?.className;
  if (Array.isArray(value)) return value.includes(className);
  if (typeof value === "string") return value.split(/\s+/).includes(className);
  return false;
}

function readText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(readText).join("") ?? "";
}

function closeUnmatchedEmphasis(text: string, marker: "*" | "**"): string {
  if (!text.includes(marker) || countUnescapedMarkers(text, marker) % 2 === 0) return text;
  const markerIndex = findLastUnescapedMarker(text, marker);
  if (markerIndex < 0) return text;

  const suffix = text.slice(markerIndex + marker.length);
  if (
    suffix.length === 0
    || /^\s/.test(suffix)
    || suffix.includes("\n")
    || hasUnclosedInlineCode(suffix)
  ) {
    return text;
  }
  return `${text}${marker}`;
}

function countUnescapedMarkers(text: string, marker: "*" | "**"): number {
  let count = 0;
  for (let index = 0; index <= text.length - marker.length;) {
    if (
      text.startsWith(marker, index)
      && !isEscaped(text, index)
      && !isRepeatedSingleMarker(text, index, marker)
    ) {
      count += 1;
      index += marker.length;
      continue;
    }
    index += 1;
  }
  return count;
}

function findLastUnescapedMarker(text: string, marker: "*" | "**"): number {
  for (let index = text.length - marker.length; index >= 0; index--) {
    if (
      text.startsWith(marker, index)
      && !isEscaped(text, index)
      && !isRepeatedSingleMarker(text, index, marker)
    ) {
      return index;
    }
  }
  return -1;
}

function isRepeatedSingleMarker(text: string, index: number, marker: "*" | "**"): boolean {
  return marker.length === 1 && (text[index - 1] === marker || text[index + 1] === marker);
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) slashCount += 1;
  return slashCount % 2 === 1;
}

function hasOpenCodeFence(text: string): boolean {
  let fence: { marker: "`" | "~"; length: number } | null = null;
  for (const line of text.split("\n")) {
    const match = line.trimStart().match(/^(`{3,}|~{3,})(.*)$/);
    if (!match) continue;
    const marker = match[1][0] as "`" | "~";
    if (!fence) {
      if (marker === "`" && match[2].includes("`")) continue;
      fence = { marker, length: match[1].length };
    } else if (marker === fence.marker && match[1].length >= fence.length && match[2].trim() === "") {
      fence = null;
    }
  }
  return fence !== null;
}

function hasUnclosedInlineCode(text: string): boolean {
  let fence: { marker: "`" | "~"; length: number } | null = null;
  let inlineMarkerLength: number | null = null;

  for (const line of text.split("\n")) {
    const wasInFence = fence !== null;
    const fenceMatch = line.trimStart().match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (!fence) {
        if (!(marker === "`" && fenceMatch[2].includes("`"))) {
          fence = { marker, length: fenceMatch[1].length };
        }
      } else if (
        marker === fence.marker
        && fenceMatch[1].length >= fence.length
        && fenceMatch[2].trim() === ""
      ) {
        fence = null;
      }
    }
    if (wasInFence || fence !== null) continue;

    for (let index = 0; index < line.length;) {
      if (line[index] !== "`") {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (line[end] === "`") end += 1;
      const markerLength = end - index;
      if (inlineMarkerLength === markerLength) inlineMarkerLength = null;
      else if (inlineMarkerLength === null && !isEscaped(line, index)) inlineMarkerLength = markerLength;
      index = end;
    }
  }
  return inlineMarkerLength !== null;
}
