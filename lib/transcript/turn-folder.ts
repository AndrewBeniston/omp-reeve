export interface TranscriptRecord<Message extends { role: string }> {
  type: string;
  id?: string;
  message?: Message;
}

export interface TurnItem<Message extends { role: string }> {
  message: Message;
  /** Present for a message loaded from a Session entry. */
  entryId?: string;
}

export interface Turn<Message extends { role: string }> {
  /** The first Session entry ID, or a positional ID for a live Turn. */
  id: string;
  items: TurnItem<Message>[];
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
export function foldTurns<Message extends { role: string; steering?: boolean }>(
  records: readonly TranscriptRecord<Message>[],
): Turn<Message>[] {
  const turns: Turn<Message>[] = [];
  let activeTurn: Turn<Message> | undefined;
  let runActive = false;
  let runHasUser = false;
  let provisional: TurnItem<Message> | undefined;

  for (const record of records) {
    if (record.type === "agent_start") {
      if (!runActive) runHasUser = false;
      runActive = true;
      continue;
    }
    if (record.type === "prompt_done" || record.type === "agent_settled") {
      runActive = false;
      provisional = undefined;
      continue;
    }

    const message = record.message;
    if (!message || (
      record.type !== "message"
      && record.type !== "message_start"
      && record.type !== "message_update"
      && record.type !== "message_end"
    )) continue;

    if (record.type === "message_update" && provisional?.message.role === message.role) {
      provisional.message = message;
      continue;
    }
    if (record.type === "message_end" && provisional?.message.role === message.role) {
      provisional.message = message;
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
        };
        turns.push(activeTurn);
      }
      if (runActive) runHasUser = true;
    }

    if (!activeTurn) continue;
    const item: TurnItem<Message> = record.type === "message" && record.id
      ? { message, entryId: record.id }
      : { message };
    activeTurn.items.push(item);
    if (record.type === "message_start" || record.type === "message_update") {
      provisional = item;
    } else {
      provisional = undefined;
    }
  }

  return turns;
}
