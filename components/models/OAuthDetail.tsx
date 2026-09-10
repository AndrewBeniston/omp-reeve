"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { SectionTitle } from "./model-fields";
import type { OAuthProvider } from "./types";
import { useI18n } from "@/hooks/useI18n";
import { openExternal } from "@/lib/open-external";
import styles from "./auth-detail.module.css";

type OAuthLoginState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "auth"; url: string; instructions: string | null; token: string }
  | { phase: "device_code"; userCode: string; verificationUri: string; intervalSeconds: number | null; expiresInSeconds: number | null }
  | { phase: "prompt"; message: string; placeholder: string | null; token: string }
  | { phase: "select"; message: string; options: { id: string; label: string }[]; token: string }
  | { phase: "progress"; message: string }
  | { phase: "success" }
  | { phase: "error"; message: string };

export function OAuthDetail({ provider, onRefresh }: { provider: OAuthProvider; onRefresh: () => void }) {
  const [loginState, setLoginState] = useState<OAuthLoginState>({ phase: "idle" });
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loginState.phase === "auth" || loginState.phase === "prompt") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loginState.phase]);

  useEffect(() => {
    setLoginState({ phase: "idle" });
    setInputValue("");
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [provider.id]);

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  const handleLogin = useCallback(() => {
    eventSourceRef.current?.close();
    setLoginState({ phase: "connecting" });
    setInputValue("");

    const es = new EventSource(`/api/auth/login/${encodeURIComponent(provider.id)}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as {
        type: string; url?: string; instructions?: string | null;
        token?: string; message?: string; placeholder?: string | null;
        userCode?: string; verificationUri?: string; intervalSeconds?: number | null; expiresInSeconds?: number | null;
        options?: { id: string; label: string }[];
      };
      if (data.type === "auth") {
        setLoginState({ phase: "auth", url: data.url!, instructions: data.instructions ?? null, token: data.token! });
        openExternal(data.url!);
      } else if (data.type === "device_code") {
        setLoginState({
          phase: "device_code",
          userCode: data.userCode!,
          verificationUri: data.verificationUri!,
          intervalSeconds: data.intervalSeconds ?? null,
          expiresInSeconds: data.expiresInSeconds ?? null,
        });
        openExternal(data.verificationUri!);
      } else if (data.type === "prompt_request") {
        setLoginState({ phase: "prompt", message: data.message!, placeholder: data.placeholder ?? null, token: data.token! });
      } else if (data.type === "select_request") {
        setLoginState({ phase: "select", message: data.message!, options: data.options ?? [], token: data.token! });
      } else if (data.type === "progress") {
        setLoginState({ phase: "progress", message: data.message! });
      } else if (data.type === "success") {
        es.close();
        setLoginState({ phase: "success" });
        onRefresh();
      } else if (data.type === "error") {
        es.close();
        setLoginState({ phase: "error", message: data.message! });
      } else if (data.type === "cancelled") {
        es.close();
        setLoginState({ phase: "idle" });
      }
    };
    es.onerror = () => {
      es.close();
      setLoginState((prev) => prev.phase === "success" ? prev : { phase: "error", message: "Connection lost" });
    };
  }, [provider.id, onRefresh]);

  const handleLogout = useCallback(async () => {
    await fetch(`/api/auth/logout/${encodeURIComponent(provider.id)}`, { method: "POST" });
    setLoginState({ phase: "idle" });
    onRefresh();
  }, [provider.id, onRefresh]);

  const submitCode = useCallback(async (token: string, code: string) => {
    if (!code.trim()) return;
    setLoginState({ phase: "progress", message: "Verifying…" });
    try {
      const res = await fetch(`/api/auth/login/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: code.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setLoginState({ phase: "error", message: d.error ?? `Server error ${res.status}` });
        return;
      }
      setInputValue("");
      // The SSE stream reports success.
    } catch (e) {
      setLoginState({ phase: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  }, [provider.id]);

  const submitSelection = useCallback(async (token: string, value: string) => {
    setLoginState({ phase: "progress", message: "Continuing…" });
    try {
      const res = await fetch(`/api/auth/login/${encodeURIComponent(provider.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setLoginState({ phase: "error", message: d.error ?? `Server error ${res.status}` });
      }
    } catch (e) {
      setLoginState({ phase: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  }, [provider.id]);

  const isWorking = loginState.phase === "connecting" || loginState.phase === "progress" ||
    loginState.phase === "auth" || loginState.phase === "device_code" ||
    loginState.phase === "prompt" || loginState.phase === "select";

  return (
    <div className={styles.authStack}>
      <div className={styles.authHeader}>
        <SectionTitle>{t("i18n.subscription")}</SectionTitle>
        <StatusBadge tone={provider.loggedIn ? "success" : "neutral"}>
          {provider.loggedIn ? t("i18n.connected") : t("i18n.notConnected")}
        </StatusBadge>
      </div>

      <div className={styles.statusArea}>
        {loginState.phase === "idle" && (
          <p className={styles.statusText}>
            {provider.loggedIn ? "Already connected. You can re-login or disconnect." : `Connect your ${provider.name} account.`}
          </p>
        )}
        {loginState.phase === "connecting" && (
          <p className={styles.statusText}>{t("i18n.openingBrowser")}</p>
        )}
        {loginState.phase === "select" && (
          <div className={styles.statusBlock}>
            <p className={styles.statusText}>
              {loginState.message}
            </p>
            <div className={styles.selectOptions}>
              {loginState.options.map((option) => (
                <Button
                  key={option.id}
                  onClick={() => submitSelection(loginState.token, option.id)}
                  size="sm"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {(loginState.phase === "auth" || loginState.phase === "prompt") && (
          <div className={styles.statusBlock}>
            <p className={styles.statusText}>
              {loginState.phase === "auth"
                ? "Complete sign-in in the browser, then copy the redirect URL from the address bar and paste it below."
                : loginState.message}
            </p>
            {loginState.phase === "auth" && (
              <p className={styles.statusHint}>
                If the browser window did not open,{" "}
                <a href={loginState.url} target="_blank" rel="noopener noreferrer" className={styles.authLink}>
                  click here to open the login page
                </a>
                .
              </p>
            )}
            <div className={styles.promptRow}>
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCode(loginState.token, inputValue); }}
                placeholder={loginState.phase === "auth" ? "http://localhost:1455/auth/callback?code=…" : (loginState.placeholder ?? "Enter value…")}
                aria-label={loginState.phase === "auth" ? "Redirect URL" : loginState.message}
                className={styles.promptInput}
              />
              <Button
                onClick={() => submitCode(loginState.token, inputValue)}
                disabled={!inputValue.trim()}
                tone="primary"
                size="sm"
              >
                {t("i18n.submit")}
              </Button>
            </div>
          </div>
        )}
        {loginState.phase === "device_code" && (
          <div className={styles.statusBlock}>
            <p className={styles.statusText}>
              Open the verification page and enter this code:
            </p>
            <div className={styles.deviceCode}>
              {loginState.userCode}
            </div>
            <p className={styles.statusHint}>
              <a href={loginState.verificationUri} target="_blank" rel="noopener noreferrer" className={styles.authLink}>
                {loginState.verificationUri}
              </a>
              {loginState.expiresInSeconds ? ` Expires in ${Math.ceil(loginState.expiresInSeconds / 60)} minutes.` : ""}
            </p>
          </div>
        )}
        {loginState.phase === "progress" && (
          <p className={styles.statusText}>{loginState.message}</p>
        )}
        {loginState.phase === "success" && (
          <p className={styles.successText}>{t("i18n.connectedSuccessfully")}</p>
        )}
        {loginState.phase === "error" && (
          <p className={styles.errorText} role="alert">{loginState.message}</p>
        )}
      </div>

      <div className={styles.actionRow}>
        {isWorking ? (
          <Button
            onClick={() => { eventSourceRef.current?.close(); setLoginState({ phase: "idle" }); }}
            size="sm"
          >
            {t("i18n.cancel")}
          </Button>
        ) : (
          <>
            <Button
              onClick={handleLogin}
              tone="primary"
              size="sm"
            >
              {provider.loggedIn ? t("i18n.relogin") : t("i18n.login")}
            </Button>
            {provider.loggedIn && (
              <Button
                onClick={handleLogout}
                tone="danger"
                size="sm"
              >
                {t("i18n.disconnect")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
