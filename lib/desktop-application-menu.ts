/**
 * The renderer half of the application menu.
 *
 * Windows and Linux have no system menu bar, so the renderer draws File, Edit,
 * View and Help and asks the main process to open the matching submenu. The
 * menu itself stays in the main process, so one definition carries both the
 * items and the keyboard shortcuts. ADR-0008.
 */

export const APPLICATION_MENU_IDS = ["file", "edit", "view", "help"] as const;

export type ApplicationMenuId = (typeof APPLICATION_MENU_IDS)[number];

export type ApplicationMenuAction = "new-chat" | "toggle-sidebar";

export type MenuOwner = "native" | "application-menu";

interface DesktopApplicationMenuBridge {
  showApplicationMenu: (state: { id: string; x: number; y: number }) => Promise<unknown>;
  onMenuAction?: (callback: (action: string) => void) => () => void;
}

function desktopBridge(): DesktopApplicationMenuBridge | undefined {
  const bridge = (
    globalThis as unknown as { ompDesktop?: DesktopApplicationMenuBridge }
  ).ompDesktop;
  return typeof bridge?.showApplicationMenu === "function" ? bridge : undefined;
}

/**
 * Reads which side owns the menu. The preload writes the answer onto the
 * document element, so no component tests the platform name itself.
 */
export function readMenuOwner(): MenuOwner {
  if (typeof document === "undefined") return "native";
  return document.documentElement.dataset.ompMenu === "application-menu"
    ? "application-menu"
    : "native";
}

export async function showApplicationMenu(
  id: ApplicationMenuId,
  point: { x: number; y: number },
): Promise<boolean> {
  const bridge = desktopBridge();
  if (!bridge) return false;
  const opened = await bridge.showApplicationMenu({
    id,
    x: Math.round(point.x),
    y: Math.round(point.y),
  });
  return opened === true;
}

export function subscribeApplicationMenuAction(
  callback: (action: ApplicationMenuAction) => void,
): () => void {
  const subscribe = desktopBridge()?.onMenuAction;
  if (!subscribe) return () => {};
  return subscribe((action) => {
    if (action === "new-chat" || action === "toggle-sidebar") callback(action);
  });
}
