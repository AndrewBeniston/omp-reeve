"use client";

import { useEffect, useState } from "react";

export function formatAppShortcut(key: string, mac: boolean, alt = false): string {
  return mac ? `${alt ? "⌥" : ""}⌘${key}` : `Ctrl+${alt ? "Alt+" : ""}${key}`;
}

/**
 * Render an Electron accelerator the way the platform writes it.
 *
 * Accelerators are recorded in Electron's own form — `CmdOrCtrl+T`,
 * `Control+\``, `CmdOrCtrl+Alt+S` — because that is the form the application
 * menu registers them in, so one string can serve both the menu and the label
 * a human reads. Anything else would mean keeping two lists in step.
 *
 * On a Mac the modifiers become symbols and lose their separators, which is
 * the platform convention. Elsewhere they stay words joined by `+`.
 */
export function formatAccelerator(accelerator: string, mac: boolean): string {
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const symbols: Record<string, string> = {
    CmdOrCtrl: mac ? "⌘" : "Ctrl",
    Command: "⌘",
    Cmd: "⌘",
    // Control is its own key on a Mac and is not the same as Command.
    Control: mac ? "⌃" : "Ctrl",
    Ctrl: mac ? "⌃" : "Ctrl",
    Alt: mac ? "⌥" : "Alt",
    Option: "⌥",
    Shift: mac ? "⇧" : "Shift",
  };
  const modifiers = parts.map((part) => symbols[part] ?? part);
  const shown = key === "`" ? "`" : key.length === 1 ? key.toUpperCase() : key;
  return mac ? `${modifiers.join("")}${shown}` : [...modifiers, shown].join("+");
}

export function useShortcutLabel() {
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)); }, []);
  return (key: string, alt = false) => formatAppShortcut(key, mac, alt);
}

/** Render Electron accelerators for this platform. See formatAccelerator. */
export function useAcceleratorLabel() {
  const [mac, setMac] = useState(false);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.userAgent)); }, []);
  return (accelerator: string) => formatAccelerator(accelerator, mac);
}
