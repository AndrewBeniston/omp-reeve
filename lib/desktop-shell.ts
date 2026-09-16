/**
 * Whether this page is the desktop application rather than a browser tab.
 *
 * The preload bridge is the only honest test: it exists when Electron put it
 * there, and a user agent string can be anything. Anything offered only on the
 * desktop — writing to the working tree, a native context menu — asks here.
 */
export function isDesktopShell(): boolean {
  return typeof globalThis !== "undefined" && Boolean((globalThis as { ompDesktop?: unknown }).ompDesktop);
}
