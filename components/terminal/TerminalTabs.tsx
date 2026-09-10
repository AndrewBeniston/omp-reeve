"use client";

import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { ansiPalette } from "@/lib/ansi";
import { useI18n } from "@/hooks/useI18n";
import type { TerminalTab } from "@/components/TabBar";
import styles from "./terminal.module.css";
import "@xterm/xterm/css/xterm.css";

/**
 * The desktop bridge this component needs. The renderer never spawns anything
 * itself: it asks the main process, which decides.
 */
interface TerminalBridge {
  open(request: { cwd: string; cols: number; rows: number }): Promise<
    { ok: true; id: string; shell: string; cwd: string } | { ok: false; reason: string }
  >;
  write(id: string, data: string): Promise<boolean>;
  resize(id: string, cols: number, rows: number): Promise<boolean>;
  close(id: string): Promise<boolean>;
  onData(id: string, callback: (data: string) => void): () => void;
  onExit(id: string, callback: (exitCode: number) => void): () => void;
}

function terminalBridge(): TerminalBridge | undefined {
  return (window as { ompDesktop?: { terminal?: TerminalBridge } }).ompDesktop?.terminal;
}

/**
 * True once the renderer is known to be running inside the desktop shell.
 *
 * A pty needs a process to spawn it, and the browser version of Reeve has none.
 * The answer arrives in an effect rather than during render, because reading
 * the window while rendering would make the server and client trees differ.
 */
export function useSupportsTerminalTab(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(Boolean(terminalBridge()));
  }, []);
  return supported;
}

interface Props {
  tabs: TerminalTab[];
  activeTabId: string | null;
  onTitleChange: (tabId: string, title: string) => void;
}

/**
 * Every open Terminal tab, showing the active one.
 *
 * All stay mounted, for the same reason the Browser tabs do: a shell is a live
 * process with scrollback, and unmounting its view would throw away everything
 * the human had on screen.
 */
export function TerminalTabs({ tabs, activeTabId, onTitleChange }: Props) {
  return (
    <div className={styles.terminalTabs}>
      {tabs.map((tab) => (
        <TerminalSession
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onTitleChange={onTitleChange}
        />
      ))}
    </div>
  );
}

/** Why there is no shell, in words a human can act on. */
function refusalMessage(reason: string, t: (key: string) => string): string {
  switch (reason) {
    case "untrusted-project": return t("terminal.refusedUntrusted");
    case "no-project": return t("terminal.refusedNoProject");
    case "pty-unavailable": return t("terminal.refusedUnavailable");
    default: return t("terminal.refusedGeneric");
  }
}

function TerminalSession({
  tab,
  isActive,
  onTitleChange,
}: {
  tab: TerminalTab;
  isActive: boolean;
  onTitleChange: (tabId: string, title: string) => void;
}) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [exited, setExited] = useState<number | null>(null);

  // Read inside listeners bound once, which must not close over a stale prop.
  const titleRef = useRef(onTitleChange);
  titleRef.current = onTitleChange;

  useEffect(() => {
    const host = hostRef.current;
    const bridge = terminalBridge();
    if (!host || !bridge) return;

    // The options match the reference application own terminal, read from its
    // shipped bundle: a transparent background so the panel surface shows
    // through, a blinking bar cursor, and 1.2 line height. The colours are
    // Reeve own, not the reference ones.
    const terminal = new Terminal({
      allowTransparency: true,
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: "bar",
      letterSpacing: 0,
      lineHeight: 1.2,
      fontSize: 12,
      fontFamily: readCssValue(host, "--font-mono") || "monospace",
      theme: buildTheme(host),
    });

    const fit = new FitAddon();
    terminal.loadAddon(fit);
    // The same three addons the reference loads: fit, clipboard (so a program
    // inside the shell can set the clipboard through OSC 52) and web links.
    terminal.loadAddon(new ClipboardAddon());
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;

    let disposed = false;
    let sessionId: string | null = null;
    let stopData: (() => void) | undefined;
    let stopExit: (() => void) | undefined;

    // Measure before asking, so the shell draws its first prompt at the real
    // width instead of at 80 columns and then rewrapping.
    fit.fit();

    void bridge
      .open({ cwd: tab.cwd, cols: terminal.cols, rows: terminal.rows })
      .then((opened) => {
        if (disposed) {
          // The Tab closed while the shell was starting. Kill it rather than
          // leaving a login shell with nobody attached.
          if (opened.ok) void bridge.close(opened.id);
          return;
        }
        if (!opened.ok) {
          setRefusal(opened.reason);
          return;
        }
        sessionId = opened.id;
        stopData = bridge.onData(opened.id, (data) => terminal.write(data));
        stopExit = bridge.onExit(opened.id, (exitCode) => setExited(exitCode));
        terminal.onData((data) => void bridge.write(opened.id, data));
        terminal.onTitleChange((title) => {
          if (title) titleRef.current(tab.id, title);
        });
        terminal.focus();
      });

    // The panel resizes with a drag, so the shell is told the new size as it
    // moves. Without this the shell keeps wrapping to the old width.
    const observer = new ResizeObserver(() => {
      if (!hostRef.current?.isConnected) return;
      // A hidden Tab measures as zero and would resize the shell to nothing.
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      fit.fit();
      if (sessionId) void bridge.resize(sessionId, terminal.cols, terminal.rows);
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      stopData?.();
      stopExit?.();
      if (sessionId) void bridge.close(sessionId);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // The shell belongs to this Tab and this directory. Neither changes while
    // the Tab is open, and re-running this effect would kill a live shell.
  }, [tab.id, tab.cwd]);

  // A Tab that becomes visible was measured as zero while it was hidden, so it
  // re-measures and takes focus the way a terminal the human just clicked would.
  useEffect(() => {
    if (!isActive) return;
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal || !fit) return;
    fit.fit();
    terminal.focus();
  }, [isActive]);

  return (
    <div className={styles.terminalTab} data-active={isActive} data-terminal-tab={tab.id}>
      <div ref={hostRef} className={styles.terminalHost} data-reeve-xterm="" />
      {refusal !== null && (
        <div className={styles.terminalNotice}>{refusalMessage(refusal, t)}</div>
      )}
      {exited !== null && (
        <div className={styles.terminalExited}>
          {t("terminal.exited").replace("{code}", String(exited))}
        </div>
      )}
    </div>
  );
}

/** One custom property computed value, trimmed. */
function readCssValue(element: HTMLElement, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/**
 * The xterm palette, taken from Reeve own theme.
 *
 * xterm needs real colour strings, so the theme custom properties are resolved
 * here rather than handed over unresolved. The background stays transparent:
 * the panel behind it supplies the surface, which is how the terminal follows
 * the panel colour without being rebuilt.
 */
function buildTheme(host: HTMLElement) {
  return {
    // Transparent, so the Tab surface behind supplies the colour. The panel
    // owns the theme; the terminal only draws glyphs on it.
    background: "transparent",
    foreground: readCssValue(host, "--ui-text"),
    cursor: readCssValue(host, "--ui-accent"),
    cursorAccent: readCssValue(host, "--ui-surface"),
    selectionBackground: readCssValue(host, "--ui-accent-wash"),
    ...ansiPalette(),
  };
}
