import {
  getAvailableThemes,
  getResolvedThemeColors,
  getThemeExportColors,
  isLightTheme,
} from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import type { Settings } from "@oh-my-pi/pi-coding-agent";
import type { WebThemeConfig, WebThemePalette } from "@/lib/settings-api";
import { hasCompleteWebThemeVariables } from "@/lib/theme-contract";

function firstColor(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "transparent";
}

type Rgb = [red: number, green: number, blue: number];
type Color = string | Rgb;

function parseRgb(value: Color): Rgb | null {
  if (Array.isArray(value)) return value;
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const hex = match[1];
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function mixRgb(from: Color, to: Color, amount: number): Rgb | null {
  const fromRgb = parseRgb(from);
  const toRgb = parseRgb(to);
  if (!fromRgb || !toRgb) return null;
  return fromRgb.map((channel, index) => channel + (toRgb[index] - channel) * amount) as Rgb;
}

function mixHex(from: string, to: string, amount: number): string {
  const mixed = mixRgb(from, to, amount);
  if (!mixed) return from;
  return `#${mixed.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(value: Color): number | null {
  const rgb = parseRgb(value);
  if (!rgb) return null;
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: Color, background: Color): number | null {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return null;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureContrast(color: string, target: string, backgrounds: Color[], minimum: number): string {
  const hasContrast = (candidate: string) => backgrounds.every((background) => {
    const ratio = contrastRatio(candidate, background);
    return ratio === null || ratio >= minimum;
  });
  if (hasContrast(color)) return color;
  if (!hasContrast(target)) return target;

  let low = 0;
  let high = 1;
  for (let index = 0; index < 12; index += 1) {
    const midpoint = (low + high) / 2;
    if (hasContrast(mixHex(color, target, midpoint))) high = midpoint;
    else low = midpoint;
  }
  return mixHex(color, target, high);
}

export async function getWebThemePalette(name: string): Promise<WebThemePalette> {
  const [colors, exported] = await Promise.all([
    getResolvedThemeColors(name),
    getThemeExportColors(name),
  ]);
  const colorScheme = isLightTheme(name) ? "light" : "dark";
  const pageBg = firstColor(exported.pageBg, colors.userMessageBg, colorScheme === "light" ? "#ffffff" : "#111318");
  const panelBg = firstColor(exported.cardBg, colors.statusLineBg, colors.toolPendingBg, pageBg);
  const hoverBg = firstColor(colors.borderMuted, colors.border, panelBg);
  const selectedBg = firstColor(colors.selectedBg, colors.borderAccent, hoverBg);
  const text = firstColor(colors.text, colorScheme === "light" ? "#17191d" : "#e5e7eb");
  const rawMuted = firstColor(colors.muted, text);
  const rawDim = firstColor(colors.dim, rawMuted);
  const muted = ensureContrast(rawMuted, text, [pageBg, panelBg], 6);
  const dim = ensureContrast(rawDim, text, [pageBg, panelBg], 5);
  const accent = firstColor(colors.accent, colors.borderAccent, text);
  const success = firstColor(colors.success, colors.toolDiffAdded, accent);
  const danger = firstColor(colors.error, colors.toolDiffRemoved, "#dc2626");
  const warning = firstColor(colors.warning, "#d97706");
  const toolBg = firstColor(colors.toolPendingBg, panelBg);
  const sidebarBg = mixRgb(pageBg, text, colorScheme === "light" ? 0.025 : 0.08) ?? pageBg;
  const terminalCommandBg = mixRgb(toolBg, sidebarBg, 0.2) ?? toolBg;
  const syntaxBackgrounds = [pageBg, toolBg, terminalCommandBg];
  const syntaxContrastTarget = colorScheme === "light" ? "#000000" : "#ffffff";
  const syntaxMinimumContrast = 4.55;

  return {
    name,
    colorScheme,
    variables: {
      "--bg": pageBg,
      "--bg-panel": panelBg,
      "--bg-hover": hoverBg,
      "--bg-selected": selectedBg,
      "--border": firstColor(colors.borderMuted, colors.border, hoverBg),
      "--text": text,
      "--text-muted": muted,
      "--text-dim": dim,
      "--accent": accent,
      "--accent-hover": mixHex(accent, text, 0.16),
      "--user-bg": firstColor(colors.userMessageBg, panelBg),
      "--assistant-bg": pageBg,
      "--tool-bg": toolBg,
      "--bg-subtle": firstColor(exported.infoBg, colors.customMessageBg, hoverBg),
      "--success": success,
      "--danger": danger,
      "--warning": warning,
      "--syntax-text": ensureContrast(text, syntaxContrastTarget, syntaxBackgrounds, syntaxMinimumContrast),
      "--syntax-text-muted": ensureContrast(rawDim, syntaxContrastTarget, syntaxBackgrounds, syntaxMinimumContrast),
      "--syntax-accent": ensureContrast(accent, syntaxContrastTarget, syntaxBackgrounds, syntaxMinimumContrast),
      "--syntax-success": ensureContrast(success, syntaxContrastTarget, syntaxBackgrounds, syntaxMinimumContrast),
      "--syntax-danger": ensureContrast(danger, syntaxContrastTarget, syntaxBackgrounds, syntaxMinimumContrast),
      "--syntax-warning": ensureContrast(warning, syntaxContrastTarget, syntaxBackgrounds, syntaxMinimumContrast),
      "--omp-md-heading": firstColor(colors.mdHeading, accent),
      "--omp-md-link": firstColor(colors.mdLink, accent),
      "--omp-md-code": firstColor(colors.mdCode, colors.syntaxString, accent),
    },
  };
}

async function getSupportedWebThemePalette(name: string, fallbackName: string): Promise<WebThemePalette> {
  try {
    const palette = await getWebThemePalette(name);
    if (hasCompleteWebThemeVariables(palette.variables)) return palette;
  } catch {
    // A saved OMP theme can remain after that theme becomes unsupported for the web adapter.
  }

  const fallback = await getWebThemePalette(fallbackName);
  if (!hasCompleteWebThemeVariables(fallback.variables)) {
    throw new Error(`Default web theme ${fallbackName} has an incomplete palette`);
  }
  return fallback;
}

export async function getWebThemeConfig(settings: Settings): Promise<WebThemeConfig> {
  const dark = settings.get("theme.dark") ?? "titanium";
  const light = settings.get("theme.light") ?? "light";
  const [darkPalette, lightPalette] = await Promise.all([
    getSupportedWebThemePalette(dark, "titanium"),
    getSupportedWebThemePalette(light, "light"),
  ]);
  return {
    names: { dark: darkPalette.name, light: lightPalette.name },
    palettes: { dark: darkPalette, light: lightPalette },
  };
}

export async function getAvailableWebThemes(): Promise<Array<{ name: string; colorScheme: "dark" | "light" }>> {
  const names = await getAvailableThemes();
  const themes = await Promise.all(names.map(async (name) => {
    try {
      const palette = await getWebThemePalette(name);
      if (!hasCompleteWebThemeVariables(palette.variables)) return null;
      return { name, colorScheme: palette.colorScheme };
    } catch {
      return null;
    }
  }));
  return themes.filter((theme): theme is { name: string; colorScheme: "dark" | "light" } => theme !== null);
}
