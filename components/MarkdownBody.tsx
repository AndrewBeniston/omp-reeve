"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { resolveLocalFileHref } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { markdownRehypePlugins, markdownRemarkPlugins, normalizeDisplayMath } from "@/lib/markdown";
import {
  createStreamingMarkdownKeyState,
  createStreamingMarkdownRehypePlugin,
  stabilizeStreamingMarkdown,
  STREAMING_MARKDOWN_MAX_DELAY_MS,
  STREAMING_MARKDOWN_SEGMENT_DELAY_MS,
  type StreamingMarkdownKeyState,
} from "@/lib/streaming-markdown";
import { MermaidBlock, CodeBlock } from "./MermaidBlock";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}

interface StreamingFadeTimeline {
  delayMsByKey: Map<string, number>;
  nextSegmentStartAtMs: number;
  settledKeys: Set<string>;
}

function createStreamingFadeTimeline(): StreamingFadeTimeline {
  return {
    delayMsByKey: new Map(),
    nextSegmentStartAtMs: 0,
    settledKeys: new Set(),
  };
}

function StreamingFadeSegment({
  children,
  segmentIndex,
  segmentKey,
  timeline,
}: {
  children: ReactNode;
  segmentIndex: number;
  segmentKey: string;
  timeline: StreamingFadeTimeline;
}) {
  const settled = timeline.settledKeys.has(segmentKey);
  const delay = settled ? undefined : getStreamingFadeDelay(timeline, segmentKey, segmentIndex);

  return (
    <span
      className={settled ? undefined : "markdown-stream-fade"}
      data-stream-fade-delay={delay}
      data-stream-fade-key={segmentKey}
      onAnimationEnd={settled ? undefined : (event) => {
        if (event.target === event.currentTarget) timeline.settledKeys.add(segmentKey);
      }}
    >
      {children}
    </span>
  );
}

export function MarkdownBody({ children, className, isStreaming, cwd, onOpenFile }: MarkdownBodyProps) {
  const normalizedMarkdown = useMemo(
    () => normalizeDisplayMath(isStreaming ? stabilizeStreamingMarkdown(children) : children),
    [children, isStreaming],
  );
  const keyStateRef = useRef<StreamingMarkdownKeyState>(createStreamingMarkdownKeyState());
  const pendingKeyStateRef = useRef<StreamingMarkdownKeyState | null>(null);
  const fadeTimelineRef = useRef<StreamingFadeTimeline>(createStreamingFadeTimeline());
  const streamingPlugin = isStreaming
    ? createStreamingMarkdownRehypePlugin(keyStateRef.current, (candidate) => {
        pendingKeyStateRef.current = candidate;
      })
    : null;

  useLayoutEffect(() => {
    if (!isStreaming) {
      keyStateRef.current = createStreamingMarkdownKeyState();
      pendingKeyStateRef.current = null;
      fadeTimelineRef.current = createStreamingFadeTimeline();
      return;
    }
    if (pendingKeyStateRef.current) keyStateRef.current = pendingKeyStateRef.current;
  }, [isStreaming, normalizedMarkdown]);

  // Stable renderer identities keep stateful blocks mounted across message hover updates.
  const components = useMemo<Components>(() => ({
    code({ className, children, ...props }) {
      delete props.node;
      const lang = className?.replace("language-", "").toLowerCase() ?? "";
      const raw = String(children);
      const isBlock = className?.includes("language-") || raw.includes("\n");
      if (isBlock) {
        if (lang === "mermaid") {
          return <MermaidBlock code={raw.replace(/\n$/, "")} isStreaming={isStreaming} />;
        }
        return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} isStreaming={isStreaming} />;
      }
      const segment = takeStreamingSegmentProps(props);
      const inlineCode = (
        <code
          className="markdown-inline-code"
          {...props}
        >
          {children}
        </code>
      );
      return segment.key === null ? inlineCode : (
        <StreamingFadeSegment
          segmentIndex={segment.index}
          segmentKey={segment.key}
          timeline={fadeTimelineRef.current}
        >
          {inlineCode}
        </StreamingFadeSegment>
      );
    },
    span({ children, ...props }) {
      delete props.node;
      const segment = takeStreamingSegmentProps(props);
      if (segment.key === null) return <span {...props}>{children}</span>;
      return (
        <StreamingFadeSegment
          segmentIndex={segment.index}
          segmentKey={segment.key}
          timeline={fadeTimelineRef.current}
        >
          {children}
        </StreamingFadeSegment>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    a({ href, children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
      const openFile = onOpenFile;
      if (!filePath || !openFile) {
        return (
          <a href={href} {...props} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }

      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.currentTarget.getAttribute("target");
        if (target && target !== "_self") return;
        event.preventDefault();
        openFile(filePath);
      };

      return (
        <a href={href} {...props} onClick={handleClick}>
          {children}
        </a>
      );
    },
    img({ src, alt, ...props }) {
      delete props.node;
      const filePath = typeof src === "string" ? resolveLocalFileHref(src, cwd) : null;
      const imageSrc = filePath
        ? `/api/files/${encodeFilePathForApi(filePath)}?type=read`
        : src;
      // Dynamic local paths are served directly by the file API.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={imageSrc} alt={alt ?? ""} loading="lazy" {...props} />;
    },
    table({ children }) {
      return (
        <div className="markdown-table-wrap">
          <table>{children}</table>
        </div>
      );
    },
  }), [cwd, isStreaming, onOpenFile]);

  return (
    <div
      className={["markdown-body", className].filter(Boolean).join(" ")}
      data-markdown-animated={isStreaming ? "true" : undefined}
    >
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={streamingPlugin
          ? [...(markdownRehypePlugins ?? []), streamingPlugin]
          : markdownRehypePlugins}
        components={components}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function getStreamingFadeDelay(
  timeline: StreamingFadeTimeline,
  segmentKey: string,
  segmentIndex: number,
): number {
  const existingDelay = timeline.delayMsByKey.get(segmentKey);
  if (existingDelay !== undefined) return existingDelay;

  const fallbackDelay = Math.min(
    segmentIndex * STREAMING_MARKDOWN_SEGMENT_DELAY_MS,
    STREAMING_MARKDOWN_MAX_DELAY_MS,
  );
  if (typeof performance === "undefined") {
    timeline.delayMsByKey.set(segmentKey, fallbackDelay);
    return fallbackDelay;
  }

  const now = performance.now();
  const startAt = Math.min(
    Math.max(timeline.nextSegmentStartAtMs, now),
    now + STREAMING_MARKDOWN_MAX_DELAY_MS,
  );
  const rawDelay = Math.max(startAt - now, 0);
  const delay = Math.min(
    Math.round(rawDelay / STREAMING_MARKDOWN_SEGMENT_DELAY_MS) * STREAMING_MARKDOWN_SEGMENT_DELAY_MS,
    STREAMING_MARKDOWN_MAX_DELAY_MS,
  );
  timeline.delayMsByKey.set(segmentKey, delay);
  timeline.nextSegmentStartAtMs = startAt + STREAMING_MARKDOWN_SEGMENT_DELAY_MS;
  return delay;
}

function takeStreamingSegmentProps(props: Record<string, unknown>): { key: string | null; index: number } {
  const key = props["data-stream-fade-key"];
  const rawIndex = props["data-stream-fade-index"];
  delete props["data-stream-fade-key"];
  delete props["data-stream-fade-index"];
  return {
    key: typeof key === "string" ? key : null,
    index: typeof rawIndex === "number" ? rawIndex : Number(rawIndex) || 0,
  };
}
