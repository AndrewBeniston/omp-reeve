import type { AgentMessage, ImageContent, ToolCallContent } from "./types";

export type SummarySource =
  | { activity: "read"; id: string; kind: "file"; label: string; path: string }
  | { activity: "attached"; id: string; kind: "image"; label: string; url: string }
  | { activity: "provided" | "read"; id: string; kind: "url"; label: string; url: string };

function messageText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function safeWebUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function imageSource(image: ImageContent): { identity: string; url: string } | null {
  if (image.source?.type === "base64" && image.source.data && image.source.media_type?.startsWith("image/")) {
    return {
      identity: `${image.source.data.length}:${image.source.data.slice(0, 12)}`,
      url: `data:${image.source.media_type};base64,${image.source.data}`,
    };
  }
  if (image.source?.type === "url" && image.source.url) {
    const url = safeWebUrl(image.source.url)?.toString();
    return url ? { identity: url, url } : null;
  }

  const flat = image as unknown as { data?: unknown; mimeType?: unknown };
  if (typeof flat.data !== "string" || !flat.data) return null;
  if (typeof flat.mimeType !== "string" || !flat.mimeType.startsWith("image/")) return null;
  return {
    identity: `${flat.data.length}:${flat.data.slice(0, 12)}`,
    url: `data:${flat.mimeType};base64,${flat.data}`,
  };
}

function filePath(value: unknown, cwd: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  if (/^(?:\/|[a-zA-Z]:[\\/])/.test(candidate)) return candidate;
  if (!cwd) return null;
  const separator = cwd.includes("\\") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${separator}${candidate.replace(/^[\\/]+/, "")}`;
}

function fileLabel(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function addSource(sources: SummarySource[], seen: Set<string>, source: SummarySource): void {
  if (seen.has(source.id)) return;
  seen.add(source.id);
  sources.push(source);
}

export function collectSessionSummarySources(
  messages: AgentMessage[],
  cwd?: string,
): SummarySource[] {
  const sources: SummarySource[] = [];
  const seen = new Set<string>();
  let imageCount = 0;

  for (const message of messages) {
    if (message.role === "user") {
      for (const match of messageText(message).matchAll(/https?:\/\/[^\s<>"']+/g)) {
        const trimmed = match[0].replace(/[),.;!?]+$/, "");
        const url = safeWebUrl(trimmed);
        if (!url) continue;
        addSource(sources, seen, {
          activity: "provided",
          id: `url:${url.toString()}`,
          kind: "url",
          label: url.hostname,
          url: url.toString(),
        });
      }

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type !== "image") continue;
          const image = imageSource(block);
          if (!image) continue;
          imageCount += 1;
          addSource(sources, seen, {
            activity: "attached",
            id: `image:${imageCount}:${image.identity}`,
            kind: "image",
            label: `Image ${imageCount}`,
            url: image.url,
          });
        }
      }
      continue;
    }

    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      const tool = block as ToolCallContent;
      const toolName = tool.toolName.toLowerCase();
      if (toolName === "read") {
        const path = filePath(tool.input.path ?? tool.input.file_path, cwd);
        if (path) addSource(sources, seen, {
          activity: "read",
          id: `file:${path}`,
          kind: "file",
          label: fileLabel(path),
          path,
        });
      }
      if (toolName === "browser" || toolName === "web" || toolName === "web_search") {
        const rawUrl = typeof tool.input.url === "string" ? tool.input.url : "";
        const url = safeWebUrl(rawUrl);
        if (url) addSource(sources, seen, {
          activity: "read",
          id: `url:${url.toString()}`,
          kind: "url",
          label: url.hostname,
          url: url.toString(),
        });
      }
    }
  }

  return sources;
}
