export type TurnPhase = "idle" | "prework" | "final-answer";
export type TurnTextPhase = Extract<TurnPhase, "prework" | "final-answer">;
export type TurnStatus = "idle" | "working" | "worked" | "stopped";

export const TURN_CLOCK_INTERVAL_MS = 1_000;

export interface TurnClock {
  status: TurnStatus;
  startedAt?: number;
  completedAt?: number;
}

export function getTurnElapsedMs(
  turn: Pick<TurnClock, "startedAt" | "completedAt">,
  now = Date.now(),
): number {
  if (turn.startedAt === undefined) return 0;
  return Math.max(0, (turn.completedAt ?? now) - turn.startedAt);
}

export function shouldTickTurnClock(turn: Pick<TurnClock, "status" | "completedAt">): boolean {
  return turn.status === "working" && turn.completedAt === undefined;
}

function timestampToMs(timestamp: string | number | undefined): number | undefined {
  if (typeof timestamp === "number") return Number.isFinite(timestamp) ? timestamp : undefined;
  if (typeof timestamp !== "string") return undefined;
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

export interface TranscriptRecord<Message extends { role: string }> {
  type: string;
  id?: string;
  timestamp?: string | number;
  message?: Message;
}

export interface TurnItem<Message extends { role: string }> {
  message: Message;
  /** Present for a message loaded from a Session entry. */
  entryId?: string;
  /** Text phases use the indexes of the message's content blocks. */
  textPhases?: (TurnTextPhase | undefined)[];
}

export interface Turn<Message extends { role: string }> extends TurnClock {
  /** The first Session entry ID, or a positional ID for a live Turn. */
  id: string;
  items: TurnItem<Message>[];
  phase: TurnPhase;
  settled: boolean;
  /** Approval denials recorded in this Turn. */
  deniedActionCount: number;
}

const APPROVAL_DENIAL_PREFIXES = [
  "Tool call denied by user: ",
  "Tool call rejected by user",
] as const;

function isApprovalDenial<Message extends { role: string; content?: unknown; isError?: boolean }>(
  message: Message,
): boolean {
  if (message.role !== "toolResult" || message.isError !== true) return false;
  const content = message.content;
  if (typeof content === "string") return APPROVAL_DENIAL_PREFIXES.some(prefix => content.startsWith(prefix));
  if (!Array.isArray(content)) return false;
  return content.some(block => (
    block?.type === "text"
    && typeof block.text === "string"
    && APPROVAL_DENIAL_PREFIXES.some(prefix => block.text.startsWith(prefix))
  ));
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
  let pendingStartAt: number | undefined;
  let hasPendingStart = false;
  let provisional: TurnItem<Message> | undefined;
  const startedTurns = new WeakSet<Turn<Message>>();
  const seenTypes = new WeakMap<TurnItem<Message>, string[]>();

  for (const record of records) {
    if (record.type === "agent_start") {
      if (!runActive) {
        runHasUser = false;
        pendingStartAt = timestampToMs(record.timestamp);
        hasPendingStart = true;
      }
      runActive = true;
      if (
        activeTurn
        && activeTurn.items.at(-1)?.message.role === "user"
        && activeTurn.status !== "stopped"
        && !startedTurns.has(activeTurn)
      ) {
        activeTurn.status = "working";
        activeTurn.startedAt = timestampToMs(record.timestamp);
        activeTurn.completedAt = undefined;
        startedTurns.add(activeTurn);
        runHasUser = true;
        hasPendingStart = false;
        pendingStartAt = undefined;
      }
      continue;
    }
    if (record.type === "prompt_done" || record.type === "agent_settled") {
      runActive = false;
      hasPendingStart = false;
      pendingStartAt = undefined;
      provisional = undefined;
      if (record.type === "prompt_done" && activeTurn) {
        activeTurn.settled = true;
        if (activeTurn.status !== "stopped") {
          activeTurn.status = "worked";
          activeTurn.completedAt = timestampToMs(record.timestamp) ?? activeTurn.completedAt;
        }
      }
      continue;
    }
    if (record.type === "abort") {
      runActive = false;
      runHasUser = false;
      hasPendingStart = false;
      pendingStartAt = undefined;
      provisional = undefined;
      if (activeTurn) {
        activeTurn.settled = true;
        activeTurn.status = "stopped";
        activeTurn.completedAt = timestampToMs(record.timestamp) ?? activeTurn.completedAt;
      }
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
      if (activeTurn && isApprovalDenial(message)) activeTurn.deniedActionCount += 1;
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
        const startsLiveRun = runActive && !runHasUser && hasPendingStart;
        activeTurn = {
          id: record.type === "message" && record.id ? record.id : `live:${turns.length}`,
          items: [],
          phase: "idle",
          settled: record.type === "message",
          deniedActionCount: 0,
          status: startsLiveRun ? "working" : "idle",
          startedAt: startsLiveRun ? pendingStartAt : timestampToMs(record.timestamp),
        };
        turns.push(activeTurn);
        if (startsLiveRun) {
          startedTurns.add(activeTurn);
          hasPendingStart = false;
          pendingStartAt = undefined;
        }
      }
      if (runActive) runHasUser = true;
    }

    if (!activeTurn) continue;
    if (record.type !== "message") activeTurn.settled = false;
    const item: TurnItem<Message> = record.type === "message" && record.id
      ? { message, entryId: record.id }
      : { message };
    activeTurn.items.push(item);
    if ((record.type === "message" || record.type === "message_end") && isApprovalDenial(message)) {
      activeTurn.deniedActionCount += 1;
    }
    foldAssistantContent(activeTurn, item, seenTypes);
    if (record.type === "message") {
      activeTurn.settled = true;
      if (activeTurn.status !== "stopped") {
        activeTurn.completedAt = timestampToMs(record.timestamp) ?? activeTurn.completedAt;
      }
      if (!runActive && message.role === "assistant" && activeTurn.status !== "stopped") {
        activeTurn.status = "worked";
      }
    }
    if (record.type === "message_start" || record.type === "message_update") {
      provisional = item;
    } else {
      provisional = undefined;
    }
  }

  return turns;
}
