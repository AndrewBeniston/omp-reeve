import { classifyActivityTool } from "./activity-classifier";
import type { ActivityCall } from "./repeat-collapsing";

export type ActivitySummaryTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export interface ActivitySummaryInput {
  calls: readonly ActivityCall[];
  locale: string;
  t: ActivitySummaryTranslator;
}

type SummaryKind =
  | "commands"
  | "stoppedCreating"
  | "editedFiles"
  | "readFiles"
  | "calledTools"
  | "loadedTools"
  | "webSearch"
  | "sources"
  | "integrations"
  | "visualization";

interface MutableSegment {
  kind: SummaryKind;
  count: number;
  firstIndex: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function interrupted(call: ActivityCall): boolean {
  const details = typeof call.result?.details === "object" && call.result?.details !== null
    ? call.result.details as { status?: unknown }
    : undefined;
  return details?.status === "aborted" || details?.status === "interrupted";
}

function toolKey(toolName: string): string {
  return toolName.trim().toLowerCase().split(/__|\./).at(-1) ?? "";
}

function isVisualization(call: ActivityCall): boolean {
  return `${call.block.toolName} ${text(call.block.input.path)} ${text(call.block.input.file_path)}`
    .toLowerCase()
    .includes("visualization");
}

function loadedTool(call: ActivityCall): boolean {
  return ["read_mcp_resource", "list_mcp_resources"].includes(toolKey(call.block.toolName));
}

function namedSource(call: ActivityCall): string | undefined {
  return text(call.metadata?.source) || undefined;
}

function addSegment(
  segments: Map<SummaryKind, MutableSegment>,
  kind: SummaryKind,
  index: number,
): void {
  const segment = segments.get(kind);
  if (segment) segment.count += 1;
  else segments.set(kind, { kind, count: 1, firstIndex: index });
}

/** Compose the completed Activity header from ordered tool calls. */
export function composeActivitySummary({ calls, locale, t }: ActivitySummaryInput): string {
  const segments = new Map<SummaryKind, MutableSegment>();
  const sources = new Set<string>();
  let firstSourceIndex = Number.POSITIVE_INFINITY;

  calls.forEach((call, index) => {
    if (isVisualization(call)) {
      addSegment(segments, "visualization", index);
      return;
    }
    if (loadedTool(call)) {
      addSegment(segments, "loadedTools", index);
      return;
    }
    const source = namedSource(call);
    if (source) {
      firstSourceIndex = Math.min(firstSourceIndex, index);
      sources.add(source);
      return;
    }
    const kind = classifyActivityTool(call.block.toolName, call.block.input).kind;
    if (kind === "command") addSegment(segments, interrupted(call) ? "stoppedCreating" : "commands", index);
    else if (kind === "edit") addSegment(segments, interrupted(call) ? "stoppedCreating" : "editedFiles", index);
    else if (kind === "read" || kind === "search" || kind === "list") addSegment(segments, "readFiles", index);
    else if (kind === "web-search") addSegment(segments, "webSearch", index);
    else addSegment(segments, "calledTools", index);
  });

  if (sources.size > 0) {
    const hasBrowser = sources.has("browser");
    addSegment(segments, hasBrowser ? "sources" : "integrations", firstSourceIndex);
  }

  const ordered = [...segments.values()].sort((left, right) => left.firstIndex - right.firstIndex);
  if (ordered.length === 0) return t("transcript.activity.summary.completed");

  const rendered = ordered.map((segment, index) => {
    const leading = index === 0 ? ".leading" : "";
    if (segment.kind === "sources" || segment.kind === "integrations") {
      const names = [...sources].map((source) => source === "browser"
        ? t("transcript.activity.summary.source.browser")
        : source);
      const sourceList = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
      const suffix = segment.kind === "integrations" ? (sources.size === 1 ? ".one" : ".other") : "";
      return t(`transcript.activity.summary.${segment.kind}${leading}${suffix}`, {
        sources: sourceList,
        sourceCount: sources.size,
      });
    }
    if (segment.kind === "readFiles" || segment.kind === "webSearch" || segment.kind === "visualization") {
      return t(`transcript.activity.summary.${segment.kind}${leading}`, { count: segment.count });
    }
    const suffix = segment.count === 1 ? ".one" : ".other";
    return t(`transcript.activity.summary.${segment.kind}${leading}${suffix}`, { count: segment.count });
  });
  return new Intl.ListFormat(locale, { style: "long", type: "unit" }).format(rendered);
}
