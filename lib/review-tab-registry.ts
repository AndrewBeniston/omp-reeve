import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getAgentDir } from "@/lib/session-reader";
import { canonicalReviewCwd } from "@/lib/review-comments";
import { fromStoredReviewTabs, type StoredReviewTab } from "@/lib/review-tab-store";

/**
 * Where a Project's Review Tabs are remembered: Reeve's own registry beside
 * the Browser one, never an OMP file.
 *
 * Server-only. `review-tab-store.ts` holds what a stored Tab is and is bundled
 * for the browser; this file touches the filesystem. Tabs are grouped by
 * Project and each record carries its whole owner, so the grouping is an index
 * rather than an identity.
 */

const REGISTRY_FILE = "omp-web-review-tabs.json";

/** The shape on disk: Project directory to its Review Tabs, in order. */
export type ReviewTabRegistry = Record<string, StoredReviewTab[]>;

/** Raised when the registry exists but cannot be read as one. */
export class ReviewTabRegistryUnreadable extends Error {
  constructor() {
    super("The Review Tab registry could not be read.");
    this.name = "ReviewTabRegistryUnreadable";
  }
}

function registryPath(agentDir: string): string {
  return join(agentDir, REGISTRY_FILE);
}

/**
 * A missing registry and an unreadable one are different answers. Both read as
 * "no Tabs" to a restore, but only the first may be written over: treating a
 * file that failed to parse as empty would replace every Tab a human still has
 * open with whatever one window was showing.
 */
function readRegistry(agentDir: string): ReviewTabRegistry {
  const file = registryPath(agentDir);
  if (!existsSync(file)) return {};
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new ReviewTabRegistryUnreadable();
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new ReviewTabRegistryUnreadable();
  const registry: ReviewTabRegistry = {};
  for (const [project, tabs] of Object.entries(data as Record<string, unknown>)) {
    const restored = fromStoredReviewTabs(tabs);
    if (restored.length > 0) registry[canonicalReviewCwd(project)] = restored;
  }
  return registry;
}

function writeRegistry(agentDir: string, registry: ReviewTabRegistry): void {
  const file = registryPath(agentDir);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`);
  renameSync(temporary, file);
}

/**
 * The Review Tabs a Project had open. Throws when the registry cannot be read,
 * so a restore says so rather than reporting an empty panel as the truth.
 */
export function readProjectReviewTabs(projectRoot: string, agentDir = getAgentDir()): StoredReviewTab[] {
  if (!projectRoot) return [];
  return readRegistry(agentDir)[canonicalReviewCwd(projectRoot)] ?? [];
}

/**
 * The binding a Tab id was registered with, looked up across every Project so
 * a request cannot reach another binding by naming a different Project.
 *
 * `null` means no such record. A registry that cannot be read throws instead,
 * because the two answers lead somewhere different: one is a Tab nobody
 * registered, the other is Reeve unable to say either way.
 */
export function findRegisteredReviewTab(tabId: string, agentDir = getAgentDir()): StoredReviewTab | null {
  if (!tabId) return null;
  for (const tabs of Object.values(readRegistry(agentDir))) {
    const found = tabs.find((tab) => tab.tabId === tabId);
    if (found) return found;
  }
  return null;
}

/**
 * Remember a Tab, or replace what was remembered under its id. Any record with
 * the same id elsewhere goes first, so one id never names two bindings. Throws
 * rather than writing when the registry cannot be read.
 */
export function writeRegisteredReviewTab(tab: StoredReviewTab, agentDir = getAgentDir()): void {
  const registry = readRegistry(agentDir);
  for (const [project, tabs] of Object.entries(registry)) {
    const kept = tabs.filter((existing) => existing.tabId !== tab.tabId);
    if (kept.length > 0) registry[project] = kept;
    else delete registry[project];
  }
  const project = canonicalReviewCwd(tab.owner.projectRoot);
  registry[project] = [...(registry[project] ?? []), tab];
  writeRegistry(agentDir, registry);
}

/**
 * Change what a Tab already registered is reviewing, and nothing else.
 *
 * A Tab closed while its selection was being saved must stay closed: the
 * record is re-read here, and an update for an id that is no longer stored
 * writes nothing rather than bringing the Tab back.
 */
export function updateRegisteredReviewTab(tab: StoredReviewTab, agentDir = getAgentDir()): boolean {
  const registry = readRegistry(agentDir);
  for (const [project, tabs] of Object.entries(registry)) {
    const index = tabs.findIndex((existing) => existing.tabId === tab.tabId);
    if (index === -1) continue;
    const next = [...tabs];
    next[index] = { ...tab, owner: tabs[index].owner };
    registry[project] = next;
    writeRegistry(agentDir, registry);
    return true;
  }
  return false;
}

/** Forget a Tab, which is what closing one does. */
export function removeRegisteredReviewTab(tabId: string, agentDir = getAgentDir()): void {
  if (!tabId) return;
  const registry = readRegistry(agentDir);
  let changed = false;
  for (const [project, tabs] of Object.entries(registry)) {
    const kept = tabs.filter((existing) => existing.tabId !== tabId);
    if (kept.length === tabs.length) continue;
    changed = true;
    if (kept.length > 0) registry[project] = kept;
    else delete registry[project];
  }
  if (changed) writeRegistry(agentDir, registry);
}
