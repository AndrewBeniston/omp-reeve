export const MOBILE_MAX_WIDTH = 640;
export const SPLIT_PANEL_MIN_WIDTH = 960;

export const SIDEBAR_DEFAULT_WIDTH = 275;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;

export const RIGHT_PANEL_FALLBACK_WIDTH = 560;
/**
 * The reference application's floor for its content pane. Measured from its
 * shipped bundle, not guessed.
 */
export const RIGHT_PANEL_MIN_WIDTH = 320;
export const RIGHT_PANEL_MAX_WIDTH = 1200;

/**
 * How the reference application sizes the pane a web page opens into.
 *
 * Every number here was read from its shipped bundle. Its pane is sized by
 * **aspect ratio against the window height**, not as a fraction of the width,
 * which is why it reads as most of the chat area on an ordinary window and
 * still behaves on a short one.
 *
 * - `PANE_ASPECT`: the pane wants to be 16:10 against the shell height.
 * - `CHAT_RESERVE_WIDE`: the width left for the chat when the aspect wins.
 * - `PANE_FALLBACK`: the width used when the aspect cannot be honoured.
 * - `CHAT_RESERVE`: the width left for the chat in every other case, and the
 *   same reserve its maximum width uses.
 */
const PANE_ASPECT = 16 / 10;
const CHAT_RESERVE_WIDE = 500;
const PANE_FALLBACK = 640;
const CHAT_RESERVE = 352;

const COMPACT_CHAT_MIN_WIDTH = 320;
const DESKTOP_CHAT_MIN_WIDTH = 420;

export type PanelWidthCssValue = `${number}px`;

export function getPanelWidthCssValue(width: number): PanelWidthCssValue {
  return `${width}px`;
}

export function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  const finiteWidth = Number.isFinite(width) ? width : minWidth;
  const effectiveMax = Math.max(minWidth, maxWidth);
  return Math.round(Math.max(minWidth, Math.min(effectiveMax, finiteWidth)));
}

export function getDefaultRightPanelWidth(viewportWidth: number): number {
  return clampPanelWidth(viewportWidth * 0.42, 360, 640);
}

/**
 * The width a Browser tab opens into, matching the reference application.
 *
 * `workspaceWidth` is the room beside the navigation sidebar, and
 * `shellHeight` is the window's usable height. The pane takes the wider of an
 * aspect-driven width and a fixed fallback, each capped so the chat keeps a
 * usable column, and never goes below the floor.
 *
 * It is applied as a floor when a Browser tab opens, so a panel the human has
 * already dragged wider is left alone.
 */
export function getBrowserTabPanelWidth(options: {
  shellHeight: number;
  workspaceWidth: number;
}): number {
  const { shellHeight, workspaceWidth } = options;
  return Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    Math.min(shellHeight * PANE_ASPECT, workspaceWidth - CHAT_RESERVE_WIDE),
    Math.min(PANE_FALLBACK, workspaceWidth - CHAT_RESERVE),
  );
}

export function getSidebarMaxWidth(options: {
  viewportWidth: number;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
}): number {
  const { viewportWidth, rightPanelOpen, rightPanelWidth } = options;
  if (viewportWidth <= MOBILE_MAX_WIDTH) return SIDEBAR_MAX_WIDTH;

  const compact = viewportWidth < SPLIT_PANEL_MIN_WIDTH;
  const chatWidth = compact ? COMPACT_CHAT_MIN_WIDTH : DESKTOP_CHAT_MIN_WIDTH;
  const visibleRightPanelWidth = !compact && rightPanelOpen ? rightPanelWidth : 0;
  return Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - chatWidth - visibleRightPanelWidth);
}

export function getRightPanelMaxWidth(options: {
  viewportWidth: number;
  sidebarOpen: boolean;
  sidebarWidth: number;
}): number {
  const { viewportWidth, sidebarOpen, sidebarWidth } = options;
  if (viewportWidth < SPLIT_PANEL_MIN_WIDTH) return RIGHT_PANEL_MAX_WIDTH;

  const visibleSidebarWidth = sidebarOpen ? sidebarWidth : 0;
  // The reference application caps its pane at the workspace width less a
  // fixed reserve for the chat, with no absolute ceiling. A fixed ceiling made
  // the pane stop growing part-way across a wide display, which is the one
  // place a web page most wants the room.
  return Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    viewportWidth - visibleSidebarWidth - CHAT_RESERVE,
  );
}
