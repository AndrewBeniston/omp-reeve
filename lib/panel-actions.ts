/**
 * The five things the right panel can open, and the chord that opens each.
 *
 * Three surfaces name the same five things: the launcher the empty panel
 * shows, the plus control at the end of the Tab strip, and the application
 * menu. The menu owns the chords. A renderer key handler is swallowed
 * whenever a guest has focus, which is exactly when Cmd+T is pressed, so the
 * chord has to be registered where Electron registers it. The launcher only
 * prints the chord beside its row.
 *
 * The ids, their order and their accelerators come from the reference
 * application's own command registry, read from its shipped bundle.
 *
 * `desktop/desktop-runtime.cjs` holds the same ids and chords for the menu
 * itself. The Electron main process cannot import this file, and a module
 * shared with the renderer would drag renderer code into the packaged shell.
 * A test in `desktop/desktop-runtime.test.mjs` fails when the two disagree.
 */

export const PANEL_ACTION_ORDER = ["review", "terminal", "browser", "files", "side-chat"] as const;

export type PanelActionId = (typeof PANEL_ACTION_ORDER)[number];

/** Electron accelerator strings, not labels. `useAcceleratorLabel` renders them. */
export const PANEL_ACCELERATORS: Record<PanelActionId, string> = {
  review: "Ctrl+Shift+G",
  terminal: "Control+`",
  browser: "CmdOrCtrl+T",
  files: "CmdOrCtrl+P",
  "side-chat": "CmdOrCtrl+Alt+S",
};

/** Surfaces with a connected panel entry point. */
export const BUILT_PANEL_ACTIONS: readonly PanelActionId[] = ["review", "terminal", "browser", "files"];

/**
 * The chord that fills the right panel's room, or gives the width back.
 *
 * Written here as well as in `desktop/desktop-runtime.cjs` for the same reason
 * the panel chords above are: the Electron main process cannot import a
 * renderer module, and the panel's own control shows the chord the menu
 * registers. A test in `desktop/desktop-runtime.test.mjs` fails when the two
 * disagree.
 */
export const MAXIMISE_PANEL_ACCELERATOR = "Control+]";

/** The chord that shows or hides the right panel, as the reference binds it. */
export const TOGGLE_PANEL_ACCELERATOR = "CmdOrCtrl+Alt+B";

/**
 * The Tab a step lands on.
 *
 * The strip is a ring, not a line: stepping past the last Tab reaches the
 * first. Returns null when there is no Tab to land on. An active Tab that is
 * not in the list, which happens for one render after a close, steps from the
 * start rather than refusing to move.
 */
export function stepTabIndex(count: number, activeIndex: number, offset: number): number | null {
  if (count <= 0) return null;
  const from = activeIndex >= 0 && activeIndex < count ? activeIndex : 0;
  return (((from + offset) % count) + count) % count;
}

/**
 * Whether closing this kind of Tab is worth remembering.
 *
 * A Terminal is not. Its shell ended when the Tab closed, so reopening one
 * would hand back a dead shell wearing a live one's name. That is the same
 * rule that keeps Terminals out of the per-Project restore.
 */
export function isReopenableTabKind(kind: string): boolean {
  return kind !== "terminal";
}
