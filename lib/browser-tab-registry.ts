import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getAgentDir } from "@/lib/session-reader";
import { fromStoredBrowserTabs, type StoredBrowserTab } from "@/lib/browser-tab-store";

/**
 * Where a Project's Browser tabs are remembered.
 *
 * Reeve's own registry, outside any OMP file, following the archived-Session
 * precedent: OMP owns Sessions, and a panel Tab is not one. A corrupt registry
 * costs the restore and nothing else.
 *
 * Server-only. The decisions about what to store are in `browser-tab-store.ts`,
 * which the renderer imports; this file touches the filesystem and must never
 * reach the client bundle.
 */

const REGISTRY_FILE = "omp-web-browser-tabs.json";

/** The shape on disk: Project directory to its Tabs, in order. */
export type BrowserTabRegistry = Record<string, StoredBrowserTab[]>;

function registryPath(): string {
  return join(getAgentDir(), REGISTRY_FILE);
}

function readRegistry(): BrowserTabRegistry {
  try {
    const file = registryPath();
    if (!existsSync(file)) return {};
    const data: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    const registry: BrowserTabRegistry = {};
    for (const [project, tabs] of Object.entries(data as Record<string, unknown>)) {
      const restored = fromStoredBrowserTabs(tabs);
      if (restored.length > 0) registry[project] = restored;
    }
    return registry;
  } catch {
    // A corrupt registry costs the restore, never the Project.
    return {};
  }
}

/** The Tabs a Project had open, or none. */
export function readProjectBrowserTabs(project: string): StoredBrowserTab[] {
  if (!project) return [];
  return readRegistry()[project] ?? [];
}

/**
 * Remember a Project's Tabs, or forget them when it has none.
 *
 * Written to a temporary file and renamed, like the archive registry, so a
 * crash mid-write leaves the previous list rather than half of a new one.
 */
export function writeProjectBrowserTabs(project: string, tabs: StoredBrowserTab[]): void {
  if (!project) return;
  const registry = readRegistry();
  if (tabs.length > 0) registry[project] = tabs;
  else delete registry[project];

  const file = registryPath();
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`);
  renameSync(temporary, file);
}
