export type DesktopProjectMenuAction =
  | { type: "archive-chats" }
  | { type: "remove-project" }
  | { type: "select-worktree"; index: number };

export interface DesktopProjectMenuState {
  archiveEnabled: boolean;
  worktrees: Array<{
    label: string;
    current: boolean;
  }>;
}

interface DesktopProjectMenuBridge {
  showProjectMenu: (state: DesktopProjectMenuState) => Promise<unknown>;
}

function desktopBridge(): DesktopProjectMenuBridge | undefined {
  const bridge = (
    globalThis as unknown as { ompDesktop?: DesktopProjectMenuBridge }
  ).ompDesktop;
  return typeof bridge?.showProjectMenu === "function" ? bridge : undefined;
}

export function hasDesktopProjectMenu(): boolean {
  return Boolean(desktopBridge());
}

export async function showDesktopProjectMenu(
  state: DesktopProjectMenuState,
): Promise<DesktopProjectMenuAction | null> {
  const bridge = desktopBridge();
  if (!bridge) return null;
  const action = await bridge.showProjectMenu(state) as Partial<DesktopProjectMenuAction> | null;
  if (action?.type === "archive-chats" || action?.type === "remove-project") {
    return { type: action.type };
  }
  const index = action?.type === "select-worktree" ? action.index : undefined;
  if (Number.isInteger(index)
    && typeof index === "number"
    && index >= 0
    && index < state.worktrees.length) {
    return { type: "select-worktree", index };
  }
  return null;
}
