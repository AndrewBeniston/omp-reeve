export type TurnPhase = "idle" | "prework" | "final-answer";
export type TurnTextPhase = Extract<TurnPhase, "prework" | "final-answer">;

export interface TranscriptRecord<Message extends { role: string }> {
  type: string;
  id?: string;
  message?: Message;
}

export interface TurnItem<Message extends { role: string }> {
  message: Message;
  /** Present for a message loaded from a Session entry. */
  entryId?: string;
  /** Text phases use the indexes of the message's content blocks. */
  textPhases?: (TurnTextPhase | undefined)[];
}

export interface Turn<Message extends { role: string }> {
  /** The first Session entry ID, or a positional ID for a live Turn. */
  id: string;
  items: TurnItem<Message>[];
  phase: TurnPhase;
  settled: boolean;
}

function markPrework<Message extends { role: string }>(turn: Turn<Message>): void {
  for (const item of turn.items) {
    const phases = item.textPhases;
    if (!phases) continue;
    for (let index = 0; index < phases.length; index++) {
      if (phases[index] === "final-answer") phases[index] = "prework";
    }
  }
  turn.phase = "prework";
}

function foldAssistantContent<Message extends { role: string; content?: unknown }>(
  turn: Turn<Message>,
  item: TurnItem<Message>,
  seenTypes: WeakMap<TurnItem<Message>, string[]>,
): void {
  if (item.message.role !== "assistant") return;
  const content = item.message.content;
  const blocks = Array.isArray(content) ? content : content === undefined ? [] : [content];
  const previousTypes = seenTypes.get(item) ?? [];
  const nextTypes: string[] = [];
  const phases = item.textPhases ?? [];
  item.textPhases = phases;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const type = typeof block === "string" ? "text" : block?.type;
    nextTypes.push(type ?? "");
    if (previousTypes[index] !== type) phases[index] = undefined;
    if (type === "text") {
      const value = typeof block === "string" ? block : block.text;
      if (typeof value === "string" && value.length > 0 && !phases[index]) {
        phases[index] = "final-answer";
        turn.phase = "final-answer";
      }
    } else if (
      (type === "thinking" || type === "redactedThinking" || type === "toolCall")
      && previousTypes[index] !== type
    ) {
      markPrework(turn);
    }
  }
  phases.length = blocks.length;
  item.textPhases = phases;
  seenTypes.set(item, nextTypes);
}

/**
 * Fold records in transcript order. Session entries must already follow the
 * selected branch and compaction path. An OMP `message_end` completes a live
 * message; `message_start` and `message_update` keep it provisional meanwhile.
 *
 * OMP persists `steering` for a steered user message. It does not persist a
 * queue marker for a follow-up, so only the live run boundary identifies that
 * message as part of the interrupted Turn.
 */
export function foldTurns<Message extends { role: string; steering?: boolean; content?: unknown }>(
  records: readonly TranscriptRecord<Message>[],
): Turn<Message>[] {
  const turns: Turn<Message>[] = [];
  let activeTurn: Turn<Message> | undefined;
  let runActive = false;
  let runHasUser = false;
  let provisional: TurnItem<Message> | undefined;
  const seenTypes = new WeakMap<TurnItem<Message>, string[]>();

  for (const record of records) {
    if (record.type === "agent_start") {
      if (!runActive) runHasUser = false;
      runActive = true;
      continue;
    }
    if (record.type === "prompt_done" || record.type === "agent_settled") {
      runActive = false;
      provisional = undefined;
      if (record.type === "prompt_done" && activeTurn) activeTurn.settled = true;
      continue;
    }
    if (record.type === "tool_execution_start" || record.type === "subagent_lifecycle") {
      if (activeTurn && runActive) {
        activeTurn.settled = false;
        markPrework(activeTurn);
      }
      continue;
    }

    const message = record.message;
    if (!message || (
      record.type !== "message"
      && record.type !== "message_start"
      && record.type !== "message_update"
      && record.type !== "message_end"
    )) continue;

    if (activeTurn && record.type !== "message" && message.role !== "user") {
      activeTurn.settled = false;
    }

    if (record.type === "message_update" && provisional?.message.role === message.role) {
      provisional.message = message;
      if (activeTurn) foldAssistantContent(activeTurn, provisional, seenTypes);
      continue;
    }
    if (record.type === "message_end" && provisional?.message.role === message.role) {
      provisional.message = message;
      if (activeTurn) foldAssistantContent(activeTurn, provisional, seenTypes);
      provisional = undefined;
      continue;
    }
    if (record.type === "message_update") {
      // A stream can resume after the first snapshot was missed.
      if (message.role !== "assistant" || !activeTurn) continue;
    }

    if (message.role === "user") {
      const interrupted = Boolean(activeTurn && (
        message.steering === true || (runActive && runHasUser)
      ));
      if (!interrupted) {
        activeTurn = {
          id: record.type === "message" && record.id ? record.id : `live:${turns.length}`,
          items: [],
          phase: "idle",
          settled: record.type === "message",
        };
        turns.push(activeTurn);
      }
      if (runActive) runHasUser = true;
    }

    if (!activeTurn) continue;
    if (record.type !== "message") activeTurn.settled = false;
    const item: TurnItem<Message> = record.type === "message" && record.id
      ? { message, entryId: record.id }
      : { message };
    activeTurn.items.push(item);
    foldAssistantContent(activeTurn, item, seenTypes);
    if (record.type === "message") activeTurn.settled = true;
    if (record.type === "message_start" || record.type === "message_update") {
      provisional = item;
    } else {
      provisional = undefined;
    }
  }

  return turns;
}
