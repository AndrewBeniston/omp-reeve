"use client";

import { useEffect, useState } from "react";

export function formatAppShortcut(key: string, mac: boolean, alt = false): string {
  return mac ? `${alt ? "⌥" : ""}⌘${key}` : `Ctrl+${alt ? "Alt+" : ""}${key}`;
}

export function useShortcutLabel() {
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)); }, []);
  return (key: string, alt = false) => formatAppShortcut(key, mac, alt);
}
