import { classifyActivityTool } from "./activity-classifier";
import type { ActivityCall } from "./repeat-collapsing";

export interface LiveActivityHeaderInput {
  calls: readonly ActivityCall[];
  closed: boolean;
  inProgress: boolean;
  latestVisible: boolean;
  exploring: boolean;
}

export type LiveActivityHeader =
  | { kind: "summary" }
  | { kind: "thinking" }
  | { kind: "activity"; call: ActivityCall };

function interrupted(call: ActivityCall): boolean {
  const details = typeof call.result?.details === "object" && call.result.details !== null
    ? call.result.details as { status?: unknown }
    : undefined;
  return details?.status === "aborted" || details?.status === "interrupted";
}

function unfinished(call: ActivityCall): boolean {
  return !call.result && !interrupted(call);
}

function command(call: ActivityCall): boolean {
  return classifyActivityTool(call.block.toolName, call.block.input).kind === "command";
}

/** Select the reference live Activity header from the ordered tool calls. */
export function selectLiveActivityHeader(input: LiveActivityHeaderInput): LiveActivityHeader {
  if (input.closed || !input.inProgress || !input.latestVisible) return { kind: "summary" };
  if (input.exploring) {
    const runningCommand = input.calls.findLast((call) => command(call) && unfinished(call));
    if (runningCommand) return { kind: "activity", call: runningCommand };
    const finishedCommand = input.calls.findLast(command);
    if (finishedCommand) return { kind: "activity", call: finishedCommand };
  }
  const running = input.calls.findLast(unfinished);
  if (!running) return { kind: "thinking" };
  if (running.metadata?.automaticApprovalReview) return { kind: "thinking" };
  return { kind: "activity", call: running };
}
