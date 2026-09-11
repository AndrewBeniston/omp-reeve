"use client";

import { useCallback, useState } from "react";
import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";
import styles from "./settings-controls.module.css";

/**
 * Clear everything the built-in browser has stored.
 *
 * Every Browser tab shares one signed-in session, which is the feature: a login
 * in one tab is a login in the next. It is also why there is no smaller control
 * than this one. Clearing signs the human out of everything at once, and the
 * panel says so before they press it rather than after.
 */

export type ClearBrowsingDataPhase = "idle" | "clearing" | "cleared" | "failed" | "unsupported";

/** What the human is told, matched to what actually happened. */
export function clearBrowsingDataMessage(phase: ClearBrowsingDataPhase, reloaded = 0): string {
  switch (phase) {
    case "cleared":
      return reloaded > 0
        ? `Browsing data cleared. ${reloaded} open ${reloaded === 1 ? "tab was" : "tabs were"} reloaded.`
        : "Browsing data cleared.";
    case "failed":
      return "Unable to clear browsing data.";
    case "clearing":
      return "Clearing.";
    case "unsupported":
      return "This needs the desktop application.";
    case "idle":
      return "Cookies, logins and cached pages for every browser tab. There is no smaller unit: the tabs share one session, so this signs you out of all of them.";
  }
}

interface Bridge {
  clearBrowsingData(): Promise<{ ok: boolean; reloaded: number }>;
}

function bridge(): Bridge | undefined {
  const desktop = (window as { ompDesktop?: Partial<Bridge> }).ompDesktop;
  return typeof desktop?.clearBrowsingData === "function" ? desktop as Bridge : undefined;
}

export interface ClearBrowsingDataViewProps {
  phase: ClearBrowsingDataPhase;
  reloaded: number;
  onClear: () => void;
}

export function ClearBrowsingDataView({ phase, reloaded, onClear }: ClearBrowsingDataViewProps) {
  const busy = phase === "clearing";
  return (
    <Surface
      tone="surface"
      border="default"
      radius="card"
      padding="lg"
      className={styles.panel}
      data-browsing-data-phase={phase}
    >
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Browsing data</h3>
          <p className={styles.sectionDescription}>{clearBrowsingDataMessage("idle")}</p>
        </div>
        <Button
          tone="danger"
          size="sm"
          loading={busy}
          disabled={busy || phase === "unsupported"}
          onClick={onClear}
        >
          Clear browsing data
        </Button>
      </div>
      {phase === "cleared" || phase === "failed" || phase === "unsupported" ? (
        <Surface
          tone="inset"
          border="default"
          radius="md"
          padding="sm"
          className={styles.notice}
          role={phase === "failed" ? "alert" : "status"}
        >
          <StatusBadge tone={phase === "cleared" ? "success" : phase === "failed" ? "danger" : "neutral"}>
            {phase === "cleared" ? "Cleared" : phase === "failed" ? "Failed" : "Desktop only"}
          </StatusBadge>
          <span>{clearBrowsingDataMessage(phase, reloaded)}</span>
        </Surface>
      ) : null}
    </Surface>
  );
}

export function ClearBrowsingData() {
  const [phase, setPhase] = useState<ClearBrowsingDataPhase>("idle");
  const [reloaded, setReloaded] = useState(0);

  const onClear = useCallback(() => {
    const desktop = bridge();
    if (!desktop) {
      setPhase("unsupported");
      return;
    }
    setPhase("clearing");
    void desktop
      .clearBrowsingData()
      .then((result) => {
        setReloaded(result?.reloaded ?? 0);
        setPhase(result?.ok ? "cleared" : "failed");
      })
      .catch(() => setPhase("failed"));
  }, []);

  return <ClearBrowsingDataView phase={phase} reloaded={reloaded} onClear={onClear} />;
}
