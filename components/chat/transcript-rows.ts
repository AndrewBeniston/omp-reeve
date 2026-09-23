import type { AgentMessage, ModelChangeNote } from "@/lib/types";
import { getAssistantErrorMessage, getDisplayableAssistantBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { foldTurns, type TranscriptRecord, type TurnClock, type TurnPhase, type TurnTextPhase } from "@/lib/transcript/turn-folder";
import { classifyActivityTool, type ActivityClassification } from "@/lib/transcript/activity-classifier";
import type { AssistantMessage, ToolCallContent, ToolResultMessage } from "@/lib/types";
import { groupConsecutiveActivityCalls, type ActivityCall } from "@/lib/transcript/repeat-collapsing";
import type { ToolCallContent, ToolResultMessage } from "@/lib/types";

export interface TranscriptMessageRow {
  message: AgentMessage;
  index: number;
  entryId?: string;
  textPhases?: (TurnTextPhase | undefined)[];
  streaming: boolean;
}

export type ActivityRowState = "running" | "completed" | "interrupted";

export interface ActivityRowContent {
  classification: ActivityClassification;
  state: ActivityRowState;
  detail?: string;
}

export function activityCallGroups(calls: readonly ActivityCall[]): ReturnType<typeof groupConsecutiveActivityCalls> {
  return groupConsecutiveActivityCalls(calls);
}

export interface ActivityStrings {
  command: { running: string; completed: string; interrupted: string };
  read: string;
  search: { generic: string; query: string };
  list: string;
  edit: string;
  webSearch: { generic: string; query: string };
  subAgent: { running: string; completed: string };
  connector: { running: string; completed: string };
  applicationControl: { desktop: string; terminal: string };
  unknown: { running: string; completed: string };
}

function inputText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toolResultState(result: ToolResultMessage | undefined): ActivityRowState {
  const status = typeof result?.details === "object" && result.details !== null
    ? (result.details as { status?: unknown }).status
    : undefined;
  if (status === "aborted" || status === "interrupted") return "interrupted";
  return result ? "completed" : "running";
}

/** Build the shared Activity row content for a tool call. */
export function activityRowContent(
  block: ToolCallContent,
  result?: ToolResultMessage,
  interrupted = false,
): ActivityRowContent {
  const state: ActivityRowState = interrupted ? "interrupted" : toolResultState(result);
  const classification = classifyActivityTool(block.toolName, block.input, { interrupted: state === "interrupted" });
  let detail: string | undefined;
  if (classification.kind === "command") detail = classification.command;
  if (classification.kind === "read") detail = inputText(block.input.path ?? block.input.file_path ?? block.input.target);
  if (classification.kind === "search") detail = inputText(block.input.query ?? block.input.pattern);
  if (classification.kind === "list") detail = inputText(block.input.path ?? block.input.folder);
  if (classification.kind === "web-search") detail = inputText(block.input.query);
  return { classification, state, detail };
}

export interface LiveCompactionState {
  isCompacting: boolean;
  source?: "manual" | "automatic" | string;
  error?: string | null;
}

export interface SessionOrigin {
  kind: "continued" | "parent";
  relatedSessionId: string;
}

export type TranscriptRow =
  | { kind: "archived"; sessionId: string }
  | { kind: "session-origin"; kindOfOrigin: "continued" | "parent"; relatedSessionId: string }
  | { kind: "turn"; id: string; phase: TurnPhase; settled: boolean; items: TranscriptMessageRow[]; clock: TurnClock }
  | {
      kind: "compaction";
      id: string;
      phase: TurnPhase;
      items: TranscriptMessageRow[];
      completed?: boolean;
      source?: "manual" | "automatic" | string;
      error?: string | null;
    }
  | { kind: "model-change"; id: string; note: Pick<ModelChangeNote, "fromModel" | "toModel"> }
  | { kind: "message"; item: TranscriptMessageRow };

/** Text uses the folder's phase. Images and errors remain visible final replies. */
export function finalAnswerPosition(items: readonly TranscriptMessageRow[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.message.role !== "assistant") continue;
    if (item.textPhases?.includes("final-answer")) return index;
    if (getDisplayableAssistantBlocks(item.message).some((block) => block.type === "image")) return index;
    if (getAssistantErrorMessage(item.message)) return index;
  }
  return -1;
}

/** A process-only Turn still presents its last assistant message in the expanded process group. */
export function presentationAssistantPosition(items: readonly TranscriptMessageRow[]): number {
  const final = finalAnswerPosition(items);
  if (final !== -1) return final;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].message.role === "assistant") return index;
  }
  return -1;
}

export interface DividerPresentation extends TurnClock { previousMessageCount: number; }

/** Return Divider data when a Turn has a final response and renderable process items. */
export function dividerPresentation(items: readonly TranscriptMessageRow[], clock: TurnClock): DividerPresentation | null {
  if (clock.status === "stopped") return null;
  const finalPosition = finalAnswerPosition(items);
  if (finalPosition === -1) return null;
  const processItems = items.slice(1, finalPosition).filter((item) => {
    const message = item.message;
    if (message.role === "assistant") return getDisplayableAssistantBlocks(message).length > 0;
    return message.role === "custom" && message.customType !== "compaction";
  });
  const finalBlocks = splitFinalAssistantBlocks(items[finalPosition].message as AssistantMessage);
  const processCount = processItems.length + finalBlocks.processBlocks.length;
  return processCount > 0 ? { ...clock, previousMessageCount: processCount } : null;
}

/** Keep the Session reader's message order while the Turn folder owns boundaries and phases. */
export function buildTranscriptRows(
  messages: readonly AgentMessage[],
  entryIds: readonly (string | undefined)[],
  streamingMessage: AgentMessage | null,
  running: boolean,
  modelChanges: readonly ModelChangeNote[] = [],
  compaction?: LiveCompactionState | null,
  sessionOrigin?: SessionOrigin | null,
): TranscriptRow[] {
  const sourceMessages = streamingMessage ? [...messages, streamingMessage] : [...messages];
  const records: TranscriptRecord<AgentMessage>[] = [];
  let liveRunStarted = false;
  messages.forEach((message, index) => {
    if (running && !liveRunStarted && message.role === "user" && !entryIds[index]) {
      records.push({ type: "agent_start" });
      liveRunStarted = true;
    }
    records.push({ type: "message", id: entryIds[index], timestamp: message.timestamp, message });
  });
  if (streamingMessage) records.push({ type: "message_start", id: undefined, message: streamingMessage });
  const turns = foldTurns(records);

  // A message can occur more than once by reference. Consume its positions in
  // source order so each Turn item still maps to exactly one rendered message.
  const positions = new Map<AgentMessage, number[]>();
  sourceMessages.forEach((message, index) => {
    const matches = positions.get(message) ?? [];
    matches.push(index);
    positions.set(message, matches);
  });

  const firstItems = new Map<number, Extract<TranscriptRow, { kind: "turn" }>>();
  const claimed = new Set<number>();
  turns.forEach((turn, turnIndex) => {
    const items = turn.items.flatMap((item): TranscriptMessageRow[] => {
      const index = positions.get(item.message)?.shift();
      if (index === undefined) return [];
      claimed.add(index);
      return [{
        message: item.message,
        index,
        entryId: item.entryId,
        textPhases: item.textPhases,
        streaming: index === messages.length,
      }];
    });
    if (items.length === 0) return;
    firstItems.set(items[0].index, {
      kind: "turn",
      id: turn.id,
      phase: turn.phase,
      settled: turn.settled && !(running && turnIndex === turns.length - 1),
      items,
      clock: { status: turn.status, startedAt: turn.startedAt, completedAt: turn.completedAt },
    });
  });

  const messageRow = (index: number): TranscriptMessageRow => ({
    message: sourceMessages[index],
    index,
    entryId: entryIds[index],
    streaming: index === messages.length,
  });
  const rows: TranscriptRow[] = [];
  if (sessionOrigin) {
    rows.push({
      kind: "session-origin",
      kindOfOrigin: sessionOrigin.kind,
      relatedSessionId: sessionOrigin.relatedSessionId,
    });
  }
  const changesAtPosition = new Map<number, ModelChangeNote[]>();
  for (const change of modelChanges) {
    const position = Math.max(0, Math.min(change.position, sourceMessages.length));
    const changes = changesAtPosition.get(position) ?? [];
    changes.push(change);
    changesAtPosition.set(position, changes);
  }
  for (let index = 0; index <= sourceMessages.length; index += 1) {
    for (const change of changesAtPosition.get(index) ?? []) {
      rows.push({
        kind: "model-change",
        id: change.entryId,
        note: { fromModel: change.fromModel, toModel: change.toModel },
      });
    }
    if (index === sourceMessages.length) break;
    const turn = firstItems.get(index);
    if (turn) {
      rows.push(turn);
      continue;
    }
    if (claimed.has(index)) continue;
    const message = sourceMessages[index];
    if (message.role === "custom" && message.customType === "compaction") {
      const items = [messageRow(index)];
      while (index + 1 < sourceMessages.length && !claimed.has(index + 1)) {
        if (changesAtPosition.has(index + 1)) break;
        const nextMessage = sourceMessages[index + 1];
        if (nextMessage.role === "custom" && nextMessage.customType === "compaction") break;
        items.push(messageRow(++index));
      }
      // Compaction can remove the user message that anchored this continuation.
      // Give the folder a temporary anchor to retain its phase decision.
      const continuation = foldTurns([
        { type: "message", message: { role: "user", content: "" } as AgentMessage },
        ...items.map((item) => ({ type: item.streaming ? "message_start" : "message", message: item.message })),
      ])[0];
      items.forEach((item, itemIndex) => { item.textPhases = continuation.items[itemIndex + 1]?.textPhases; });
      rows.push({
        kind: "compaction",
        id: entryIds[items[0].index] ?? `compaction:${items[0].index}`,
        phase: continuation.phase,
        items,
        completed: true,
        source: (message.details as { source?: string } | undefined)?.source ?? "automatic",
      });
    } else {
      rows.push({ kind: "message", item: messageRow(index) });
    }
  }
  if (compaction?.isCompacting || compaction?.error) {
    const lastSourceMessage = sourceMessages[sourceMessages.length - 1];
    const hasSavedCompactionAtEnd =
      lastSourceMessage &&
      lastSourceMessage.role === "custom" &&
      lastSourceMessage.customType === "compaction";

    if (!hasSavedCompactionAtEnd) {
      rows.push({
        kind: "compaction",
        id: "live-compaction",
        phase: "prework",
        items: [],
        completed: !compaction.isCompacting,
        source: compaction.source ?? "automatic",
        error: compaction.error ?? null,
      });
    }
  }
  return rows;
}

export { CompactionNote } from "./CompactionNote";
export { SessionOriginNote } from "./SessionOriginNote";
export { ProviderRetryNote } from "./ProviderRetryNote";
