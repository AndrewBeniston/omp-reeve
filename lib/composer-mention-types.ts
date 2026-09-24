export type ComposerMentionKind = "agent" | "command" | "computer-use" | "file" | "mcp" | "plugin" | "session" | "skill" | "tab";

export interface ComposerMentionToken {
  kind: ComposerMentionKind;
  label: string;
  raw: string;
  detail?: string;
  icon?: string;
}
