import { createHash } from "node:crypto";

/**
 * Which changes in a recorded interval are the run's own work.
 *
 * The interval says what moved between two moments, not who moved it. The
 * run's tool executions say the rest: the SDK raises `tool_execution_start`
 * and `tool_execution_end` for every tool, carrying its arguments and its
 * result.
 *
 * Invariants:
 *
 * - A path is claimed only when its final bytes can be worked out from the
 *   tool's own arguments or result, and the interval ends on exactly those
 *   bytes. Everything else in the interval is named, never claimed.
 * - Nothing reads the working tree. Disk holds whatever anybody wrote, and an
 *   observation of it races the tool it is meant to describe.
 * - A tool that may have written without saying where is a gap in coverage,
 *   not a reason to disbelieve what other tools proved. It is named so the
 *   reader knows the turn is shown in part.
 *
 * Source: `write` takes the whole file as `content` (tools/write.ts).
 * `edit` reports `oldText` and `newText` as whole-file "source-of-truth"
 * snapshots, `sourcePath`/`move` for a rename, and `snapshotsPruned` when
 * it dropped them past its 32k budget (edit/renderer.ts, edit/index.ts).
 */

/** A file the run is expected to have left in a known state. */
export interface RecordedWrite {
  path: string;
  /** The bytes expected there, or null for "no such file". */
  hash: string | null;
}

/**
 * The shape of a written record. Raised whenever what a record means changes,
 * because a record on disk outlives the process that wrote it: a reader that
 * assumed an older one still meant the same thing would either fail on a
 * missing field or, worse, attribute writes that were recorded under rules it
 * no longer applies.
 */
export const TURN_PROVENANCE_VERSION = 1;

export interface TurnProvenance {
  version: number;
  /** In execution order; the last entry for a path is the one it is held to. */
  writes: RecordedWrite[];
  /** Tools that may have changed files without saying which, by name. */
  opaqueTools: string[];
  /** Set when recording stopped keeping up, so this is no longer the whole turn. */
  overflowed?: boolean;
}

/** Whether a record was written by this version, and is shaped as one. */
export function isCurrentProvenance(value: unknown): value is TurnProvenance {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<TurnProvenance>;
  if (record.version !== TURN_PROVENANCE_VERSION) return false;
  if (!Array.isArray(record.writes) || !Array.isArray(record.opaqueTools)) return false;
  if (!record.opaqueTools.every((tool) => typeof tool === "string")) return false;
  return record.writes.every(
    (write) =>
      write !== null
      && typeof write === "object"
      && typeof (write as RecordedWrite).path === "string"
      && ((write as RecordedWrite).hash === null || typeof (write as RecordedWrite).hash === "string"),
  );
}

/** Tools checked against their source and found to write nothing in a Project. */
const INERT_TOOLS = new Set(["read", "grep", "glob", "ast_grep", "think", "todo", "inspect_image"]);

/**
 * What one path must hold before a tool runs, and what it will hold after.
 *
 * `requires` is undefined where the tool replaces the file whole, since what
 * was there first cannot survive into what it writes.
 */
export interface PathClaim {
  path: string;
  requires?: string | null;
  expects: string | null;
}

/**
 * Claims that stand or fall together.
 *
 * A move is the reason this is a group rather than a list. Its two paths are
 * one fact: if the file it came from does not hold what the run last left
 * there, somebody else's text is inside what was moved, and the destination
 * cannot be claimed either just because nothing was required of it.
 */
export type ClaimGroup = PathClaim[];

export type ToolOutcome =
  | { kind: "ignored" }
  | { kind: "opaque"; tool: string }
  /**
   * `incompleteTool` is set when the same call also changed something it said
   * nothing usable about — one file of a multi-file edit pruned past the
   * snapshot budget, say. The claims still stand; the tool is named as a gap
   * as well, because otherwise a turn with an unaccounted change would report
   * no gaps at all.
   */
  | { kind: "claims"; groups: ClaimGroup[]; incompleteTool?: string };

/** The hash Git gives this content, worked out from the content itself. */
export function blobHashOf(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** One file's before-and-after, as `edit` reports it. */
interface EditFileResult {
  path?: unknown;
  sourcePath?: unknown;
  move?: unknown;
  oldText?: unknown;
  newText?: unknown;
  snapshotsPruned?: unknown;
}

function editClaims(entry: EditFileResult): ClaimGroup[] {
  // Dropped past the snapshot budget: the result no longer says what the file
  // holds, so this path cannot be claimed.
  if (entry.snapshotsPruned === true) return [];
  const destination = text(entry.move) ?? text(entry.path);
  if (!destination) return [];
  const hadText = typeof entry.oldText === "string";
  const hasText = typeof entry.newText === "string";
  // Neither side reported: a no-op, a failure, or a form that keeps no
  // snapshots. Nothing here establishes anything.
  if (!hadText && !hasText) return [];

  const before = hadText ? blobHashOf(entry.oldText as string) : null;
  const after = hasText ? blobHashOf(entry.newText as string) : null;
  const source = text(entry.sourcePath);
  // A rename leaves two paths behind: the one it came from, now gone, and the
  // one it went to.
  if (source && source !== destination) {
    return [[
      { path: source, requires: before, expects: null },
      { path: destination, expects: after },
    ]];
  }
  return [[{ path: destination, requires: before, expects: after }]];
}

/**
 * What one finished tool execution establishes about the files it changed.
 *
 * A failed tool establishes nothing and is treated as a gap: it may have
 * written part of what it intended, and crediting it because the bytes happen
 * to match would be the same mistake as reading disk.
 */
export function readToolOutcome(execution: {
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
}): ToolOutcome {
  const name = execution.toolName.trim().toLowerCase();
  if (INERT_TOOLS.has(name)) return { kind: "ignored" };
  if (execution.isError) return { kind: "opaque", tool: name };

  const args = (execution.args ?? {}) as Record<string, unknown>;

  if (name === "write") {
    const path = text(args.path) ?? text(args.file_path);
    const content = args.content;
    // The patch and hashline forms carry their change in one string and name
    // no file.
    if (!path || typeof content !== "string") return { kind: "opaque", tool: name };
    // The whole file is replaced, so what was there first cannot survive.
    return { kind: "claims", groups: [[{ path, expects: blobHashOf(content) }]] };
  }

  if (name === "edit") {
    const details = (execution.result as { details?: EditFileResult & { perFileResults?: EditFileResult[] } })?.details;
    if (!details) return { kind: "opaque", tool: name };
    const entries = Array.isArray(details.perFileResults) ? details.perFileResults : [details];
    const groups: ClaimGroup[] = [];
    let incomplete = false;
    for (const file of entries) {
      const claimed = editClaims(file);
      if (claimed.length === 0) incomplete = true;
      else groups.push(...claimed);
    }
    // It edited something and said nothing usable about any of it.
    if (groups.length === 0) return { kind: "opaque", tool: name };
    return { kind: "claims", groups, ...(incomplete ? { incompleteTool: name } : {}) };
  }

  return { kind: "opaque", tool: name };
}

/** One path in the interval, and the content it ends on. */
export interface IntervalEntry {
  path: string;
  /** Null where the interval ends with the file gone. */
  afterHash: string | null;
}

export type Attribution =
  | { kind: "attributed"; paths: string[]; unattributedPaths: string[]; incompleteTools: string[] }
  | { kind: "unavailable"; reason: "attribution-unavailable" };

/**
 * Split an interval into the run's own work and everything else.
 *
 * A turn with no record at all is refused: an empty patch would read as a
 * prompt that changed nothing, which is a claim rather than an absence. A turn
 * that merely used a tool nobody can follow is shown in part, with the gap
 * named.
 */
export function attributeInterval(provenance: unknown, entries: IntervalEntry[]): Attribution {
  // A record from an older Reeve, or one that is not shaped like a record at
  // all, says nothing this version can act on.
  if (!isCurrentProvenance(provenance)) return { kind: "unavailable", reason: "attribution-unavailable" };

  const expected = new Map<string, string | null>();
  if (!provenance.overflowed) {
    for (const write of provenance.writes) expected.set(write.path, write.hash);
  }

  const paths: string[] = [];
  const unattributedPaths: string[] = [];
  for (const entry of entries) {
    if (expected.has(entry.path) && expected.get(entry.path) === entry.afterHash) paths.push(entry.path);
    else unattributedPaths.push(entry.path);
  }
  const incompleteTools = [...provenance.opaqueTools];
  // A record that stopped keeping up is a gap of its own, and the reader is
  // owed that in the same words as any other gap.
  if (provenance.overflowed && !incompleteTools.includes("(recording overflowed)")) {
    incompleteTools.push("(recording overflowed)");
  }
  return { kind: "attributed", paths, unattributedPaths, incompleteTools };
}
