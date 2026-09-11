/**
 * The context menu on a Browser tab, drawn by the desktop process.
 *
 * The entries and their order come from the reference application, read from
 * its shipped bundle. A browser-only Reeve has no native menus, so this reports
 * that there is nothing to show rather than drawing a worse one in HTML.
 */
export type BrowserTabMenuAction =
  | "new-tab-right"
  | "reload"
  | "duplicate"
  | "rename"
  | "copy-url"
  | "open-external";

export interface BrowserTabMenuState {
  /** False for a Tab that has not been anywhere yet, which disables most of it. */
  hasUrl: boolean;
}

const ACTIONS = new Set<BrowserTabMenuAction>([
  "new-tab-right",
  "reload",
  "duplicate",
  "rename",
  "copy-url",
  "open-external",
]);

interface BrowserTabMenuBridge {
  showBrowserTabMenu: (state: BrowserTabMenuState) => Promise<unknown>;
}

function desktopBridge(): BrowserTabMenuBridge | undefined {
  const bridge = (
    globalThis as unknown as { ompDesktop?: BrowserTabMenuBridge }
  ).ompDesktop;
  return typeof bridge?.showBrowserTabMenu === "function" ? bridge : undefined;
}

export function hasBrowserTabMenu(): boolean {
  return Boolean(desktopBridge());
}

export async function showBrowserTabMenu(
  state: BrowserTabMenuState,
): Promise<BrowserTabMenuAction | null> {
  const bridge = desktopBridge();
  if (!bridge) return null;
  const action = await bridge.showBrowserTabMenu(state);
  // The menu is drawn by the other process, so what comes back is checked
  // rather than trusted, exactly as the Session menu does.
  return typeof action === "string" && ACTIONS.has(action as BrowserTabMenuAction)
    ? action as BrowserTabMenuAction
    : null;
}
