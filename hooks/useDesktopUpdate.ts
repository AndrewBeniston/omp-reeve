"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * State published by the desktop updater (desktop/update-controller.cjs).
 * The browser build has no updater, so the hook returns null there.
 */
export interface DesktopUpdateState {
  currentVersion: string;
  phase: "idle" | "checking" | "up-to-date" | "downloading" | "ready" | "error";
  availableVersion: string | null;
  releaseNotes: string | null;
  percent: number;
  error: string | null;
  checkedAt: number | null;
}

interface DesktopUpdaterBridge {
  getState: () => Promise<DesktopUpdateState | null>;
  check: () => Promise<DesktopUpdateState | null>;
  install: () => Promise<boolean>;
  onState: (callback: (state: DesktopUpdateState) => void) => () => void;
}

function readBridge(): DesktopUpdaterBridge | null {
  const desktop = (globalThis as unknown as { ompDesktop?: { updater?: DesktopUpdaterBridge } }).ompDesktop;
  return desktop?.updater ?? null;
}

export function useDesktopUpdate() {
  const [state, setState] = useState<DesktopUpdateState | null>(null);

  useEffect(() => {
    const bridge = readBridge();
    if (!bridge) return;
    let active = true;
    void bridge.getState().then((initial) => {
      if (active && initial) setState(initial);
    });
    const unsubscribe = bridge.onState((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const install = useCallback(() => {
    const bridge = readBridge();
    return bridge ? bridge.install() : Promise.resolve(false);
  }, []);

  const check = useCallback(() => {
    const bridge = readBridge();
    return bridge ? bridge.check() : Promise.resolve(null);
  }, []);

  return { state, install, check };
}
