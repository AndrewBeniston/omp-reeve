"use client";

import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { BrowserTab } from "@/components/TabBar";
import styles from "./browser.module.css";

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
 * True when the renderer is running inside the desktop shell, which is the only
 * place a guest can exist. In a browser the element is unknown and would render
 * as an empty inline box, so the panel says so instead of showing nothing.
 */
export function supportsBrowserTab(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as { ompDesktop?: unknown }).ompDesktop);
}

interface Props {
  tabs: BrowserTab[];
  activeTabId: string | null;
  onNavigate: (tabId: string, url: string) => void;
  onTitleChange: (tabId: string, title: string) => void;
}

/**
 * Renders every open Browser tab, showing the active one.
 *
 * All of them stay mounted on purpose: a guest reloads if it is remounted or
 * reparented, so switching tabs or collapsing the panel would otherwise throw
 * the page away and return the human to the top of it.
 */
export function BrowserTabs({ tabs, activeTabId, onNavigate, onTitleChange }: Props) {
  const { t } = useI18n();

  if (!supportsBrowserTab()) {
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
}

function BrowserGuest({ tab, isActive, onNavigate, onTitleChange }: GuestProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const guestRef = useRef<WebviewElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);

  // The guest is created imperatively and never re-created. React must not own
  // it: a re-render that replaced the element would reload the page.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || guestRef.current) return;

    const guest = document.createElement("webview") as WebviewElement;
    guest.className = styles.browserGuest;
    guest.setAttribute("src", tab.url);
    // Nothing else is set here. The main process assigns the partition and
    // forces every privilege on attach, and an attribute set here would be
    // discarded there anyway.
    host.append(guest);
    guestRef.current = guest;

    const handleNavigated = (): void => {
      const next = guest.getURL();
      if (next) onNavigate(tab.id, next);
      if (urlRef.current && document.activeElement !== urlRef.current) {
        urlRef.current.value = next;
      }
    };
    const handleTitle = (event: Event): void => {
      const title = (event as unknown as { title?: string }).title ?? guest.getTitle();
      if (title) onTitleChange(tab.id, title);
    };

    guest.addEventListener("did-navigate", handleNavigated);
    guest.addEventListener("did-navigate-in-page", handleNavigated);
    guest.addEventListener("page-title-updated", handleTitle);

    return () => {
      guest.removeEventListener("did-navigate", handleNavigated);
      guest.removeEventListener("did-navigate-in-page", handleNavigated);
      guest.removeEventListener("page-title-updated", handleTitle);
      guest.remove();
      guestRef.current = null;
    };
    // tab.url is the initial address only. Later changes come from the guest
    // itself, so re-running this effect would fight the human's navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, onNavigate, onTitleChange]);

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
        <input
          ref={urlRef}
          className={styles.browserUrl}
          defaultValue={tab.url}
          aria-label={t("browser.address")}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submitUrl(event.currentTarget.value);
          }}
        />
      </div>
      <div ref={hostRef} className={styles.browserGuest} />
    </div>
  );
}

