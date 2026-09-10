export function normalizeProjectOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const order: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    order.push(item);
  }
  return order;
}

/**
 * Codex keeps newly discovered projects before projects from an older saved order.
 * Missing saved projects do not occupy a visible position.
 */
export function applySavedProjectOrder(projects: string[], savedOrder: string[]): string[] {
  const available = new Set(projects);
  const saved = normalizeProjectOrder(savedOrder).filter((project) => available.has(project));
  const savedSet = new Set(saved);
  return [...projects.filter((project) => !savedSet.has(project)), ...saved];
}

export function reorderProjectIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  const [active] = next.splice(from, 1);
  if (!active) return ids;
  next.splice(to, 0, active);
  return next;
}

export function mergeVisibleProjectOrder(
  completeOrder: string[],
  previousVisibleOrder: string[],
  nextVisibleOrder: string[],
): string[] {
  const visible = new Set(previousVisibleOrder);
  let visibleIndex = 0;
  return completeOrder.map((project) => {
    if (!visible.has(project)) return project;
    return nextVisibleOrder[visibleIndex++] ?? project;
  });
}
