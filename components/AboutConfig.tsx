"use client";

import { Button } from "./ui/Button";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";
import { openExternal } from "@/lib/open-external";
import { useDesktopUpdate } from "@/hooks/useDesktopUpdate";
import styles from "./settings-controls.module.css";

export const REEVE_REPO_URL = "https://github.com/AndrewBeniston/omp-reeve";
export const REEVE_RELEASES_URL = `${REEVE_REPO_URL}/releases`;
export const REEVE_KOFI_URL = "https://ko-fi.com/andrewbeniston";

/**
 * Settings > About. Version, update state, and the two support actions from
 * ADR-0006. Reeve asks for support here and on the What's New page, nowhere else.
 */
export function AboutConfig() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  const { state, check } = useDesktopUpdate();

  const updateLabel = (() => {
    if (!state) return null;
    switch (state.phase) {
      case "checking": return { tone: "info" as const, text: "Checking for updates" };
      case "downloading": return { tone: "info" as const, text: `Downloading ${state.availableVersion ?? ""}` };
      case "ready": return { tone: "success" as const, text: `${state.availableVersion ?? "Update"} ready. Restart to install.` };
      case "error": return { tone: "danger" as const, text: "Update check failed" };
      case "up-to-date": return { tone: "success" as const, text: "Up to date" };
      default: return null;
    }
  })();

  return (
    <Surface tone="main" border="none" radius="none" className={styles.scrollContent} data-about-version={version}>
      <header className={styles.contentHeader}>
        <div className={styles.titleRow}>
          <h2 className={styles.contentTitle}>About Reeve</h2>
          <StatusBadge tone="info">{version}</StatusBadge>
        </div>
        <p className={styles.contentDescription}>
          Reeve is a free, open-source desktop workspace for the OMP coding agent, made by Andrew Beniston.
          It is released under the MIT licence.
        </p>
      </header>
      <div className={styles.settingsBody}>
        <Surface tone="surface" border="default" radius="card" padding="lg" className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Support Reeve</h3>
              <p className={styles.sectionDescription}>
                Support is never expected. A tip on Ko-fi keeps the signing certificate paid and the releases coming.
                A star on GitHub helps more people find Reeve.
              </p>
            </div>
          </div>
          <div className={styles.actionButtons}>
            <Button size="md" tone="primary" onClick={() => openExternal(REEVE_KOFI_URL)}>Support on Ko-fi</Button>
            <Button size="md" tone="neutral" onClick={() => openExternal(REEVE_REPO_URL)}>Star Reeve on GitHub</Button>
          </div>
        </Surface>

        <Surface tone="surface" border="default" radius="card" padding="lg" className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Updates</h3>
              <p className={styles.sectionDescription}>
                {state
                  ? "Reeve checks GitHub Releases on launch and every four hours, downloads in the background, and installs when you press Restart now."
                  : "This copy runs in a browser. Download the desktop application from GitHub Releases for automatic updates."}
              </p>
            </div>
            {updateLabel ? <StatusBadge tone={updateLabel.tone}>{updateLabel.text}</StatusBadge> : null}
          </div>
          <div className={styles.actionButtons}>
            {state ? <Button size="md" tone="neutral" onClick={() => { void check(); }}>Check now</Button> : null}
            <Button size="md" tone="ghost" onClick={() => openExternal(REEVE_RELEASES_URL)}>Release notes</Button>
          </div>
        </Surface>
      </div>
    </Surface>
  );
}
