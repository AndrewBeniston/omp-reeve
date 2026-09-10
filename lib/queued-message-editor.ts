import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import {
  isHiddenUserCompanion,
  isUserQueuedMessage,
  queueChipText,
  toRestoredQueuedMessage,
} from "@oh-my-pi/pi-coding-agent/session/queued-messages";
import { randomUUID } from "crypto";
import type { QueuedMessageItem, QueuedMessageKind, QueuedMessageSnapshot } from "./queued-message-types";

const QUEUE_PREVIEW_MAX_BASE64_CHARS = 256_000;

export interface QueueAgent {
  peekSteeringQueue?(): readonly AgentMessage[];
  peekFollowUpQueue?(): readonly AgentMessage[];
  replaceQueues?(steering: AgentMessage[], followUp: AgentMessage[]): void;
}

interface InternalQueueToken {
  type: "internal";
  entries: AgentMessage[];
}

interface UserQueueToken {
  type: "user";
  id: string;
  entries: AgentMessage[];
  message: AgentMessage;
}

type QueueToken = InternalQueueToken | UserQueueToken;

export interface RemovedQueuedMessage {
  id: string;
  kind: QueuedMessageKind;
  token: UserQueueToken;
  tokenIndex: number;
}

function firstImagePreview(message: AgentMessage): string | undefined {
  if (!("content" in message) || typeof message.content === "string") return undefined;
  const image = message.content.find((part) => part.type === "image");
  return image?.type === "image" && image.data.length <= QUEUE_PREVIEW_MAX_BASE64_CHARS
    ? `data:${image.mimeType};base64,${image.data}`
    : undefined;
}

function imageCount(message: AgentMessage): number {
  if (!("content" in message) || typeof message.content === "string") return 0;
  return message.content.filter((part) => part.type === "image").length;
}

export class QueuedMessageEditor {
  private readonly ids = new WeakMap<object, string>();

  constructor(
    private readonly agent: QueueAgent,
    private readonly createId: () => string = randomUUID,
  ) {}

  snapshot(paused = false): QueuedMessageSnapshot {
    return {
      items: [
        ...this.userTokens("steer"),
        ...this.userTokens("followUp"),
      ].map(({ kind, token }) => ({
        id: token.id,
        kind,
        text: queueChipText(token.message),
        imageCount: imageCount(token.message),
        imagePreview: firstImagePreview(token.message),
      } satisfies QueuedMessageItem)),
      paused,
    };
  }

  remove(id: string): RemovedQueuedMessage | null {
    for (const kind of ["steer", "followUp"] as const) {
      const tokens = this.tokens(kind);
      const tokenIndex = tokens.findIndex((token) => token.type === "user" && token.id === id);
      const token = tokens[tokenIndex];
      if (tokenIndex < 0 || token?.type !== "user") continue;
      tokens.splice(tokenIndex, 1);
      this.replace(kind, tokens);
      return { id, kind, token, tokenIndex };
    }
    return null;
  }

  restore(removed: RemovedQueuedMessage): boolean {
    if (this.snapshot().items.some((item) => item.id === removed.id)) return false;
    const tokens = this.tokens(removed.kind);
    tokens.splice(Math.min(Math.max(removed.tokenIndex, 0), tokens.length), 0, removed.token);
    this.replace(removed.kind, tokens);
    return true;
  }

  reorder(ids: string[]): void {
    for (const kind of ["steer", "followUp"] as const) {
      const tokens = this.tokens(kind);
      const currentUsers = tokens.filter((token): token is UserQueueToken => token.type === "user");
      if (currentUsers.length < 2) continue;
      const byId = new Map(currentUsers.map((token) => [token.id, token]));
      const requested = ids.flatMap((id) => {
        const token = byId.get(id);
        return token ? [token] : [];
      });
      const requestedIds = new Set(requested.map((token) => token.id));
      const ordered = [...requested, ...currentUsers.filter((token) => !requestedIds.has(token.id))];
      let userIndex = 0;
      const reordered = tokens.map((token) => token.type === "user" ? ordered[userIndex++] : token);
      this.replace(kind, reordered);
    }
  }

  moveToSteering(id: string): boolean {
    const removed = this.remove(id);
    if (!removed) return false;
    if (removed.kind === "steer") {
      this.restore(removed);
      return true;
    }
    const steering = this.tokens("steer");
    steering.push(removed.token);
    this.replace("steer", steering);
    return true;
  }

  parkAllAsFollowUp(): void {
    const ids = this.snapshot().items.map((item) => item.id);
    const removed = ids.flatMap((id) => this.remove(id) ?? []);
    if (removed.length === 0) return;
    const followUp = this.tokens("followUp");
    for (const item of removed) followUp.push(item.token);
    this.replace("followUp", followUp);
  }

  draft(removed: RemovedQueuedMessage) {
    const restored = toRestoredQueuedMessage(removed.token.message);
    return { text: restored.text, images: restored.images };
  }

  adoptNewest(kind: QueuedMessageKind, id: string): boolean {
    const tokens = this.tokens(kind);
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      const token = tokens[index];
      if (token?.type !== "user") continue;
      this.ids.set(token.message as object, id);
      token.id = id;
      return true;
    }
    return false;
  }

  place(id: string, tokenIndex: number, kind: QueuedMessageKind): void {
    const tokens = this.tokens(kind);
    const currentIndex = tokens.findIndex((token) => token.type === "user" && token.id === id);
    if (currentIndex < 0) return;
    const [token] = tokens.splice(currentIndex, 1);
    if (!token) return;
    tokens.splice(Math.min(Math.max(tokenIndex, 0), tokens.length), 0, token);
    this.replace(kind, tokens);
  }

  private userTokens(kind: QueuedMessageKind): Array<{ kind: QueuedMessageKind; token: UserQueueToken }> {
    return this.tokens(kind)
      .filter((token): token is UserQueueToken => token.type === "user")
      .map((token) => ({ kind, token }));
  }

  private tokens(kind: QueuedMessageKind): QueueToken[] {
    const read = kind === "steer" ? this.agent.peekSteeringQueue : this.agent.peekFollowUpQueue;
    const queue = read?.call(this.agent) ?? [];
    const tokens: QueueToken[] = [];
    let companions: AgentMessage[] = [];

    for (const message of queue) {
      if (isHiddenUserCompanion(message)) {
        companions.push(message);
        continue;
      }
      if (isUserQueuedMessage(message)) {
        tokens.push({
          type: "user",
          id: this.idFor(message),
          entries: [...companions, message],
          message,
        });
        companions = [];
        continue;
      }
      for (const companion of companions) tokens.push({ type: "internal", entries: [companion] });
      companions = [];
      tokens.push({ type: "internal", entries: [message] });
    }
    for (const companion of companions) tokens.push({ type: "internal", entries: [companion] });
    return tokens;
  }

  private idFor(message: AgentMessage): string {
    const object = message as object;
    const current = this.ids.get(object);
    if (current) return current;
    const id = this.createId();
    this.ids.set(object, id);
    return id;
  }

  private replace(kind: QueuedMessageKind, tokens: QueueToken[]): void {
    if (!this.agent.replaceQueues) throw new Error("This OMP version cannot edit queued messages");
    const next = tokens.flatMap((token) => token.entries);
    const steering = [...(this.agent.peekSteeringQueue?.() ?? [])];
    const followUp = [...(this.agent.peekFollowUpQueue?.() ?? [])];
    this.agent.replaceQueues(kind === "steer" ? next : steering, kind === "followUp" ? next : followUp);
  }
}
