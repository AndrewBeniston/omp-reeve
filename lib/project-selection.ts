import { formatComposerName } from "./composer-intelligence";
import { applySavedProjectOrder } from "./project-order";
import type { SessionInfo } from "./types";

export const ADDED_PROJECTS_STORAGE_KEY = "reeve:added-project-paths";
export const REMOVED_PROJECTS_STORAGE_KEY = "omp-web:removed-projects";

export interface ProjectChoice {
  id: string;
  path: string;
  label: string;
  slug: string;
  selected: boolean;
}

export interface ProjectWorktreeResponse {
  isGit?: boolean;
  projectRoot?: string;
  worktrees?: Array<{
    path: string;
    branch: string | null;
    isMain: boolean;
  }>;
}

export interface ProjectEnvironment {
  environment: "Local" | "Worktree";
  branch: string | null;
  projectRoot: string | null;
}

export function normalizeProjectKey(project: string): string {
  const normalized = project.replace(/\\/g, "/").replace(/\/$/, "");
  return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function isManagedChatProject(project: string): boolean {
  return /[\\/]omp-cwd-\d{8}$/.test(project);
}

export function projectSlug(project: string): string {
  const normalized = project.replace(/[\\/]+$/, "");
  if (!normalized && project.includes("/")) return "/";
  if (/^[a-zA-Z]:$/.test(normalized)) return `${normalized}\\`;
  return normalized.split(/[\\/]/).at(-1) || normalized;
}

export function projectLabel(project: string): string {
  return formatComposerName(projectSlug(project));
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const key = normalizeProjectKey(path);
    if (!path || seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

export function buildProjectChoices({
  sessions,
  addedPaths,
  projectOrder,
  removedProjectKeys,
  selectedPath,
}: {
  sessions: SessionInfo[];
  addedPaths: string[];
  projectOrder: string[];
  removedProjectKeys: Set<string>;
  selectedPath: string | null;
}): ProjectChoice[] {
  const discovered = sessions
    .map((session) => session.projectRoot ?? session.cwd)
    .filter((path) => path && !isManagedChatProject(path));
  const selectedSession = selectedPath
    ? sessions.find((session) => normalizeProjectKey(session.cwd) === normalizeProjectKey(selectedPath))
    : null;
  const selectedProjectPath = selectedSession?.projectRoot ?? selectedPath;
  const selectedProject = selectedProjectPath && !isManagedChatProject(selectedProjectPath)
    ? selectedProjectPath
    : null;
  const paths = uniquePaths([
    ...addedPaths,
    ...discovered,
    ...(selectedProject ? [selectedProject] : []),
  ]).filter((path) => !removedProjectKeys.has(normalizeProjectKey(path)));
  const ordered = applySavedProjectOrder(paths, projectOrder);
  const selectedKey = selectedProject ? normalizeProjectKey(selectedProject) : null;
  return ordered.map((path) => ({
    id: normalizeProjectKey(path),
    path,
    label: projectLabel(path),
    slug: projectSlug(path),
    selected: selectedKey === normalizeProjectKey(path),
  }));
}

export function filterProjectChoices(choices: ProjectChoice[], query: string): ProjectChoice[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return choices;
  return choices.filter((choice) => (
    choice.label.toLowerCase().includes(normalized)
    || choice.slug.toLowerCase().includes(normalized)
    || choice.path.toLowerCase().includes(normalized)
  ));
}

export function projectEnvironmentFromWorktrees(
  selectedPath: string,
  response: ProjectWorktreeResponse,
): ProjectEnvironment {
  const selectedKey = normalizeProjectKey(selectedPath);
  const worktree = response.worktrees?.find((entry) => normalizeProjectKey(entry.path) === selectedKey);
  return {
    environment: worktree && !worktree.isMain ? "Worktree" : "Local",
    branch: response.isGit ? (worktree?.branch ?? null) : null,
    projectRoot: response.projectRoot ?? null,
  };
}

function loadStringArray(storage: Pick<Storage, "getItem"> | null | undefined, key: string): string[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function loadAddedProjectPaths(storage: Pick<Storage, "getItem"> | null | undefined): string[] {
  return uniquePaths(loadStringArray(storage, ADDED_PROJECTS_STORAGE_KEY));
}

export function loadRemovedProjectKeys(storage: Pick<Storage, "getItem"> | null | undefined): Set<string> {
  return new Set(loadStringArray(storage, REMOVED_PROJECTS_STORAGE_KEY).map(normalizeProjectKey));
}

export function rememberAddedProjectPath(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  project: string,
): string[] {
  const paths = uniquePaths([project, ...loadAddedProjectPaths(storage)]);
  try {
    storage?.setItem(ADDED_PROJECTS_STORAGE_KEY, JSON.stringify(paths));
    const restoredKey = normalizeProjectKey(project);
    const removed = loadStringArray(storage, REMOVED_PROJECTS_STORAGE_KEY)
      .filter((item) => normalizeProjectKey(item) !== restoredKey);
    storage?.setItem(REMOVED_PROJECTS_STORAGE_KEY, JSON.stringify(removed));
  } catch {
    // Privacy mode and storage quotas must not block project selection.
  }
  return paths;
}
