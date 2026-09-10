/**
 * Panel accelerators, as the desktop process reports them.
 *
 * The chords are matched in the main process rather than here, because a
 * focused web page swallows a renderer key handler, and a Browser tab is
 * exactly when one is most likely to be pressed. `desktop/desktop-runtime.cjs`
 * owns the chord table; this module owns the ids that table can produce, and a
 * test holds the two together so they cannot drift apart.
 *
 * The ids, their order and their accelerators all come from the reference
 * application's own command registry, read from its shipped bundle:
 *
 *   review     Ctrl+Shift+G    toggleReviewTab
 *   terminal   Control+\`       toggleTerminal
 *   browser    CmdOrCtrl+T     openBrowserTab
 *   files      CmdOrCtrl+P     searchFiles
 *   side-chat  CmdOrCtrl+Alt+S openSideChat
 */
export const PANEL_ACTION_IDS = [
  "review",
  "terminal",
  "browser",
  "files",
  "side-chat",
] as const;

export type PanelActionId = (typeof PANEL_ACTION_IDS)[number];

interface DesktopPanelActionBridge {
  onPanelAction: (callback: (action: unknown) => void) => () => void;
}

function desktopBridge(): DesktopPanelActionBridge | undefined {
  const bridge = (
    globalThis as unknown as { ompDesktop?: DesktopPanelActionBridge }
  ).ompDesktop;
  return typeof bridge?.onPanelAction === "function" ? bridge : undefined;
}

function isPanelActionId(value: unknown): value is PanelActionId {
  return typeof value === "string"
    && (PANEL_ACTION_IDS as readonly string[]).includes(value);
}

/**
 * Run `handler` each time the desktop process matches a panel accelerator.
 *
 * Returns an unsubscribe function. A browser has no desktop process, so there
 * this subscribes to nothing and unsubscribing is still safe to call.
 *
 * An id this build does not know is dropped: the desktop process and the page
 * it loaded can be different versions of Reeve.
 */
export function subscribeToPanelActions(
  handler: (action: PanelActionId) => void,
): () => void {
  const bridge = desktopBridge();
  if (!bridge) return () => {};
  return bridge.onPanelAction((action) => {
    if (isPanelActionId(action)) handler(action);
  });
}
