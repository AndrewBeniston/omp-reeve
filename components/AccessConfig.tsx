"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { WebAccessStatus } from "@/lib/api-types";
import { Button } from "./ui/Button";
import { FormField } from "./ui/FormField";
import { StatusBadge } from "./ui/StatusBadge";
import { Surface } from "./ui/Surface";
import styles from "./settings-controls.module.css";

/**
 * The password lock, from the settings dialog.
 *
 * Reeve can drive a high-privilege agent, so the panel is deliberately blunt
 * about what the lock does and does not protect: it authenticates, it does not
 * encrypt, and the password itself is never readable back. The recovery paths
 * stay visible because forgetting the password requires recovery.
 */

type AccessAction = "set-password" | "enable" | "disable" | "clear";
type AccessState = "loading" | "load-error" | "managed" | "unavailable" | "protected" | "stored" | "unprotected";

const MIN_PASSWORD_LENGTH = 8;

function describeState(status: WebAccessStatus): string {
  if (status.managedByEnvironment) {
    return "Every request needs the password from OMP_WEB_PASSWORD.";
  }
  if (status.unreadable) {
    return "The credential file exists but could not be read, so every request is being refused.";
  }
  if (!status.configured) return "No password is set. Anyone who can reach this server can use it.";
  return status.enabled
    ? "Every request needs the username and password."
    : "A password is stored but the lock is off.";
}

function getAccessState(status: WebAccessStatus | null, loadError: string | null): AccessState {
  if (!status) return loadError ? "load-error" : "loading";
  if (status.managedByEnvironment) return "managed";
  if (status.unreadable) return "unavailable";
  if (status.enabled) return "protected";
  if (status.stored) return "stored";
  return "unprotected";
}

function getStatusBadge(state: AccessState): { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" } {
  switch (state) {
    case "managed": return { label: "Managed", tone: "info" };
    case "unavailable":
    case "load-error": return { label: "Unavailable", tone: "danger" };
    case "protected": return { label: "Protected", tone: "success" };
    case "stored": return { label: "Protection off", tone: "warning" };
    case "unprotected": return { label: "Not protected", tone: "warning" };
    case "loading": return { label: "Loading", tone: "neutral" };
  }
}

export interface AccessConfigViewProps {
  status: WebAccessStatus | null;
  loadError: string | null;
  error: string | null;
  notice: string | null;
  busy: boolean;
  password: string;
  confirmation: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onToggleEnabled: () => void;
  onClearPassword: () => void;
  onSavePassword: () => void;
}

export function AccessConfigView({
  status,
  loadError,
  error,
  notice,
  busy,
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
  onToggleEnabled,
  onClearPassword,
  onSavePassword,
}: AccessConfigViewProps) {
  const accessState = getAccessState(status, loadError);
  const badge = getStatusBadge(accessState);

  if (!status) {
    return (
      <Surface
        tone="main"
        border="none"
        radius="none"
        className={styles.empty}
        data-access-state={accessState}
      >
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        <div role={loadError ? "alert" : "status"}>{loadError ?? "Loading password access…"}</div>
      </Surface>
    );
  }

  const readOnly = status.managedByEnvironment;
  const dirty = password.length > 0 || confirmation.length > 0;
  const passwordsMatch = password === confirmation;
  const canSave = !busy && !readOnly && password.length >= MIN_PASSWORD_LENGTH && passwordsMatch;

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSave) onSavePassword();
  };

  return (
    <Surface
      tone="main"
      border="none"
      radius="none"
      className={styles.scrollContent}
      data-access-state={accessState}
      data-dirty={dirty}
      data-busy={busy}
      data-read-only={readOnly}
    >
      <header className={styles.contentHeader}>
        <div className={styles.titleRow}>
          <h2 className={styles.contentTitle}>Security</h2>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
        <p className={styles.contentDescription}>
          A password locks the web interface and every API endpoint behind HTTP Basic Auth.
          The fixed username is <code>{status.username}</code>. The scrypt hash is stored in <code>{status.file}</code>.
          Reeve never keeps the password itself.
        </p>
        {readOnly ? (
          <Surface tone="inset" border="default" radius="md" padding="sm" className={styles.notice} role="status">
            <StatusBadge tone="info">Read-only</StatusBadge>
            <span><code>OMP_WEB_PASSWORD</code> overrides the stored credential. Remove it and restart Reeve to manage the password here.</span>
          </Surface>
        ) : null}
        {notice ? (
          <Surface tone="inset" border="default" radius="md" padding="sm" className={styles.notice} role="status">
            <StatusBadge tone="success">Saved</StatusBadge>
            <span>{notice}</span>
          </Surface>
        ) : null}
      </header>

      <div className={styles.settingsBody}>
        <Surface tone="surface" border="default" radius="card" padding="lg" className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Password access</h3>
              <p className={styles.sectionDescription}>{describeState(status)}</p>
              {!status.configured && !readOnly ? (
                <p className={styles.sectionWarning}>Set a password below before you turn on password access.</p>
              ) : null}
            </div>
            <Button
              tone={status.enabled ? "primary" : "neutral"}
              size="sm"
              className={styles.toggleButton}
              data-on={status.enabled}
              aria-pressed={status.enabled}
              aria-label="Require a password"
              disabled={busy || readOnly || (!status.enabled && !status.stored)}
              onClick={onToggleEnabled}
            >
              {status.enabled ? "On" : "Off"}
            </Button>
          </div>
          {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}
        </Surface>

        <Surface tone="surface" border="default" radius="card" padding="lg" className={styles.panel}>
          <form className={styles.passwordForm} onSubmit={submitPassword}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>{status.stored ? "Replace the password" : "Set a password"}</h3>
                <p className={styles.sectionDescription}>Saving a password also turns on password access.</p>
              </div>
              <StatusBadge tone={dirty ? "warning" : "neutral"}>
                {dirty ? "Unsaved changes" : "No changes"}
              </StatusBadge>
            </div>

            <div className={styles.fieldGrid}>
              <FormField
                id="access-new-password"
                label="New password"
                description={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
              >
                <input
                  className={styles.textInput}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  disabled={busy || readOnly}
                  onChange={(event) => onPasswordChange(event.target.value)}
                />
              </FormField>
              <FormField
                id="access-confirm-password"
                label="Confirm password"
                description="Both entries must match before you save the password."
                error={dirty && !passwordsMatch ? "The two passwords do not match." : undefined}
              >
                <input
                  className={styles.textInput}
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  disabled={busy || readOnly}
                  onChange={(event) => onConfirmationChange(event.target.value)}
                />
              </FormField>
            </div>

            <div className={styles.editorActions}>
              <div className={styles.saveState}>
                {status.stored && status.updatedAt
                  ? `Last changed ${new Date(status.updatedAt).toLocaleString()}`
                  : "No password stored yet"}
              </div>
              <div className={styles.actionButtons}>
                {status.stored && !readOnly ? (
                  <Button tone="danger" size="sm" disabled={busy} onClick={onClearPassword}>
                    Remove password
                  </Button>
                ) : null}
                <Button type="submit" tone="primary" size="sm" loading={busy} disabled={!canSave}>
                  {busy ? "Saving…" : "Save password"}
                </Button>
              </div>
            </div>
          </form>
        </Surface>

        <Surface tone="surface" border="default" radius="card" padding="lg" className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>If you forget it</h3>
              <p className={styles.sectionDescription}>
                Run <code>reeve --reset-password</code> on this machine to set a new password.
                You can also use the recovery page. Reeve prints a one-time code on its own console.
                Entering that code sets a new password. Both paths require access to the server machine.
                The system cannot return the current password.
              </p>
            </div>
            <a className={styles.linkButton} href="/recover" target="_blank" rel="noreferrer">Open /recover</a>
          </div>
          <Surface tone="inset" border="default" radius="md" padding="sm" className={styles.securityWarning}>
            <StatusBadge tone="warning">Network warning</StatusBadge>
            <div>
              <h4 className={styles.warningTitle}>Basic Auth is not encryption</h4>
              <p className={styles.warningText}>
                The password crosses the network in a reversible encoding. Plain HTTP can expose it on an untrusted network.
                Use HTTPS or a trusted VPN before you expose Reeve beyond loopback.
              </p>
            </div>
          </Surface>
        </Surface>
      </div>
    </Surface>
  );
}

export function AccessConfig() {
  const [status, setStatus] = useState<WebAccessStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/web-access", { cache: "no-store" });
      const data = await response.json() as WebAccessStatus & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setStatus(data);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const send = useCallback(async (action: AccessAction, body: { password?: string } = {}) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/web-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await response.json() as WebAccessStatus & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setStatus(data);
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const savePassword = useCallback(async () => {
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }
    const updated = await send("set-password", { password });
    if (!updated) return;
    setPassword("");
    setConfirmation("");
    setNotice(
      `Password saved and password access turned on. The browser will ask for the username "${updated.username}"`
      + " and this password on the next request.",
    );
  }, [confirmation, password, send]);

  const toggleEnabled = useCallback(async () => {
    if (!status) return;
    const updated = await send(status.enabled ? "disable" : "enable");
    if (!updated) return;
    setNotice(updated.enabled
      ? `Password access is on. The browser will ask for the username "${updated.username}" and your password on the next request.`
      : "Password access is off. The stored password is kept and can be switched back on here.");
  }, [send, status]);

  const clearPassword = useCallback(async () => {
    const updated = await send("clear");
    if (!updated) return;
    setNotice("The stored password was removed and password access is off.");
  }, [send]);

  return (
    <AccessConfigView
      status={status}
      loadError={loadError}
      error={error}
      notice={notice}
      busy={busy}
      password={password}
      confirmation={confirmation}
      onPasswordChange={setPassword}
      onConfirmationChange={setConfirmation}
      onToggleEnabled={() => { void toggleEnabled(); }}
      onClearPassword={() => { void clearPassword(); }}
      onSavePassword={() => { void savePassword(); }}
    />
  );
}
