"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { useI18n } from "@/hooks/useI18n";
import type { BrowserTab } from "@/components/TabBar";
import styles from "./browser.module.css";

/**
 * The host alone, which is what the address shows while a page is being read.
 * An address Reeve cannot parse is shown whole rather than hidden.
 */
function hostLabel(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The rectangle a page should be drawn in, in window coordinates. */
interface PageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The desktop bridge for Browser tabs.
 *
 * A page is owned and drawn by the main process, not by this renderer. That is
 * what makes it a first-class page target the agent can see; the cost is that
 * layout becomes a conversation, and this side of it is measurement.
 */
interface BrowserBridge {
  open(request: { tabId: string; url: string; bounds: PageBounds }): Promise<{ ok: boolean; reused?: boolean }>;
  setBounds(tabId: string, bounds: PageBounds): Promise<boolean>;
  setVisible(tabId: string, visible: boolean): Promise<boolean>;
  navigate(tabId: string, url: string): Promise<boolean>;
  command(tabId: string, name: "back" | "forward" | "reload"): Promise<boolean>;
  close(tabId: string): Promise<boolean>;
  onNavigated(tabId: string, callback: (payload: { url: string; canGoBack: boolean; canGoForward: boolean }) => void): () => void;
  onTitle(tabId: string, callback: (title: string) => void): () => void;
  onFavicon(tabId: string, callback: (faviconUrl: string) => void): () => void;
}

function browserBridge(): BrowserBridge | undefined {
  return (window as { ompDesktop?: { browser?: BrowserBridge } }).ompDesktop?.browser;
}

/**
 * Send one navigation command to a Browser tab.
 *
 * Exported so the Tab context menu can reload a page without reaching for the
 * bridge itself. Returns false where there is no desktop process.
 */
export async function browserTabCommand(
  tabId: string,
  name: "back" | "forward" | "reload",
): Promise<boolean> {
  const bridge = browserBridge();
  return bridge ? bridge.command(tabId, name) : false;
}
/**
 * True once the renderer is known to be running inside the desktop shell.
 *
 * Only the desktop process can own a page, so the browser version of Reeve has
 * no Browser tab to offer. The answer arrives in an effect rather than during
 * render, because reading the window while rendering would make the server and
 * client trees differ.
 */
export function useSupportsBrowserTab(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(Boolean(browserBridge()));
  }, []);
  return supported;
}

interface Props {
  tabs: BrowserTab[];
  activeTabId: string | null;
  onNavigate: (tabId: string, url: string) => void;
  onTitleChange: (tabId: string, title: string) => void;
  onFaviconChange: (tabId: string, faviconUrl: string) => void;
}

/**
 * Every open Browser tab.
 *
 * All stay mounted. A page is a live process with the human place in it, and
 * closing one to switch tabs would throw that away, so an inactive tab is
 * hidden by the main process instead.
 */
export function BrowserTabs({ tabs, activeTabId, onNavigate, onTitleChange, onFaviconChange }: Props) {
  const { t } = useI18n();
  const supported = useSupportsBrowserTab();

  if (!supported) {
    return <div className={styles.browserUnavailable}>{t("browser.desktopOnly")}</div>;
  }

  return (
    <div className={styles.browserTabs}>
      {tabs.map((tab) => (
        <BrowserPage
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onNavigate={onNavigate}
          onTitleChange={onTitleChange}
          onFaviconChange={onFaviconChange}
        />
      ))}
    </div>
  );
}

interface PageProps {
  tab: BrowserTab;
  isActive: boolean;
  onNavigate: (tabId: string, url: string) => void;
  onTitleChange: (tabId: string, title: string) => void;
  onFaviconChange: (tabId: string, faviconUrl: string) => void;
}

function BrowserPage({ tab, isActive, onNavigate, onTitleChange, onFaviconChange }: PageProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const [history, setHistory] = useState({ canGoBack: false, canGoForward: false });

  /**
   * Which mount of this Tab owns the page.
   *
   * The page lives in the main process and is keyed by the Tab, not by this
   * component, so two mounts of the same Tab name the same page. React mounts,
   * unmounts and remounts an effect in development, and without this the first
   * mount's cleanup closes the page the second mount just opened, leaving a Tab
   * with nothing behind it.
   */
  const mountRef = useRef(0);

  // Read inside listeners bound once, which must not close over stale props.
  const callbacks = useRef({ onNavigate, onTitleChange, onFaviconChange });
  callbacks.current = { onNavigate, onTitleChange, onFaviconChange };

  // An empty Tab puts the human in the address bar, because there is nothing
  // else for them to do with it.
  useEffect(() => {
    if (!isActive || tab.url) return;
    urlRef.current?.focus();
  }, [isActive, tab.url]);

  useEffect(() => {
    const host = hostRef.current;
    const bridge = browserBridge();
    if (!host || !bridge) return;


    // The page is drawn where this placeholder sits. Everything else in this
    // effect exists to keep those two rectangles the same one.
    const measure = (): PageBounds => {
      const rect = host.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    };

    const mine = mountRef.current + 1;
    mountRef.current = mine;
    const opening = bridge.open({ tabId: tab.id, url: tab.url, bounds: measure() });

    const stopNavigated = bridge.onNavigated(tab.id, ({ url, canGoBack, canGoForward }) => {
      setHistory({ canGoBack, canGoForward });
      // about:blank is the empty Tab resting state, not somewhere the human
      // went, so it never becomes the Tab address.
      if (url && url !== "about:blank") callbacks.current.onNavigate(tab.id, url);
      if (urlRef.current && document.activeElement !== urlRef.current) {
        urlRef.current.value = url === "about:blank" ? "" : hostLabel(url);
      }
    });
    const stopTitle = bridge.onTitle(tab.id, (title) => {
      if (title) callbacks.current.onTitleChange(tab.id, title);
    });
    const stopFavicon = bridge.onFavicon(tab.id, (faviconUrl) => {
      callbacks.current.onFaviconChange(tab.id, faviconUrl);
    });

    // The panel resizes with a drag, the sidebar opens, the window moves. Any
    // of those changes where the placeholder is, and the page must follow it
    // in the same frame or it visibly lags behind the interface.
    const report = () => {
      const bounds = measure();
      // A hidden Tab measures as zero. Reporting that would resize the page to
      // nothing, so visibility is what hides it, not a zero rectangle.
      if (bounds.width < 1 || bounds.height < 1) return;
      void bridge.setBounds(tab.id, bounds);
    };
    const observer = new ResizeObserver(report);
    observer.observe(host);
    window.addEventListener("resize", report);
    window.addEventListener("scroll", report, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
      window.removeEventListener("scroll", report, true);
      stopNavigated();
      stopTitle();
      stopFavicon();
      // Wait for the open to settle, or a Tab closed in the same tick as it
      // opened would leave a page running that nothing can reach.
      void opening.then(() => {
        // A later mount of this same Tab owns the page now, so this cleanup is
        // a remount rather than a closure and must leave the page alone.
        if (mountRef.current !== mine) return;
        void bridge.close(tab.id);
      });
    };
    // The page belongs to this Tab. tab.url is its opening address only: later
    // changes come from the page itself, so re-running this would fight the
    // human navigation and throw away their place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  // Switching tabs hides a page rather than closing it, and a Tab that becomes
  // visible was measured as zero while hidden, so it re-measures on the way in.
  useEffect(() => {
    const bridge = browserBridge();
    const host = hostRef.current;
    if (!bridge || !host) return;
    if (isActive) {
      const rect = host.getBoundingClientRect();
      if (rect.width >= 1 && rect.height >= 1) {
        void bridge.setBounds(tab.id, { x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      }
    }
    void bridge.setVisible(tab.id, isActive);
  }, [isActive, tab.id]);

  const submitUrl = useCallback((raw: string) => {
    const bridge = browserBridge();
    if (!bridge) return;
    void bridge.navigate(tab.id, raw);
  }, [tab.id]);

  const run = useCallback((name: "back" | "forward" | "reload") => {
    void browserBridge()?.command(tab.id, name);
  }, [tab.id]);

  return (
    <div className={styles.browserTab} data-active={isActive} data-browser-tab={tab.id}>
      <div className={styles.browserChrome}>
        <div className={styles.browserNav}>
          <IconButton
            className={styles.browserNavButton}
            label={t("browser.back")}
            title={t("browser.back")}
            disabled={!history.canGoBack}
            onClick={() => run("back")}
          >
            {/* An arrow, not a chevron: shaft plus head, as the reference draws it. */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 7H2" />
              <path d="M6 3 2 7l4 4" />
            </svg>
          </IconButton>
          <IconButton
            className={styles.browserNavButton}
            label={t("browser.forward")}
            title={t("browser.forward")}
            disabled={!history.canGoForward}
            onClick={() => run("forward")}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 7h10" />
              <path d="m8 3 4 4-4 4" />
            </svg>
          </IconButton>
          <IconButton
            className={styles.browserNavButton}
            label={t("browser.reload")}
            title={t("browser.reload")}
            onClick={() => run("reload")}
          >
            {/* Two opposed arcs, the reference reload glyph. */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 6.2A5.2 5.2 0 0 0 3.3 3.6L2 4.9" />
              <path d="M2 7.8a5.2 5.2 0 0 0 8.7 2.6l1.3-1.3" />
              <path d="M2 2v2.9h2.9M12 12V9.1H9.1" />
            </svg>
          </IconButton>
        </div>
        {/*
          * The address sits centred and shows the host alone, the way the
          * reference does. Focusing it reveals the whole address to edit, so
          * the row stays quiet while a page is simply being read.
          */}
        <input
          ref={urlRef}
          className={styles.browserUrl}
          defaultValue={tab.url}
          aria-label={t("browser.address")}
          placeholder={t("browser.addressPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          onFocus={(event) => {
            event.currentTarget.value = tab.url;
            event.currentTarget.select();
          }}
          onBlur={(event) => {
            event.currentTarget.value = hostLabel(tab.url);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            submitUrl(event.currentTarget.value);
            event.currentTarget.blur();
          }}
        />
      </div>
      {/*
        * The page is not in this tree. This is the rectangle it is drawn in,
        * measured and reported to the main process, which owns the page so the
        * agent can see it as a page target.
        */}
      <div ref={hostRef} className={styles.browserHost} />
    </div>
  );
}
