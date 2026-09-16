import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@/lib/session-reader";
import type { ExternalEditorKind } from "./external-editor-registry";

/**
 * Which application a file opens in by default, and any the human added.
 *
 * The reference persists a preferred target globally and per path, and lets a
 * human extend the registry with their own handlers. Both live here, in
 * Reeve's own file beside its Review Tabs, never in an OMP file.
 *
 * Server-only.
 */

const PREFERENCES_FILE = "omp-web-external-editors.json";

/** A target the human defined: a command, and how to hand it a file. */
export interface CustomFileHandler {
  id: string;
  label: string;
  command: string;
  /**
   * Arguments, where `{path}` and `{line}` are replaced. An entry with no
   * arguments is handed the path alone.
   */
  arguments?: string[];
  kind?: ExternalEditorKind;
}

export interface ExternalEditorPreferences {
  global: string | null;
  perPath: Record<string, string>;
  customFileHandlers: CustomFileHandler[];
}

export const DEFAULT_EXTERNAL_EDITOR_PREFERENCES: ExternalEditorPreferences = { global: null, perPath: {}, customFileHandlers: [] };

function preferencesPath(agentDir: string): string {
  return join(agentDir, PREFERENCES_FILE);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A handler read back from a file a human can edit is not trusted. One without
 * an id, a label and a command cannot be launched, and is dropped rather than
 * shown as a menu entry that does nothing.
 */
function sanitizeHandler(value: unknown): CustomFileHandler | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id);
  const label = text(record.label);
  const command = text(record.command);
  if (!id || !label || !command) return null;
  const handler: CustomFileHandler = { id: `custom:${id.replace(/^custom:/, "")}`, label, command };
  if (Array.isArray(record.arguments)) {
    handler.arguments = record.arguments.filter((entry): entry is string => typeof entry === "string");
  }
  const kind = record.kind;
  if (kind === "editor" || kind === "terminal" || kind === "file-manager" || kind === "system-default") handler.kind = kind;
  return handler;
}

function sanitizeExternalEditorPreferences(value: unknown): ExternalEditorPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_EXTERNAL_EDITOR_PREFERENCES;
  const record = value as Record<string, unknown>;
  const perPath: Record<string, string> = {};
  if (typeof record.perPath === "object" && record.perPath !== null && !Array.isArray(record.perPath)) {
    for (const [path, target] of Object.entries(record.perPath as Record<string, unknown>)) {
      const id = text(target);
      if (id) perPath[path] = id;
    }
  }
  return {
    global: text(record.global),
    perPath,
    customFileHandlers: Array.isArray(record.customFileHandlers)
      ? record.customFileHandlers.map(sanitizeHandler).filter((handler): handler is CustomFileHandler => handler !== null)
      : [],
  };
}

/**
 * The stored preferences, or the defaults. A file that cannot be read is the
 * defaults too: an unreadable preference is a menu whose first entry is not
 * the human's favourite, which is a much smaller loss than refusing to open
 * anything at all.
 */
export function readExternalEditorPreferences(agentDir = getAgentDir()): ExternalEditorPreferences {
  const file = preferencesPath(agentDir);
  if (!existsSync(file)) return DEFAULT_EXTERNAL_EDITOR_PREFERENCES;
  try {
    return sanitizeExternalEditorPreferences(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return DEFAULT_EXTERNAL_EDITOR_PREFERENCES;
  }
}

export function writeExternalEditorPreferences(preferences: ExternalEditorPreferences, agentDir = getAgentDir()): void {
  const file = preferencesPath(agentDir);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(preferences, null, 2)}\n`);
  renameSync(temporary, file);
}

/**
 * The target a file should open in: the one remembered for this exact path,
 * then the one remembered generally, then whichever available target leads the
 * list.
 */
export function preferredTargetId(preferences: ExternalEditorPreferences, filePath: string, available: readonly string[]): string | null {
  const candidates = [preferences.perPath[filePath], preferences.global];
  for (const candidate of candidates) {
    if (candidate && available.includes(candidate)) return candidate;
  }
  return available[0] ?? null;
}

/**
 * Remember a choice. Review's own menu never calls this: picking an
 * application there opens the file once and leaves the default alone.
 */
export function rememberTarget(preferences: ExternalEditorPreferences, targetId: string, filePath: string | null): ExternalEditorPreferences {
  return filePath
    ? { ...preferences, perPath: { ...preferences.perPath, [filePath]: targetId } }
    : { ...preferences, global: targetId };
}
