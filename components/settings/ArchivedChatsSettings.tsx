"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useI18n } from "@/hooks/useI18n";
import { skillExpansionToCommand } from "@/lib/slash-display";
import type { SessionInfo } from "@/lib/types";
import styles from "./archived-chats-settings.module.css";

interface ArchivedChatsSettingsProps {
  onChanged?: () => void;
}

export function ArchivedChatsSettings({ onChanged }: ArchivedChatsSettingsProps) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sessions?archived=1", { cache: "no-store" });
      const result = await response.json() as { sessions?: SessionInfo[]; error?: string };
      if (!response.ok || result.error) throw new Error(result.error ?? `HTTP ${response.status}`);
      setSessions(result.sessions ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const restore = async (id: string) => {
    setRestoringId(id);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSessions((current) => current.filter((session) => session.id !== id));
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t("settings.archivedChats.title")}</h2>
        <p className={styles.description}>{t("settings.archivedChats.description")}</p>
      </header>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      {loading ? (
        <div className={styles.empty}>{t("settings.archivedChats.loading")}</div>
      ) : sessions.length === 0 ? (
        <div className={styles.empty}>{t("settings.archivedChats.empty")}</div>
      ) : (
        <div className={styles.list}>
          {sessions.map((session) => {
            const firstMessage = skillExpansionToCommand(session.firstMessage) ?? session.firstMessage;
            const title = session.name || firstMessage.slice(0, 80) || session.id.slice(0, 12);
            return (
              <div key={session.id} className={styles.row}>
                <div className={styles.identity}>
                  <span className={styles.chatTitle} title={title}>{title}</span>
                  <span className={styles.path} title={session.cwd}>{session.cwd}</span>
                </div>
                <Button
                  size="sm"
                  tone="ghost"
                  loading={restoringId === session.id}
                  disabled={restoringId !== null && restoringId !== session.id}
                  onClick={() => void restore(session.id)}
                >
                  {t("settings.archivedChats.restore")}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
