"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";
import styles from "./settings-controls.module.css";

/**
 * The control that grants the agent the browser, from the settings dialog.
 *
 * The grant is recorded to disk and read before Chromium starts, so it takes
 * effect at the next launch and never at this one. That is the security
 * property rather than a limitation: nothing in a running Reeve, including a
 * renderer that had been taken over, can open a door a human did not already
 * open. It also means this panel must be honest about four states, not two,
 * because a decision made now and the door as it stands now can disagree.
 */

/** What the desktop process reports about the door. */
export interface AgentBrowserState {
  /** The human has granted it. Recorded to disk, may not be in effect yet. */
  granted: boolean;
  /** This launch actually carries the debugging switch. */
  openThisLaunch: boolean;
  /** The two disagree, so a restart is needed to settle them. */
  restartRequired: boolean;
  /** The endpoint to give the agent, or null when nothing is listening. */
  cdpUrl: string | null;
}

export type AgentBrowserPhase =
  | "loading"
  | "unsupported"
  | "open"
  | "closed"
  | "opens-next-launch"
  | "closes-next-launch";

/**
 * Which of the four honest states this is.
 *
 * Pure. The two that matter are the disagreements: a human who has just
 * granted it must not think the agent can already connect, and a human who has
 * just withdrawn it must not think the door is already shut. It is not.
 */
export function agentBrowserPhase(state: AgentBrowserState | null, supported: boolean): AgentBrowserPhase {
  if (!supported) return "unsupported";
  if (!state) return "loading";
  if (state.granted && state.openThisLaunch) return "open";
  if (state.granted) return "opens-next-launch";
  if (state.openThisLaunch) return "closes-next-launch";
  return "closed";
}

export function agentBrowserBadge(phase: AgentBrowserPhase): { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" } {
  switch (phase) {
    case "open": return { label: "Open", tone: "warning" };
    case "closed": return { label: "Closed", tone: "success" };
    case "opens-next-launch": return { label: "Opens on restart", tone: "info" };
    case "closes-next-launch": return { label: "Still open", tone: "danger" };
    case "unsupported": return { label: "Desktop only", tone: "neutral" };
    case "loading": return { label: "Loading", tone: "neutral" };
  }
}

/** What the human is told, in the words that match what is actually true. */
export function agentBrowserDescription(phase: AgentBrowserPhase): string {
  switch (phase) {
    case "open":
      return "The agent can drive this application through the address below. Anything you are signed in to in a browser tab, it is signed in to.";
    case "closed":
      return "Nothing is listening. The agent cannot see or drive your browser tabs.";
    case "opens-next-launch":
      return "Granted, but not yet in effect. Restart Reeve and the agent will be able to drive it. Nothing is listening until you do.";
    case "closes-next-launch":
      return "Withdrawn, but the door is still open until you restart. The agent can still drive this application right now.";
    case "unsupported":
      return "This needs the desktop application.";
    case "loading":
      return "Checking.";
  }
}

interface Bridge {
  getState(): Promise<AgentBrowserState | null>;
  set(granted: boolean): Promise<AgentBrowserState | null>;
}

function agentBrowserBridge(): Bridge | undefined {
  return (window as { ompDesktop?: { agentBrowser?: Bridge } }).ompDesktop?.agentBrowser;
}

export interface AgentBrowserAccessViewProps {
  state: AgentBrowserState | null;
  supported: boolean;
  busy: boolean;
  onToggle: () => void;
}

export function AgentBrowserAccessView({ state, supported, busy, onToggle }: AgentBrowserAccessViewProps) {
  const phase = agentBrowserPhase(state, supported);
  const badge = agentBrowserBadge(phase);
  const granted = state?.granted === true;

  return (
    <Surface
      tone="surface"
      border="default"
      radius="card"
      padding="lg"
      className={styles.panel}
      data-agent-browser-phase={phase}
    >
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Agent browser access</h3>
          <p className={styles.sectionDescription}>{agentBrowserDescription(phase)}</p>
          {/*
            * Said plainly because it is the part people get wrong: this is not
            * a browser-tabs-only grant. The debugging protocol reaches every
            * page in the application, including Reeve own interface.
            */}
          <p className={styles.sectionWarning}>
            This exposes the whole application window, not only your browser tabs, to any
            program on this computer that can reach the address. It has no password of its own.
          </p>
          {/*
            * Measured, not guessed. Asked to act without naming a page, OMP
            * browser tool attaches to whichever page reports itself visible,
            * and that is Reeve own window rather than the Browser tab. See
            * ADR-0011.
            */}
          <p className={styles.sectionWarning}>
            Tell the agent which page to work on. Asked to browse without naming one, it
            attaches to Reeve own window instead of your browser tab.
          </p>
        </div>
        <div className={styles.titleRow}>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          <Button
            tone={granted ? "primary" : "neutral"}
            size="sm"
            className={styles.toggleButton}
            data-on={granted}
            aria-pressed={granted}
            aria-label="Let the agent drive the browser"
            disabled={busy || !supported}
            onClick={onToggle}
          >
            {granted ? "On" : "Off"}
          </Button>
        </div>
      </div>
      {phase === "open" && state?.cdpUrl ? (
        <Surface tone="inset" border="default" radius="md" padding="sm" className={styles.notice} role="status">
          <StatusBadge tone="info">Address</StatusBadge>
          {/*
            * The port is chosen fresh every launch, so this is worth reading rather
            * than remembering. It is what the agent is given as app.cdp_url.
            */}
          <span>Give the agent <code>{state.cdpUrl}</code> as its browser address. It changes every time Reeve starts.</span>
        </Surface>
      ) : null}
      {state?.restartRequired ? (
        <Surface tone="inset" border="default" radius="md" padding="sm" className={styles.notice} role="status">
          <StatusBadge tone="warning">Restart needed</StatusBadge>
          <span>Quit and reopen Reeve for this to take effect.</span>
        </Surface>
      ) : null}
    </Surface>
  );
}

/**
 * The panel, wired to the desktop process.
 *
 * Reading is harmless and happens on mount. Writing records the decision, and
 * the answer that comes back is the whole state again, so the panel never has
 * to guess what changed.
 */
export function AgentBrowserAccess() {
  const [state, setState] = useState<AgentBrowserState | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = agentBrowserBridge();
    setSupported(Boolean(bridge));
    if (!bridge) return;
    void bridge.getState().then(setState);
  }, []);

  const onToggle = useCallback(() => {
    const bridge = agentBrowserBridge();
    if (!bridge || busy) return;
    setBusy(true);
    void bridge
      .set(!(state?.granted === true))
      .then(setState)
      .finally(() => setBusy(false));
  }, [busy, state?.granted]);

  return <AgentBrowserAccessView state={state} supported={supported} busy={busy} onToggle={onToggle} />;
}
