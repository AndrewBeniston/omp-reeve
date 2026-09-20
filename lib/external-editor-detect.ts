import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import {
  buildLaunchArguments,
  findExternalEditorTarget,
  labelForPlatform,
  targetsForPlatform,
  type ExternalEditorListing,
  type ExternalEditorOption,
  type ExternalEditorRequest,
  type ExternalEditorTarget,
} from "./external-editor-registry";
import { discoverApplications, discoveryMode } from "./external-editor-discovery";
import { preferredTargetId, readExternalEditorPreferences, type CustomFileHandler, type ExternalEditorPreferences } from "./external-editor-preferences";

/**
 * Which of the registry's targets this machine actually has.
 *
 * Availability is a probe per target, not a scan of what is installed: for
 * every entry the platform table offers, its launch command is resolved, and
 * an entry whose command does not resolve is still returned — marked
 * unavailable, so the menu can say so rather than quietly shortening.
 *
 * Server-only.
 */

export type { ExternalEditorListing, ExternalEditorOption } from "./external-editor-registry";

interface Resolved {
  command: string;
  /** A macOS application bundle is launched through `open`, not executed. */
  bundle: boolean;
}

/** `%NAME%` replaced by that environment variable, for a path that names one. */
function expandEnvironmentPath(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => env[name] ?? whole);
}

/** An executable of this name on PATH, or nothing. No shell is involved. */
export function commandOnPath(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | null {
  if (command.includes("/") || command.includes("\\")) return existsSync(command) ? command : null;
  const separator = platform === "win32" ? ";" : ":";
  const extensions = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const directory of (env.PATH ?? "").split(separator).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${command.toLowerCase().endsWith(extension.toLowerCase()) ? "" : extension}`);
      try {
        accessSync(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // The next directory, or the next extension.
      }
    }
  }
  return null;
}

/**
 * One target's launch command on this machine. A command on PATH is preferred
 * over an application bundle, because only the command can be told a line.
 */
export function resolveTarget(target: ExternalEditorTarget, platform: NodeJS.Platform, env: NodeJS.ProcessEnv = process.env): Resolved | null {
  const entry = target.platforms[platform as "darwin" | "win32" | "linux"];
  if (!entry) return null;
  /*
   * On macOS an application is its bundle, and a command of the right name may
   * belong to a different application entirely: `/usr/local/bin/code` is
   * Cursor's launcher on a machine with no Visual Studio Code on it at all.
   * Offering "Open in Visual Studio Code" and opening something else is worse
   * than not offering it, so a target that names bundles is available only
   * when one of them is present, and a command is used only once it is shown
   * to live inside that bundle.
   */
  const bundle = (entry.bundles ?? []).find((candidate) => existsSync(candidate));
  if (platform === "darwin" && (entry.bundles?.length ?? 0) > 0 && !bundle) return null;
  for (const command of entry.commands ?? []) {
    const resolved = commandOnPath(command, platform, env);
    if (!resolved) continue;
    if (platform === "darwin" && bundle && !belongsTo(resolved, bundle)) continue;
    return { command: resolved, bundle: false };
  }
  if (bundle) return { command: bundle, bundle: true };
  for (const candidate of entry.paths ?? []) {
    const expanded = expandEnvironmentPath(candidate, env);
    if (existsSync(expanded)) return { command: expanded, bundle: false };
  }
  return null;
}

/** Whether a command, once its links are followed, lives inside this bundle. */
function belongsTo(command: string, bundle: string): boolean {
  try {
    return realpathSync(command).startsWith(`${bundle}/`);
  } catch {
    return false;
  }
}

function resolveCustomHandler(handler: CustomFileHandler, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): Resolved | null {
  const resolved = commandOnPath(handler.command, platform, env);
  if (resolved) return { command: resolved, bundle: false };
  return existsSync(handler.command) ? { command: handler.command, bundle: handler.command.endsWith(".app") } : null;
}

/**
 * Everything a menu needs for one file: the registry for this platform, the
 * human's own handlers after it, and — only for the file types the platform
 * has its own applications for — those, appended.
 */
export async function listExternalEditors(filePath: string, options?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; preferences?: ExternalEditorPreferences }): Promise<ExternalEditorListing> {
  const platform = options?.platform ?? process.platform;
  const env = options?.env ?? process.env;
  const preferences = options?.preferences ?? readExternalEditorPreferences();
  const registry: ExternalEditorOption[] = targetsForPlatform(platform).map((target) => ({
    id: target.id,
    label: labelForPlatform(target, platform),
    kind: target.kind,
    hidden: target.hidden === true,
    available: resolveTarget(target, platform, env) !== null,
  }));
  const custom: ExternalEditorOption[] = preferences.customFileHandlers.map((handler) => ({
    id: handler.id,
    label: handler.label,
    kind: handler.kind ?? "editor",
    hidden: false,
    available: resolveCustomHandler(handler, platform, env) !== null,
  }));
  const discovered: ExternalEditorOption[] = (await discoverApplications(filePath, platform)).map((application) => ({
    id: application.id,
    label: application.label,
    kind: "system-default",
    hidden: false,
    available: true,
    discovered: true,
  }));
  const mode = discoveryMode(filePath);
  // In native mode the platform's own viewers lead, which also decides which
  // target is offered as the primary one.
  const targets = mode === "native" ? [...discovered, ...registry, ...custom] : [...registry, ...custom, ...discovered];
  const available = targets.filter((target) => target.available).map((target) => target.id);
  return { targets, preferredTargetId: preferredTargetId(preferences, filePath, available), mode };
}

/**
 * Open a file in one target.
 *
 * The child is detached and its streams are discarded: an editor outliving the
 * request that started it is the point, and a long-lived pipe nobody reads
 * would eventually block it.
 */
export function launchExternalEditor(targetId: string, request: ExternalEditorRequest, options?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; preferences?: ExternalEditorPreferences }): { ok: true } | { ok: false; reason: "unknown-target" | "unavailable" } {
  const platform = options?.platform ?? process.platform;
  const env = options?.env ?? process.env;
  const preferences = options?.preferences ?? readExternalEditorPreferences();
  let command: string;
  let argv: string[];
  if (targetId.startsWith("discovered:")) {
    const application = targetId.slice("discovered:".length);
    if (!existsSync(application)) return { ok: false, reason: "unavailable" };
    if (platform === "darwin") { command = "/usr/bin/open"; argv = ["-a", application, request.path]; }
    else { command = "gio"; argv = ["launch", application, request.path]; }
  } else if (targetId.startsWith("custom:")) {
    const handler = preferences.customFileHandlers.find((entry) => entry.id === targetId);
    if (!handler) return { ok: false, reason: "unknown-target" };
    const resolved = resolveCustomHandler(handler, platform, env);
    if (!resolved) return { ok: false, reason: "unavailable" };
    const substitute = (value: string) => value.replace(/\{path\}/g, request.path).replace(/\{line\}/g, String(request.line ?? 1));
    if (resolved.bundle) { command = "/usr/bin/open"; argv = ["-a", resolved.command, request.path]; }
    else { command = resolved.command; argv = (handler.arguments ?? ["{path}"]).map(substitute); }
  } else {
    const target = findExternalEditorTarget(targetId);
    if (!target) return { ok: false, reason: "unknown-target" };
    const resolved = resolveTarget(target, platform, env);
    if (!resolved) return { ok: false, reason: "unavailable" };
    if (resolved.bundle) {
      // A bundle can be told which file to open but not which line: the line
      // is the price of an application that ships no command-line tool.
      command = "/usr/bin/open";
      argv = ["-a", resolved.command, request.path];
    } else {
      command = resolved.command;
      argv = buildLaunchArguments(target, platform, request);
    }
  }
  const child = spawn(command, argv, { detached: true, stdio: "ignore", env });
  child.on("error", () => {});
  child.unref();
  return { ok: true };
}
