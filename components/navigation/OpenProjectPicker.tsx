"use client";

import { useEffect, useRef, useState } from "react";
import { DirectoryPicker } from "../DirectoryPicker";
import { rememberAddedProjectPath } from "@/lib/project-selection";

export function OpenProjectPicker({ onSelect, onCancel }: {
  onSelect: (path: string) => void;
  onCancel: () => void;
}) {
  const [browserPicker, setBrowserPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const callbacks = useRef({ onSelect, onCancel });
  callbacks.current = { onSelect, onCancel };
  const select = async (path: string) => {
    if (!active.current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/cwd/validate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd: path }),
      });
      const data = await response.json();
      if (!active.current) return;
      if (!response.ok || !data.cwd) throw new Error(data.error ?? `HTTP ${response.status}`);
      rememberAddedProjectPath(window.localStorage, data.cwd);
      callbacks.current.onSelect(data.cwd);
    } catch (cause) {
      if (!active.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setBrowserPicker(true);
    } finally { if (active.current) setBusy(false); }
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!window.ompDesktop?.selectDirectory) { setBrowserPicker(true); return; }
    window.ompDesktop.selectDirectory().then(path => {
      if (!active.current) return;
      if (path) void select(path);
      else callbacks.current.onCancel();
    }).catch(cause => {
      if (!active.current) return;
      setError(String(cause)); setBrowserPicker(true);
    });
  }, []);
  return browserPicker ? <DirectoryPicker busy={busy} error={error} onSelect={path => { void select(path); }} onCancel={onCancel} /> : null;
}
