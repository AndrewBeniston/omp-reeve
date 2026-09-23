import type { AgentMessage } from "@/lib/types";
import { getAssistantErrorMessage, getDisplayableAssistantBlocks } from "@/lib/message-display";
import { foldTurns, type TranscriptRecord, type TurnPhase, type TurnTextPhase } from "@/lib/transcript/turn-folder";

export interface TranscriptMessageRow {
  message: AgentMessage;
  index: number;
  entryId?: string;
  textPhases?: (TurnTextPhase | undefined)[];
  streaming: boolean;
}

export type TranscriptRow =
  | { kind: "archived"; sessionId: string }
  | { kind: "turn"; id: string; phase: TurnPhase; settled: boolean; items: TranscriptMessageRow[] }
  | { kind: "compaction"; id: string; phase: TurnPhase; items: TranscriptMessageRow[] }
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

/** Keep the Session reader's message order while the Turn folder owns boundaries and phases. */
export function buildTranscriptRows(
  messages: readonly AgentMessage[],
  entryIds: readonly (string | undefined)[],
  streamingMessage: AgentMessage | null,
  running: boolean,
): TranscriptRow[] {
  const sourceMessages = streamingMessage ? [...messages, streamingMessage] : [...messages];
  const records: TranscriptRecord<AgentMessage>[] = [];
  let liveRunStarted = false;
  messages.forEach((message, index) => {
    if (running && !liveRunStarted && message.role === "user" && !entryIds[index]) {
      records.push({ type: "agent_start" });
      liveRunStarted = true;
    }
    records.push({ type: "message", id: entryIds[index], message });
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
    });
  });

  const messageRow = (index: number): TranscriptMessageRow => ({
    message: sourceMessages[index],
    index,
    entryId: entryIds[index],
    streaming: index === messages.length,
  });
  const rows: TranscriptRow[] = [];
  for (let index = 0; index < sourceMessages.length; index += 1) {
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
      });
    } else {
      rows.push({ kind: "message", item: messageRow(index) });
    }
  }
  return rows;
}
