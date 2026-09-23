import type { ToolCallContent, ToolResultMessage } from "@/lib/types";

export interface ActivityCallMetadata {
  server?: string;
  tool?: string;
  functionName?: string;
  pluginId?: string;
  connectorId?: string;
  linkId?: string;
  invocationResourceUri?: string;
  source?: string;
  automaticApprovalReview?: boolean;
}

export interface ActivityCall {
  block: ToolCallContent;
  result?: ToolResultMessage;
  metadata?: ActivityCallMetadata;
}

export interface ActivityCallGroup {
  calls: ActivityCall[];
  repeated: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identity(call: ActivityCall): string {
  const metadata = call.metadata ?? {};
  return JSON.stringify([
    text(metadata.server),
    text(metadata.tool) || call.block.toolName,
    text(metadata.functionName),
    text(metadata.pluginId),
    text(metadata.connectorId),
    text(metadata.linkId),
    text(metadata.invocationResourceUri),
  ]);
}

export function canCollapseActivityCall(call: ActivityCall): boolean {
  const metadata = call.metadata ?? {};
  const server = text(metadata.server).toLowerCase();
  const details = typeof call.result?.details === "object" && call.result.details !== null
    ? call.result.details as { status?: unknown }
    : undefined;
  const interrupted = details?.status === "aborted" || details?.status === "interrupted";
  return Boolean(call.result)
    && !call.result?.isError
    && !interrupted
    && !text(metadata.source)
    && !metadata.automaticApprovalReview
    && server !== "computer-use"
    && server !== "computer_use";
}

/** Group consecutive identical qualifying calls while preserving every other call. */
export function groupConsecutiveActivityCalls(calls: readonly ActivityCall[]): ActivityCallGroup[] {
  const groups: ActivityCallGroup[] = [];
  for (const call of calls) {
    const previous = groups.at(-1);
    const previousCall = previous?.calls.at(-1);
    if (
      previous
      && previousCall
      && canCollapseActivityCall(previousCall)
      && canCollapseActivityCall(call)
      && identity(previousCall) === identity(call)
    ) {
      previous.calls.push(call);
      continue;
    }
    groups.push({ calls: [call], repeated: false });
  }
  for (const group of groups) group.repeated = group.calls.length > 1;
  return groups;
}
