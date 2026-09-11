/**
 * What Reeve remembers about a Project's Browser tabs.
 *
 * Pure on purpose, and free of any node import: the renderer decides what to
 * store, so this module is bundled for the browser. The registry that writes it
 * to disk is `lib/browser-tab-registry.ts`, which is server-only. Putting the
 * two together pulled the whole OMP SDK into the client bundle and broke the
 * build, which is the sort of thing a typecheck will not tell you.
 *
 * Only the address and the order are kept. A Tab is not a page: its id is
 * minted per Tab and addressed by the agent, its title comes from the page and
 * its favicon arrives with it, so storing those would restore a snapshot of a
 * page that has since changed.
 */

/** One remembered Tab. Deliberately only what reopening needs. */
export interface StoredBrowserTab {
  url: string;
}

/** What a Tab looks like here. Structural, to avoid importing the interface. */
interface TabLike {
  kind: string;
  url?: string;
}

/**
 * The Tabs worth remembering, in the order they were open.
 *
 * Terminals are never remembered. A restored Terminal would be a dead shell
 * wearing a live one's clothes, and the human would find out by typing into it.
 * Files and other kinds belong to a Session, not to a Project.
 *
 * A Tab that never went anywhere is dropped: restoring an empty Tab restores
 * nothing anybody would miss.
 */
export function toStoredBrowserTabs(tabs: readonly TabLike[]): StoredBrowserTab[] {
  return tabs
    .filter((tab) => tab.kind === "browser" && typeof tab.url === "string" && tab.url.length > 0)
    .map((tab) => ({ url: tab.url as string }));
}

/**
 * Read back what was stored, discarding anything that is not a usable address.
 *
 * The file is on disk and can be edited or truncated, so nothing from it
 * reaches the Tab model unchecked.
 */
export function fromStoredBrowserTabs(stored: unknown): StoredBrowserTab[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .filter((entry): entry is { url: string } => (
      typeof entry === "object" && entry !== null
      && typeof (entry as { url?: unknown }).url === "string"
      && (entry as { url: string }).url.length > 0
    ))
    .map((entry) => ({ url: entry.url }));
}
