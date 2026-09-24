export type ComposerMentionKind = "agent" | "command" | "computer-use" | "file" | "mcp" | "plugin" | "session" | "skill" | "tab";

export interface ComposerMentionToken {
  kind: ComposerMentionKind;
  label: string;
  raw: string;
  detail?: string;
  icon?: string;
}

export interface ComposerSourceResponse {
  sessions: Array<{
    id: string;
    label: string;
    detail: string;
    modified: string;
  }>;
  tabs: Array<{
    id: string;
    label: string;
    detail: string;
    kind: "browser";
  }>;
  agents: Array<{
    name: string;
    description: string;
    source: string;
  }>;
  mcpServers: Array<{
    name: string;
    enabled: boolean;
    scope: string;
  }>;
}
