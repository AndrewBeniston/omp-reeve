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

/**
 * Jump straight to one Tab by its place in the strip.
 *
 * Nine, because the reference application stops at nine: the tenth Tab and
 * everything after it is reached by stepping.
 */
export type TabFocusAction =
  | "focus-tab-1"
  | "focus-tab-2"
  | "focus-tab-3"
  | "focus-tab-4"
  | "focus-tab-5"
  | "focus-tab-6"
  | "focus-tab-7"
  | "focus-tab-8"
  | "focus-tab-9";

export const TAB_FOCUS_POSITIONS: Record<TabFocusAction, number> = {
  "focus-tab-1": 1,
  "focus-tab-2": 2,
  "focus-tab-3": 3,
  "focus-tab-4": 4,
  "focus-tab-5": 5,
  "focus-tab-6": 6,
  "focus-tab-7": 7,
  "focus-tab-8": 8,
  "focus-tab-9": 9,
};

export type ApplicationMenuAction =
  | "new-chat"
  | "toggle-sidebar"
  | "open-terminal-tab"
  | "open-browser-tab"
  | "open-files"
  | "next-tab"
  | "previous-tab"
  | "reopen-closed-tab"
  | "close-other-tabs"
  | "focus-browser-address"
  | "browser-back"
  | "browser-forward"
  | "toggle-maximise-panel"
  | TabFocusAction;

const ACTIONS = new Set<string>([
  "new-chat",
  "toggle-sidebar",
  "open-terminal-tab",
  "open-browser-tab",
  "open-files",
  "next-tab",
  "previous-tab",
  "reopen-closed-tab",
  "close-other-tabs",
  "focus-browser-address",
  "browser-back",
  "browser-forward",
  "toggle-maximise-panel",
  ...Object.keys(TAB_FOCUS_POSITIONS),
]);

/** True when this action jumps straight to one Tab rather than doing anything else. */
export function isTabFocusAction(action: ApplicationMenuAction): action is TabFocusAction {
  return Object.hasOwn(TAB_FOCUS_POSITIONS, action);
}

function isApplicationMenuAction(action: string): action is ApplicationMenuAction {
  return ACTIONS.has(action);
}

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
    if (isApplicationMenuAction(action)) callback(action);
  });
}
