import type { BrowserTab, Tab } from "@/components/TabBar";

/**
 * Where a new Tab goes, and what a page may rename.
 *
 * Both answers were forced by the Tab context menu: "New tab to the right" is
 * the first thing that cares about order as a value rather than as an append,
 * and "Rename" is the first thing that has to survive the page renaming itself.
 */

/**
 * Place a Tab immediately after another, or at the end.
 *
 * An unknown neighbour appends, which is what every caller other than the
 * context menu wants and what the panel did before it existed.
 */
export function insertTabAfter(tabs: Tab[], tab: Tab, afterId?: string): Tab[] {
  const after = afterId ? tabs.findIndex((t) => t.id === afterId) : -1;
  if (after < 0) return [...tabs, tab];
  return [...tabs.slice(0, after + 1), tab, ...tabs.slice(after + 1)];
}

/**
 * Take the name a page announced for itself.
 *
 * A Tab the human renamed keeps its name. Letting the page overwrite it would
 * quietly undo the rename the moment the page navigated, which is exactly when
 * somebody would notice and not know why.
 */
export function applyPageTitle(tabs: Tab[], tabId: string, title: string): Tab[] {
  return tabs.map((t) => (
    t.id === tabId && t.kind === "browser" && !t.titleLocked && t.label !== title
      ? { ...t, label: title }
      : t
  ));
}

/** Name a Tab by hand, and stop the page from renaming it again. */
export function renameBrowserTab(tabs: Tab[], tabId: string, name: string): Tab[] {
  return tabs.map((t) => (
    t.id === tabId && t.kind === "browser"
      ? { ...t, label: name, titleLocked: true } satisfies BrowserTab
      : t
  ));
}
