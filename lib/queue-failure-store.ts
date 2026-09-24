import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getAgentDir } from "@/lib/session-reader";
import type { QueuedMessageKind, QueuedMessageStatus } from "./queued-message-types";

export interface PersistedFailedQueueItem {
  id: string;
  sessionId: string;
  kind: QueuedMessageKind;
  text: string;
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
  status: "failed";
  errorSummary: string;
  position: number;
  failedAt: string;
}

export type QueueFailureRegistry = Record<string, PersistedFailedQueueItem[]>;

const REGISTRY_FILE = "omp-web-queue-failures.json";
const DEFAULT_ERROR_SUMMARY = "This queued message could not be sent";
const MAX_ERROR_SUMMARY_CHARS = 200;

function registryPath(agentDir = getAgentDir()): string {
  return join(agentDir, REGISTRY_FILE);
}

export function sanitizeErrorSummary(error: unknown): string {
  if (!error) return DEFAULT_ERROR_SUMMARY;
  const raw = typeof error === "string"
    ? error
    : (error instanceof Error ? error.message : String(error));
  if (!raw.trim()) return DEFAULT_ERROR_SUMMARY;

  let sanitized = raw
    .replace(/\/Users\/[^/\s]+/g, "[user]")
    .replace(/\/home\/[^/\s]+/g, "[user]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
    .replace(/(key|token|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9._~+/-]+['"]?/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return DEFAULT_ERROR_SUMMARY;
  if (sanitized.length > MAX_ERROR_SUMMARY_CHARS) {
    sanitized = sanitized.slice(0, MAX_ERROR_SUMMARY_CHARS).trim() + "…";
  }
  return sanitized;
}

export function readQueueFailures(agentDir = getAgentDir()): QueueFailureRegistry {
  try {
    const file = registryPath(agentDir);
    if (!existsSync(file)) return {};
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    return data as QueueFailureRegistry;
  } catch {
    return {};
  }
}

export function readSessionQueueFailures(sessionId: string, agentDir = getAgentDir()): PersistedFailedQueueItem[] {
  if (!sessionId) return [];
  const registry = readQueueFailures(agentDir);
  const items = registry[sessionId];
  return Array.isArray(items) ? items : [];
}

export function writeSessionQueueFailures(
  sessionId: string,
  items: PersistedFailedQueueItem[],
  agentDir = getAgentDir(),
): void {
  if (!sessionId) return;
  const registry = readQueueFailures(agentDir);
  if (items.length > 0) {
    registry[sessionId] = items;
  } else {
    delete registry[sessionId];
  }
  const file = registryPath(agentDir);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporary, JSON.stringify(registry, null, 2) + "\n", "utf8");
  renameSync(temporary, file);
}

export interface RecordQueueFailureInput {
  id: string;
  sessionId: string;
  kind: QueuedMessageKind;
  text: string;
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
  position: number;
  errorSummary: string;
  status?: "failed";
  failedAt?: string;
}

export function recordQueueFailure(
  input: RecordQueueFailureInput,
  agentDir = getAgentDir(),
): PersistedFailedQueueItem {
  const current = readSessionQueueFailures(input.sessionId, agentDir);
  const failure: PersistedFailedQueueItem = {
    id: input.id,
    sessionId: input.sessionId,
    kind: input.kind,
    text: input.text,
    images: input.images?.length ? input.images : undefined,
    status: "failed",
    errorSummary: sanitizeErrorSummary(input.errorSummary),
    position: input.position >= 0 ? input.position : 0,
    failedAt: input.failedAt ?? new Date().toISOString(),
  };

  const existingIndex = current.findIndex((item) => item.id === input.id);
  const next = [...current];
  if (existingIndex >= 0) {
    next[existingIndex] = failure;
  } else {
    next.push(failure);
  }

  writeSessionQueueFailures(input.sessionId, next, agentDir);
  return failure;
}

export function removeQueueFailure(
  sessionId: string,
  itemId: string,
  agentDir = getAgentDir(),
): boolean {
  const current = readSessionQueueFailures(sessionId, agentDir);
  const next = current.filter((item) => item.id !== itemId);
  if (next.length === current.length) return false;
  writeSessionQueueFailures(sessionId, next, agentDir);
  return true;
}

export function clearSessionQueueFailures(sessionId: string, agentDir = getAgentDir()): void {
  writeSessionQueueFailures(sessionId, [], agentDir);
}
