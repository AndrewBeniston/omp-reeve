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

/**
 * Electron's <webview> element. It is not in React's JSX namespace, and it is
 * not a DOM type either, so the attributes we set are declared here rather than
 * asserted away at each call site.
 */
interface WebviewElement extends HTMLElement {
  src: string;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
}

/**
 * True once the renderer is known to be running inside the desktop shell, which
 * is the only place a guest can exist. In a browser the element is unknown and
 * would render as an empty inline box, so the panel says so instead of showing
 * nothing.
 *
 * It reports false on the server and on the first client render, then true.
 * Reading `window` during render would make the server and client trees differ
 * and fail hydration, so the answer arrives in an effect instead.
 */
export function useSupportsBrowserTab(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(Boolean((window as { ompDesktop?: unknown }).ompDesktop));
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
 * Renders every open Browser tab, showing the active one.
 *
 * All of them stay mounted on purpose: a guest reloads if it is remounted or
 * reparented, so switching tabs or collapsing the panel would otherwise throw
 * the page away and return the human to the top of it.
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
        <BrowserGuest
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

interface GuestProps {
  tab: BrowserTab;
  isActive: boolean;
  onNavigate: (tabId: string, url: string) => void;
  onTitleChange: (tabId: string, title: string) => void;
  onFaviconChange: (tabId: string, faviconUrl: string) => void;
}

function BrowserGuest({ tab, isActive, onNavigate, onTitleChange, onFaviconChange }: GuestProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const guestRef = useRef<WebviewElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);
  // Focused, the field shows the whole address to edit. Otherwise it shows the
  // host, which is what a human needs to know at a glance.

  // Read inside the guest's own listeners, which are bound once and must not
  // close over a stale url.
  const emptyRef = useRef(!tab.url);
  emptyRef.current = !tab.url;

  // An empty Tab puts the human in the address bar, because there is nothing
  // else for them to do with it.
  useEffect(() => {
    if (!isActive || tab.url) return;
    urlRef.current?.focus();
  }, [isActive, tab.url]);

  // The guest is created imperatively and never re-created. React must not own
  // it: a re-render that replaced the element would reload the page.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || guestRef.current) return;

    const guest = document.createElement("webview") as WebviewElement;
    guest.className = styles.browserGuest;
    // A Tab opened from the launcher has no address yet: the human types one.
    // about:blank rather than no src at all, because a guest with no src never
    // finishes attaching and its events would not fire.
    guest.setAttribute("src", tab.url || "about:blank");
    // Nothing else is set here. The main process assigns the partition and
    // forces every privilege on attach, and an attribute set here would be
    // discarded there anyway.
    host.append(guest);
    guestRef.current = guest;

    const handleNavigated = (): void => {
      const next = guest.getURL();
      // about:blank is the empty Tab's resting state, not somewhere the human
      // went, so it never becomes the Tab's address.
      if (next && next !== "about:blank") onNavigate(tab.id, next);
      if (urlRef.current && document.activeElement !== urlRef.current) {
        // Not focused, so the address reads as a label: host only.
        urlRef.current.value = next === "about:blank" ? "" : hostLabel(next);
      }
    };
    const handleTitle = (event: Event): void => {
      const title = (event as unknown as { title?: string }).title ?? guest.getTitle();
      if (title) onTitleChange(tab.id, title);
    };
    const handleReady = (): void => {
      if (!emptyRef.current) return;
      urlRef.current?.focus();
    };
    const handleFavicon = (event: Event): void => {
      // The guest reports every icon the page declares, largest last, so the
      // final entry is the one to show.
      const icons = (event as unknown as { favicons?: string[] }).favicons ?? [];
      const icon = icons[icons.length - 1];
      if (icon) onFaviconChange(tab.id, icon);
    };

    guest.addEventListener("did-navigate", handleNavigated);
    guest.addEventListener("did-navigate-in-page", handleNavigated);
    guest.addEventListener("page-title-updated", handleTitle);
    // The guest claims focus when it finishes attaching, after any effect in
    // this component has run. An empty Tab wants the human in the address bar
    // instead, so take it back at the one moment the guest has finished.
    guest.addEventListener("dom-ready", handleReady);
    guest.addEventListener("page-favicon-updated", handleFavicon);

    return () => {
      guest.removeEventListener("did-navigate", handleNavigated);
      guest.removeEventListener("did-navigate-in-page", handleNavigated);
      guest.removeEventListener("page-title-updated", handleTitle);
      guest.removeEventListener("dom-ready", handleReady);
      guest.removeEventListener("page-favicon-updated", handleFavicon);
      guest.remove();
      guestRef.current = null;
    };
    // tab.url is the initial address only. Later changes come from the guest
    // itself, so re-running this effect would fight the human's navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, onNavigate, onTitleChange, onFaviconChange]);

  const submitUrl = useCallback((raw: string) => {
    const guest = guestRef.current;
    if (!guest) return;
    const candidate = raw.trim();
    if (!candidate) return;
    // A bare host is what a human types. Anything without a scheme becomes
    // https rather than being handed to the guest as a relative path.
    const url = /^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
    guest.src = url;
  }, []);

  return (
    <div className={styles.browserTab} data-active={isActive} data-browser-tab={tab.id}>
      <div className={styles.browserChrome}>
        <div className={styles.browserNav}>
          <IconButton
            className={styles.browserNavButton}
            label={t("browser.back")}
            title={t("browser.back")}
            onClick={() => guestRef.current?.goBack()}
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
            onClick={() => guestRef.current?.goForward()}
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
            onClick={() => guestRef.current?.reload()}
          >
            {/* Two opposed arcs, the reference's reload glyph. */}
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
      <div ref={hostRef} className={styles.browserHost} />
    </div>
  );
}
