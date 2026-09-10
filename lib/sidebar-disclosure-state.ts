const COLLAPSED_PROJECTS_STORAGE_KEY = "omp-web:collapsed-projects";

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function getApplicationStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function loadCollapsedProjectIds(
  storage: StorageLike | null = getApplicationStorage(),
): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(COLLAPSED_PROJECTS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((path): path is string => typeof path === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveCollapsedProjectIds(
  projects: Set<string>,
  storage: StorageLike | null = getApplicationStorage(),
): void {
  if (!storage) return;
  try {
    if (projects.size === 0) storage.removeItem(COLLAPSED_PROJECTS_STORAGE_KEY);
    else storage.setItem(COLLAPSED_PROJECTS_STORAGE_KEY, JSON.stringify([...projects]));
  } catch {
    // Ignore storage errors.
  }
}
