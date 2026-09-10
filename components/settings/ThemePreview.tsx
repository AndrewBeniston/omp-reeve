"use client";

import type { WebThemePalette } from "@/lib/settings-api";
import styles from "./theme-preview.module.css";

const PREVIEW_TOKEN_SOURCES = {
  "--ui-canvas": "--bg",
  "--ui-sidebar": "--bg-panel",
  "--ui-border": "--border",
  "--ui-text": "--text",
  "--ui-text-muted": "--text-muted",
  "--ui-accent": "--accent",
} as const;

const HEX_DIGITS = "0123456789abcdef";
const KEYWORD_COLORS = new Set(["transparent", "currentcolor"]);

export type ThemePreviewMode = "dark" | "light";

function isHexColor(value: string): boolean {
  if (!value.startsWith("#")) return false;
  const digits = value.slice(1).toLowerCase();
  if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) return false;
  return [...digits].every((digit) => HEX_DIGITS.includes(digit));
}

function isChannelTriplet(value: string): boolean {
  const openIndex = value.indexOf("(");
  if (openIndex < 0 || value.slice(0, openIndex) !== "rgb" || !value.endsWith(")")) return false;
  if (value.indexOf("(", openIndex + 1) >= 0) return false;

  const channels = value.slice(openIndex + 1, -1).split(",").map((channel) => channel.trim());
  return channels.length === 3 && channels.every((channel) => {
    if (channel.length === 0 || channel.length > 3) return false;
    if (![...channel].every((digit) => digit >= "0" && digit <= "9")) return false;
    return Number(channel) <= 255;
  });
}

export function isPaletteColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const candidate = value.trim().toLowerCase();
  if (candidate.length === 0 || candidate.length > 32) return false;
  if (KEYWORD_COLORS.has(candidate)) return true;
  return isHexColor(candidate) || isChannelTriplet(candidate);
}

export function paletteDeclarations(palette: WebThemePalette): string {
  const declarations: string[] = [];
  for (const [token, source] of Object.entries(PREVIEW_TOKEN_SOURCES)) {
    const value = palette.variables[source];
    if (isPaletteColor(value)) declarations.push(`${token}:${value.trim()}`);
  }
  return declarations.join(";");
}

export function paletteRule(mode: ThemePreviewMode, palette: WebThemePalette): string {
  if (mode !== "dark" && mode !== "light") {
    throw new Error(`Unsupported theme preview mode: ${String(mode)}`);
  }
  return `[data-theme-preview=${mode}]{${paletteDeclarations(palette)}}`;
}

export interface ThemePreviewProps {
  mode: ThemePreviewMode;
  palette: WebThemePalette;
}

export function ThemePreview({ mode, palette }: ThemePreviewProps) {
  return (
    <div className={styles.scope} data-theme-preview={mode} data-color-scheme={palette.colorScheme}>
      <style>{paletteRule(mode, palette)}</style>
      <div className={styles.preview}>
        <div className={styles.bar} />
        <div className={styles.panel}>
          <div className={styles.line} />
          <div className={styles.line} />
        </div>
      </div>
    </div>
  );
}
