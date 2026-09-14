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

/**
 * The surfaces Reeve has built.
 *
 * Review and Side chat are declared in the Tab union and unbuilt. Both are
 * listed everywhere, and disabled everywhere, so a human can see what the
 * panel will hold without being offered a chord that does nothing.
 */
export const BUILT_PANEL_ACTIONS: readonly PanelActionId[] = ["terminal", "browser", "files"];
