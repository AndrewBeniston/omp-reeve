import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { access, opendir, open, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { generateFileMentionMessages } from "@oh-my-pi/pi-coding-agent/utils/file-mentions";
import type { FileMentionMessage } from "@oh-my-pi/pi-coding-agent/session/messages";
import type { AgentMessage, PrepareQueuedMessages } from "@oh-my-pi/pi-agent-core";

const MAX_PATHS = 32;
const CAPABILITY_AGE_MS = 24 * 60 * 60 * 1000;

export interface SelectedAttachmentPath {
  path: string;
  issuedAt: number;
  signature: string;
}

export class AttachmentPathError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "AttachmentPathError";
  }
}

function isSelectedPath(value: unknown): value is SelectedAttachmentPath {
  if (!value || typeof value !== "object") return false;
  const selected = value as Partial<SelectedAttachmentPath>;
  return typeof selected.path === "string"
    && typeof selected.issuedAt === "number"
    && typeof selected.signature === "string";
}

function verifyCapability(selected: SelectedAttachmentPath, secret: string, now: number): void {
  if (!isAbsolute(selected.path) || selected.path.includes("\0") || selected.path.length > 4096) {
    throw new AttachmentPathError("Invalid attachment path");
  }
  if (!Number.isSafeInteger(selected.issuedAt)
    || selected.issuedAt > now + 60_000
    || now - selected.issuedAt > CAPABILITY_AGE_MS
    || !/^[0-9a-f]{64}$/i.test(selected.signature)) {
    throw new AttachmentPathError("Invalid attachment selection", 403);
  }
  const expected = createHmac("sha256", secret)
    .update(JSON.stringify(["reeve-attachment-v1", selected.path, selected.issuedAt]))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(selected.signature, "hex"))) {
    throw new AttachmentPathError("Invalid attachment selection", 403);
  }
}

async function checkReadable(pathname: string): Promise<void> {
  try {
    const info = await stat(pathname);
    if (!info.isFile() && !info.isDirectory()) throw new Error("Unsupported path type");
    await access(pathname, constants.R_OK);
    if (info.isDirectory()) {
      const directory = await opendir(pathname);
      await directory.close();
    } else {
      const file = await open(pathname, "r");
      await file.close();
    }
  } catch {
    throw new AttachmentPathError(`Attachment "${basename(pathname)}" is missing or inaccessible`);
  }
}

export async function prepareAttachmentPathMessages(
  value: unknown,
  cwd: string,
  secret = process.env.OMP_WEB_DESKTOP_TOKEN,
): Promise<FileMentionMessage[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PATHS || value.some(item => !isSelectedPath(item))) {
    throw new AttachmentPathError(`attachments must contain at most ${MAX_PATHS} selected paths`);
  }
  if (value.length === 0) return [];
  if (!secret) throw new AttachmentPathError("Local attachments require the desktop application", 403);

  const now = Date.now();
  const paths: string[] = [];
  for (const selected of value as SelectedAttachmentPath[]) {
    verifyCapability(selected, secret, now);
    await checkReadable(selected.path);
    paths.push(selected.path);
  }

  const messages = await generateFileMentionMessages(paths, cwd);
  const fileMessages = messages.filter((message): message is FileMentionMessage => message.role === "fileMention");
  if (fileMessages.flatMap(message => message.files).length !== paths.length) {
    throw new AttachmentPathError("An attachment became inaccessible before send");
  }
  return fileMessages;
}

interface AttachmentQueueAgent {
  steer(message: AgentMessage): void;
  followUp(message: AgentMessage): void;
  prepareQueuedMessages?: PrepareQueuedMessages;
}

/** Keep selected file context with the user message through OMP's one-at-a-time queues. */
export class QueuedAttachmentContext {
  private readonly submission = new AsyncLocalStorage<{ files: FileMentionMessage[]; captured: boolean }>();
  private readonly filesByMessage = new WeakMap<AgentMessage, FileMentionMessage[]>();
  readonly supported: boolean;

  constructor(readonly agent: AttachmentQueueAgent) {
    this.supported = typeof agent.steer === "function"
      && typeof agent.followUp === "function"
      && typeof agent.prepareQueuedMessages === "function";
    if (!this.supported) return;

    const originalSteer = agent.steer;
    const originalFollowUp = agent.followUp;
    const originalPrepare = agent.prepareQueuedMessages!;
    agent.steer = (message) => {
      this.capture(message);
      originalSteer.call(agent, message);
    };
    agent.followUp = (message) => {
      this.capture(message);
      originalFollowUp.call(agent, message);
    };
    agent.prepareQueuedMessages = async (messages, signal) => {
      const files = messages.flatMap(message => this.filesByMessage.get(message) ?? []);
      const prepared = await originalPrepare.call(agent, messages, signal);
      if (files.length === 0) return prepared;
      return {
        commit: () => {
          const additional = prepared?.commit();
          if (prepared && additional === undefined) return undefined;
          return [...files, ...(additional ?? [])];
        },
      };
    };
  }

  private capture(message: AgentMessage): void {
    const submission = this.submission.getStore();
    if (submission && !submission.captured && message.role === "user") {
      this.filesByMessage.set(message, submission.files);
      submission.captured = true;
    }
  }

  forMessage(message: AgentMessage): FileMentionMessage[] {
    return this.filesByMessage.get(message) ?? [];
  }

  async run<T>(files: FileMentionMessage[], send: () => Promise<T>): Promise<T> {
    if (files.length === 0) return send();
    if (!this.supported) throw new AttachmentPathError("This OMP version cannot queue local attachments");
    const submission = { files, captured: false };
    return this.submission.run(submission, async () => {
      const result = await send();
      if (!submission.captured) throw new AttachmentPathError("The queued attachment has no user message");
      return result;
    });
  }
}
