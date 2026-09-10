export type DesktopSessionMenuAction =
  | "rename"
  | "toggle-pin"
  | "toggle-unread"
  | "archive";

export interface DesktopSessionMenuState {
  pinned: boolean;
  unread: boolean;
}

const ACTIONS = new Set<DesktopSessionMenuAction>([
  "rename",
  "toggle-pin",
  "toggle-unread",
  "archive",
]);

interface DesktopSessionMenuBridge {
  showSessionMenu: (state: DesktopSessionMenuState) => Promise<unknown>;
}

function desktopBridge(): DesktopSessionMenuBridge | undefined {
  const bridge = (
    globalThis as unknown as { ompDesktop?: DesktopSessionMenuBridge }
  ).ompDesktop;
  return typeof bridge?.showSessionMenu === "function" ? bridge : undefined;
}

export function hasDesktopSessionMenu(): boolean {
  return Boolean(desktopBridge());
}

export async function showDesktopSessionMenu(
  state: DesktopSessionMenuState,
): Promise<DesktopSessionMenuAction | null> {
  const bridge = desktopBridge();
  if (!bridge) return null;
  const action = await bridge.showSessionMenu(state);
  return typeof action === "string" && ACTIONS.has(action as DesktopSessionMenuAction)
    ? action as DesktopSessionMenuAction
    : null;
}
