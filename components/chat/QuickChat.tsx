"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Minus, Plus, X } from "lucide-react";
import type { ChatInputHandle } from "../ChatInput";
import type { SessionInfo } from "@/lib/types";
import type { ProjectTrustStatus } from "@/lib/api-types";
import { ProjectTrustDialog } from "../ProjectTrustDialog";
import { Tooltip } from "../ui/Tooltip";
import { ChatWindow } from "../ChatWindow";
import { useI18n } from "@/hooks/useI18n";
import { quickChatDate } from "@/lib/quick-chat-date";
import styles from "./quick-chat.module.css";

export function QuickChat({ initialSession = null, mainSessionId, onSessionChange, onOpenMain, onOpenFile, onSessionForked, onResourcesChanged, onClose }: {
  onResourcesChanged: () => void;
  mainSessionId: string | null;
  initialSession?: SessionInfo | null;
  onSessionChange: (session: SessionInfo | null) => void;
  onOpenMain: (session: SessionInfo) => void;
  onOpenFile: (path: string, session: SessionInfo | null) => void;
  onSessionForked: (id: string, source: SessionInfo | null) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [cwd, setCwd] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(initialSession);
  const composer = useRef<ChatInputHandle | null>(null);
  const pendingTitle = useRef<{ id: string; name: string } | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recent, setRecent] = useState<SessionInfo[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(false);
  const [recentAttempt, setRecentAttempt] = useState(0);
  const [chatKey, setChatKey] = useState(initialSession?.id ?? "new");
  const [showAll, setShowAll] = useState(false);
  const [trust, setTrust] = useState<ProjectTrustStatus | null>(null);
  const [trustOpen, setTrustOpen] = useState(false);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustError, setTrustError] = useState<string | null>(null);
  const activeCwd = session?.cwd ?? cwd;
  useEffect(() => {
    if (minimized || !cwd) return;
    const root = panel.current;
    if (!root) return;
    const focusComposer = () => {
      const input = root.querySelector<HTMLElement>("[contenteditable='true']");
      if (!input) return false;
      input.focus({ preventScroll: true });
      return true;
    };
    if (focusComposer()) return;
    const observer = new MutationObserver(() => { if (focusComposer()) observer.disconnect(); });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [cwd, minimized, chatKey]);
  useEffect(() => {
    const root = panel.current;
    const previous = previousFocus.current;
    return () => {
      if (previous?.isConnected && (root?.contains(document.activeElement) || document.activeElement === document.body)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);
  useEffect(() => {
    setTrust(null);
    if (!activeCwd) return;
    const controller = new AbortController();
    fetch(`/api/project-trust?cwd=${encodeURIComponent(activeCwd)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load project permissions");
        const data = await response.json();
        if (!controller.signal.aborted) setTrust(data);
      }).catch(cause => { if (!controller.signal.aborted) setTrustError(String(cause)); });
    return () => controller.abort();
  }, [activeCwd]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sessions", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        if (!controller.signal.aborted) setRecent((data.sessions ?? []).sort((a: SessionInfo, b: SessionInfo) => Date.parse(b.modified) - Date.parse(a.modified)));
      }).catch(() => { if (!controller.signal.aborted) setRecentError(true); })
      .finally(() => { if (!controller.signal.aborted) setRecentLoading(false); });
    return () => controller.abort();
  }, [recentAttempt]);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch("/api/default-cwd", { method: "POST", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.cwd) throw new Error("No chat directory");
        if (!controller.signal.aborted) setCwd(data.cwd);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  return <section ref={panel} className={styles.panel} data-minimized={minimized} aria-label={t("quickChat.title")}
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
    <header className={styles.header}>
      <span>{session?.name || t("sidebar.newChat")}</span>
      {session && <Tooltip content={t("quickChat.new")}><button type="button" aria-label={t("quickChat.new")} onClick={() => {
        setSession(null); onSessionChange(null); setChatKey(`new:${Date.now()}`);
      }}><Plus aria-hidden="true" size={16} /></button></Tooltip>}
      {session && <Tooltip content={t("quickChat.openMain")}><button type="button" onClick={() => { onOpenMain(session); onClose(); }} aria-label={t("quickChat.openMain")}><ArrowUpRight aria-hidden="true" size={16} /></button></Tooltip>}
      <Tooltip content={t(minimized ? "quickChat.restore" : "quickChat.minimise")}><button type="button" onClick={() => setMinimized(!minimized)} aria-label={t(minimized ? "quickChat.restore" : "quickChat.minimise")}>{minimized ? <ArrowUpRight aria-hidden="true" size={16} /> : <Minus aria-hidden="true" size={16} />}</button></Tooltip>
      <Tooltip content={t("quickChat.close")}><button type="button" onClick={onClose} aria-label={t("quickChat.close")}><X aria-hidden="true" size={16} /></button></Tooltip>
    </header>
    <div className={styles.body} hidden={minimized}>
      {trustError && !trustOpen && <p role="alert">{trustError}</p>}
      {error ? <div role="alert">{t("quickChat.startError")} <button type="button" onClick={() => setAttempt(value => value + 1)}>{t("quickChat.retry")}</button></div>
        : cwd ? <ChatWindow key={chatKey} session={session} newSessionCwd={cwd} chatInputRef={composer}
          onOpenFile={path => { onOpenFile(path, session); onClose(); }}
          onSessionForked={id => { onSessionForked(id, session); onClose(); }}
          projectTrust={trust} onProjectTrustClick={() => { setTrustError(null); setTrustOpen(true); }}
          onSessionNameChanged={(id, name) => {
            pendingTitle.current = { id, name };
            if (session?.id !== id) return;
            const named = { ...session, name };
            setSession(named); onSessionChange(named);
          }}
          onSessionCreated={created => {
            composer.current?.rekeyDraft("quick-chat:draft", created.id);
            const named = pendingTitle.current?.id === created.id ? { ...created, name: pendingTitle.current.name } : created;
            setSession(named); onSessionChange(named);
          }}
          compactHome={<div className={styles.recent}>
            <p>{t("quickChat.recent")}</p>
            {recentLoading && <p role="status">{t("composer.autocomplete.loading")}</p>}
            {recentError && <div role="alert">{t("quickChat.historyError")}<button type="button" onClick={() => {
              setRecentError(false); setRecentLoading(true); setRecentAttempt(value => value + 1);
            }}>{t("quickChat.retry")}</button></div>}
            {recent.slice(0, showAll ? recent.length : 3).map(item => <button type="button" key={item.id}
              onClick={() => {
                if (item.id === mainSessionId) {
                  onOpenMain(item);
                  onClose();
                  return;
                }
                setSession(item); onSessionChange(item); setChatKey(item.id);
              }}>
              <span className={styles.recentTitle}>{item.name || item.firstMessage || t("sidebar.newChat")}</span>
              <span className={styles.recentDate}>{quickChatDate(item.modified, locale, t("quickChat.today"), t("quickChat.yesterday"))}</span>
            </button>)}
            {recent.length > 3 && <button type="button" onClick={() => setShowAll(!showAll)}>{t(showAll ? "quickChat.less" : "quickChat.more")}</button>}
          </div>}
          newDraftKey="quick-chat:draft" registerGlobalAbort={false} homeProjectless homeContextLabel={t("workspace.chats")} />
          : <p role="status">{t("quickChat.starting")}</p>}
    </div>
    {trustOpen && activeCwd && <ProjectTrustDialog cwd={activeCwd} busy={trustBusy} error={trustError}
      onCancel={() => { if (!trustBusy) setTrustOpen(false); }}
      onConfirm={async () => {
        if (trustBusy) return;
        setTrustBusy(true); setTrustError(null);
        try {
          const response = await fetch("/api/project-trust", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd: activeCwd }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not change project permissions");
          setTrust(data); setTrustOpen(false);
          setChatKey(key => `${key}:trusted`);
          onResourcesChanged();
        } catch (cause) { setTrustError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setTrustBusy(false); }
      }} />}
  </section>;
}
