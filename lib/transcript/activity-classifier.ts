export type ActivityKind =
  | "command"
  | "read"
  | "search"
  | "list"
  | "edit"
  | "web-search"
  | "sub-agent"
  | "connector"
  | "application-control"
  | "unknown";

export interface ActivityExecution {
  interrupted?: boolean;
}

export interface ActivityClassification {
  kind: ActivityKind;
  command?: string;
  interrupted?: boolean;
  surface?: string;
}

type ActivityInput = Readonly<Record<string, unknown>>;

interface ClassifierRow {
  name: string;
  kind: ActivityKind;
  surface?: string;
}

/**
 * The transcript classifier table. Each known OMP tool gets one row here.
 * Unknown tools deliberately use `unknown`; rendering decides how to show it.
 */
export const ACTIVITY_CLASSIFIER_ROWS: readonly ClassifierRow[] = [
  { name: "bash", kind: "command" },
  { name: "origin", kind: "command" },
  { name: "read", kind: "read" },
  { name: "read_mcp_resource", kind: "read" },
  { name: "grep", kind: "search" },
  { name: "glob", kind: "list" },
  { name: "list_mcp_resources", kind: "list" },
  { name: "edit", kind: "edit" },
  { name: "write", kind: "edit" },
  { name: "generate_image", kind: "edit" },
  { name: "web_search", kind: "web-search" },
  { name: "browser", kind: "web-search" },
  { name: "fetch", kind: "web-search" },
  { name: "web_fetch", kind: "web-search" },
  { name: "task", kind: "sub-agent" },
  { name: "sonic", kind: "sub-agent" },
  { name: "tts", kind: "unknown" },
  { name: "computer", kind: "application-control", surface: "desktop" },
  { name: "reeve_read_terminal", kind: "application-control", surface: "terminal" },
] as const;

const ROWS_BY_NAME = new Map(ACTIVITY_CLASSIFIER_ROWS.map(row => [row.name, row]));

function toolKey(toolName: string): string {
  return toolName.trim().toLowerCase().split(/__|\./).at(-1) ?? "";
}

function commandValue(input: ActivityInput): string {
  return typeof input.command === "string" ? input.command.trim() : "";
}

/**
 * Classify an OMP tool call without rendering or turn-level state changes.
 * Connector tools use the explicit MCP name prefix, not a guessed substring.
 */
export function classifyActivityTool(
  toolName: string,
  input: ActivityInput = {},
  execution: ActivityExecution = {},
): ActivityClassification {
  const name = toolName.trim().toLowerCase();
  const row = ROWS_BY_NAME.get(name) ?? ROWS_BY_NAME.get(toolKey(name));
  if (!row && (name.startsWith("mcp__") || name.startsWith("mcp."))) {
    return { kind: "connector" };
  }
  if (!row) return { kind: "unknown" };
  if (row.kind === "application-control") {
    return { kind: row.kind, surface: row.surface };
  }
  if (row.kind === "command") {
    return { kind: row.kind, command: commandValue(input), ...(execution.interrupted ? { interrupted: true } : {}) };
  }
  return { kind: row.kind };
}
