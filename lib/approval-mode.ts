export const APPROVAL_MODES = ["always-ask", "write", "yolo"] as const;

export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return typeof value === "string" && APPROVAL_MODES.includes(value as ApprovalMode);
}

export function approvalModeFromSettings(response: {
  fields?: Array<{ path?: string; value?: unknown }>;
}): ApprovalMode | null {
  const value = response.fields?.find((field) => field.path === "tools.approvalMode")?.value;
  return isApprovalMode(value) ? value : null;
}
