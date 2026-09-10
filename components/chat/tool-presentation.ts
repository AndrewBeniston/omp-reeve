import type { ToolResultMessage } from "@/lib/types";

export type ToolKind = "read" | "write" | "glob" | "grep" | "edit" | "bash" | "todo" | "eval" | "task" | "browser" | "image" | "generic";

export interface ToolClassification {
  name: string;
  kind: ToolKind;
  isEdit: boolean;
  isBash: boolean;
  isTodo: boolean;
  isEval: boolean;
  usesIntentPreview: boolean;
  isLocal: boolean;
}

export interface ResultDiff {
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolNameHasPart(toolName: string, part: string): boolean {
  return toolName === part
    || toolName.endsWith(`.${part}`)
    || toolName.endsWith(`_${part}`)
    || toolName.split(/[.\s:_-]+/).includes(part);
}

function isEditToolName(name: string): boolean {
  return name === "edit"
    || name.startsWith("edit_")
    || name.endsWith(".edit")
    || name.endsWith("_edit")
    || name.includes("str_replace")
    || name.includes("replace_editor");
}

function isBashToolName(name: string): boolean {
  return name === "bash"
    || name.startsWith("bash ")
    || name.endsWith(".bash")
    || name.endsWith("_bash");
}

function isTodoToolName(name: string): boolean {
  return name === "todo" || name.endsWith(".todo") || name.endsWith("_todo");
}

function isEvalToolName(name: string): boolean {
  return name === "eval" || name.endsWith(".eval") || name.endsWith("_eval");
}

function usesIntentPreview(name: string): boolean {
  return ["grep", "read", "write", "glob"].some(
    (part) => name === part || name.endsWith(`.${part}`) || name.endsWith(`_${part}`),
  );
}

function getToolKind(name: string): ToolKind {
  if (name.includes("str_replace") || name.includes("replace_editor") || toolNameHasPart(name, "edit")) return "edit";
  if (toolNameHasPart(name, "read") || toolNameHasPart(name, "cat")) return "read";
  if (toolNameHasPart(name, "write") || toolNameHasPart(name, "save")) return "write";
  if (toolNameHasPart(name, "glob") || toolNameHasPart(name, "find")) return "glob";
  if (toolNameHasPart(name, "grep") || toolNameHasPart(name, "search")) return "grep";
  if (toolNameHasPart(name, "bash") || toolNameHasPart(name, "shell") || toolNameHasPart(name, "exec")) return "bash";
  if (toolNameHasPart(name, "todo")) return "todo";
  if (toolNameHasPart(name, "eval")) return "eval";
  if (toolNameHasPart(name, "task") || toolNameHasPart(name, "agent")) return "task";
  if (toolNameHasPart(name, "browser") || toolNameHasPart(name, "web_search") || toolNameHasPart(name, "fetch")) return "browser";
  if (toolNameHasPart(name, "image") || toolNameHasPart(name, "inspect_image")) return "image";
  return "generic";
}

export function classifyTool(toolName: string): ToolClassification {
  const name = toolName.trim().toLowerCase();
  const kind = getToolKind(name);
  return {
    name,
    kind,
    isEdit: isEditToolName(name),
    isBash: isBashToolName(name),
    isTodo: isTodoToolName(name),
    isEval: isEvalToolName(name),
    usesIntentPreview: usesIntentPreview(name),
    isLocal: name.includes("(local)"),
  };
}

export function getTerminalCommand(classification: ToolClassification, input: unknown): string | null {
  if (!classification.isBash) return null;
  return isRecord(input) && typeof input.command === "string" ? input.command : "";
}

export function getToolPreview(
  block: { toolName: string; input: unknown },
  classification = classifyTool(block.toolName),
): string {
  if (!isRecord(block.input)) return "";
  const keys = Object.keys(block.input);
  if (keys.length === 0) return "";
  if (classification.usesIntentPreview && typeof block.input.i === "string") {
    const intent = block.input.i.trim();
    if (intent) return intent.slice(0, 120);
  }
  if (classification.isEval && typeof block.input.title === "string") {
    const title = block.input.title.trim();
    if (title) return title.slice(0, 120);
  }
  if ("command" in block.input) return String(block.input.command).slice(0, 120);
  if ("path" in block.input) return String(block.input.path).slice(0, 120);
  if ("file_path" in block.input) return String(block.input.file_path).slice(0, 120);
  if ("pattern" in block.input) return String(block.input.pattern).slice(0, 120);
  if ("query" in block.input) return String(block.input.query).slice(0, 120);
  return String(block.input[keys[0]]).slice(0, 120);
}

export function getResultText(result?: ToolResultMessage): string | null {
  if (!result) return null;
  return result.content.filter((block): block is { type: "text"; text: string } => block.type === "text").map((block) => block.text).join("\n");
}

export function isEmptyResultText(text: string | null): boolean {
  return text !== null && (text.trim() === "" || text.trim() === "(no output)");
}

export function getResultDiff(result: Pick<ToolResultMessage, "details">): ResultDiff | null {
  if (!isRecord(result.details)) return null;
  if (typeof result.details.patch === "string" && result.details.patch) return { text: result.details.patch };
  if (typeof result.details.diff === "string" && result.details.diff) return { text: result.details.diff };
  return null;
}

export function getDiffStats(text: string): { added: number; removed: number } {
  return text.split(/\r?\n/).reduce((stats, line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) stats.added += 1;
    if (line.startsWith("-") && !line.startsWith("---")) stats.removed += 1;
    return stats;
  }, { added: 0, removed: 0 });
}
