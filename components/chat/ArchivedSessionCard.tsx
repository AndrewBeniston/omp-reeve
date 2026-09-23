"use client";

import { useEffect, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "../ui/Button";
import { useI18n } from "@/hooks/useI18n";
import styles from "./archived-session-card.module.css";

type FetchRequest = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function restoreArchivedSession(
  sessionId: string,
  onRestored: () => void,
  request: FetchRequest = fetch,
): Promise<void> {
  const response = await request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: false }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  onRestored();
}

interface ArchivedSessionCardProps {
  sessionId: string;
  onRestored?: () => void;
}

export function ArchivedSessionCard({ sessionId, onRestored }: ArchivedSessionCardProps) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "restoring" | "restored" | "failed">("idle");
  const requestStarted = useRef(false);
  const selectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (selectTimer.current) clearTimeout(selectTimer.current);
  }, []);

  const handleRestore = async () => {
    if (requestStarted.current) return;
    requestStarted.current = true;
    setState("restoring");
    try {
      await restoreArchivedSession(sessionId, () => {
        setState("restored");
        selectTimer.current = setTimeout(() => onRestored?.(), 500);
      });
    } catch {
      requestStarted.current = false;
      setState("failed");
    }
  };

  const status = state === "restoring"
    ? t("transcript.archived.restoringDescription")
    : state === "restored"
      ? t("transcript.archived.restoredDescription")
      : state === "failed"
        ? t("transcript.archived.unarchiveError")
        : null;

  return (
    <div className={styles.frame}>
      <section className={styles.card} aria-labelledby="archived-session-title">
        <div className={styles.icon} aria-hidden="true"><Archive size={20} strokeWidth={1.8} /></div>
        <h1 className={styles.title} id="archived-session-title">{t("transcript.archived.title")}</h1>
        <p className={styles.description}>{t("transcript.archived.description")}</p>
        <Button
          className={styles.action}
          tone="primary"
          loading={state === "restoring"}
          disabled={state === "restored"}
          onClick={() => void handleRestore()}
        >
          {t("transcript.archived.unarchive")}
        </Button>
        {status && (
          <p className={styles.status} role={state === "failed" ? "alert" : "status"}>
            {status}
          </p>
        )}
      </section>
    </div>
  );
}
