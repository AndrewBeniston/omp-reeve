export type ComposerMentionKind = "agent" | "command" | "computer-use" | "file" | "plugin" | "skill";

export interface ComposerMentionToken {
  kind: ComposerMentionKind;
  label: string;
  raw: string;
  detail?: string;
  icon?: string;
}
