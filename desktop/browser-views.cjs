/* eslint-disable @typescript-eslint/no-require-imports */
const { BROWSER_PARTITION } = require("./desktop-runtime.cjs");

/**
 * Browser tabs, as pages the main process owns.
 *
 * A Browser tab used to be a <webview> guest inside the renderer. That was
 * simpler to lay out and it made the tab invisible to the agent: Chromium
 * reports a guest as a webview target, and OMP browser tool keeps only page
 * targets. Pointed at Reeve, it could see nothing but Reeve own interface, and
 * would have driven the application instead of the page.
 *
 * A WebContentsView is a first-class page target, so the agent sees the tab
 * with its real URL and title and no upstream change is needed. The cost is
 * layout: this view is positioned by the main process in window coordinates,
 * not by CSS, so the renderer measures a placeholder and reports the rectangle
 * it wants the page drawn in.
 */

/**
 * The privileges a Browser page gets, whatever it later asks for.
 *
 * Pure, and the same contract the guest had. A Browser tab is a plain web
 * page: it needs no bridge into the application, and the agent reaches it from
 * outside over the debugging protocol rather than through an injected script,
 * so there is nothing for a preload to do.
 */
function browserPagePreferences() {
  return {
    sandbox: true,
    contextIsolation: true,
    webSecurity: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false,
    allowRunningInsecureContent: false,
    plugins: false,
    // A page may never create a guest.
    webviewTag: false,
    // One shared, persistent jar for every Browser tab, and never the
    // application own: the renderer holds the desktop launch token, and no web
    // page may share a session with that.
    partition: BROWSER_PARTITION,
  };
}

/**
 * A rectangle the renderer measured, made safe to hand to Electron.
 *
 * Returns null for anything that is not a usable rectangle. A hidden tab
 * measures as zero, and a view given a zero or negative size is an invisible
 * page or worse, so it is never passed through. Values are rounded because
 * Electron wants integers and a fractional device pixel ratio produces
 * fractions.
 */
function normalizeBounds(rect) {
  if (!rect) return null;
  const x = Math.round(Number(rect.x));
  const y = Math.round(Number(rect.y));
  const width = Math.round(Number(rect.width));
  const height = Math.round(Number(rect.height));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

/**
 * Every open Browser page, and the rules about who may speak to one.
 *
 * A tab belongs to the window that opened it, exactly as a Terminal does. The
 * renderer names its own tab id here rather than being given one, because the
 * page is a surface the renderer already tracks; ownership is still checked on
 * every call, so naming another window tab reaches nothing.
 *
 * createView, attach and detach are injected so the registry can be exercised
 * without Electron.
 */
function createBrowserViewRegistry({ createView, attach, detach }) {
  /** key -> { view, ownerId, tabId } */
  const pages = new Map();

  const key = (ownerId, tabId) => ownerId + "\u0000" + tabId;

  function get(ownerId, tabId) {
    return pages.get(key(ownerId, tabId));
  }

  return {
    /**
     * Open a page for a tab, or return the one already open.
     *
     * Opening is idempotent: a renderer that remounts must not end up with two
     * pages drawn on top of each other.
     */
    open({ ownerId, tabId, url, bounds }) {
      if (get(ownerId, tabId)) return { ok: true, id: tabId, reused: true };

      const view = createView(browserPagePreferences());
      pages.set(key(ownerId, tabId), { view, ownerId, tabId });
      attach(view, ownerId);

      const rect = normalizeBounds(bounds);
      if (rect) view.setBounds(rect);
      // A tab opened from the launcher has no address yet: the human types one.
      // about:blank rather than nothing, because a view with no page never
      // finishes loading and its events would not fire.
      view.webContents.loadURL(url || "about:blank");
      return { ok: true, id: tabId, reused: false };
    },

    /** The panel moved or resized, so the page follows it. */
    setBounds(ownerId, tabId, bounds) {
      const page = get(ownerId, tabId);
      const rect = normalizeBounds(bounds);
      if (!page || !rect) return false;
      page.view.setBounds(rect);
      return true;
    },

    /**
     * Show or hide a page.
     *
     * An inactive tab is hidden rather than closed, because its page is live
     * and the human expects to come back to where they were.
     */
    setVisible(ownerId, tabId, visible) {
      const page = get(ownerId, tabId);
      if (!page) return false;
      page.view.setVisible(visible === true);
      return true;
    },

    /** Go somewhere. A bare host becomes https rather than a relative path. */
    navigate(ownerId, tabId, rawUrl) {
      const page = get(ownerId, tabId);
      const candidate = typeof rawUrl === "string" ? rawUrl.trim() : "";
      if (!page || !candidate) return false;
      const url = /^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : "https://" + candidate;
      page.view.webContents.loadURL(url);
      return true;
    },

    /** Back, forward, reload. Anything else is not a navigation control. */
    command(ownerId, tabId, name) {
      const page = get(ownerId, tabId);
      if (!page) return false;
      const contents = page.view.webContents;
      switch (name) {
        case "back":
          if (contents.canGoBack()) contents.goBack();
          return true;
        case "forward":
          if (contents.canGoForward()) contents.goForward();
          return true;
        case "reload":
          contents.reload();
          return true;
        default:
          return false;
      }
    },

    /** The tab closed, so its page goes with it. */
    close(ownerId, tabId) {
      const page = get(ownerId, tabId);
      if (!page) return false;
      pages.delete(key(ownerId, tabId));
      detach(page.view, ownerId);
      return true;
    },

    /** Every page a window owns, closed with it. */
    closeAllFor(ownerId) {
      for (const [mapKey, page] of pages) {
        if (page.ownerId !== ownerId) continue;
        pages.delete(mapKey);
        detach(page.view, ownerId);
      }
    },

    /**
     * Reload every open page, and report how many.
     *
     * A page already on screen keeps its own memory of being signed in until
     * it reloads, so clearing the stored data without this leaves a tab
     * looking signed in against a store that no longer agrees.
     */
    reloadAll() {
      let reloaded = 0;
      for (const page of pages.values()) {
        page.view.webContents.reload();
        reloaded += 1;
      }
      return reloaded;
    },
    /** The page behind a tab, for wiring its events. */
    contentsFor(ownerId, tabId) {
      const page = get(ownerId, tabId);
      return page ? page.view.webContents : undefined;
    },

    get size() {
      return pages.size;
    },
  };
}

module.exports = {
  browserPagePreferences,
  createBrowserViewRegistry,
  normalizeBounds,
};
