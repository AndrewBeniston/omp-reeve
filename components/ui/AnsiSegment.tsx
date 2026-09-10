import type { CSSProperties, ReactNode } from "react";
import type { AnsiSegment as ParsedAnsiSegment } from "@/lib/ansi";

declare const ANSI_RUNTIME_COLOR: unique symbol;

export type AnsiRuntimeColor = string & {
  readonly [ANSI_RUNTIME_COLOR]: true;
};

export interface AnsiSegmentProps {
  segment: ParsedAnsiSegment;
  preserveUnstyledSpan?: boolean;
}

function isHexAnsiColor(value: string): boolean {
  if (value.length !== 7 || !value.startsWith("#")) return false;
  const hexDigits = "0123456789abcdef";
  return [...value.slice(1).toLowerCase()].every((digit) => hexDigits.includes(digit));
}

function isRgbAnsiColor(value: string): boolean {
  const openParenthesis = value.indexOf("(");
  if (openParenthesis < 0 || value.slice(0, openParenthesis) !== "rgb" || !value.endsWith(")")) return false;
  if (value.indexOf("(", openParenthesis + 1) >= 0) return false;

  const channels = value.slice(openParenthesis + 1, -1).split(",").map((channel) => channel.trim());
  return channels.length === 3 && channels.every((channel) => {
    if (!/^\d{1,3}$/.test(channel)) return false;
    const number = Number(channel);
    return number >= 0 && number <= 255;
  });
}

export function isAnsiRuntimeColor(value: unknown): value is AnsiRuntimeColor {
  return typeof value === "string" && (isHexAnsiColor(value) || isRgbAnsiColor(value));
}

function validateAnsiColors(ansiStyle: ParsedAnsiSegment["style"]): CSSProperties {
  for (const [name, value] of [
    ["foreground", ansiStyle.color],
    ["background", ansiStyle.backgroundColor],
  ] as const) {
    if (value !== undefined && !isAnsiRuntimeColor(value)) {
      throw new TypeError(`Invalid ANSI ${name} color: ${String(value)}`);
    }
  }
  return ansiStyle;
}

export function AnsiSegment({ segment, preserveUnstyledSpan = false }: AnsiSegmentProps): ReactNode {
  const hasRuntimeStyle = Object.keys(segment.style).length > 0;
  if (!hasRuntimeStyle && !preserveUnstyledSpan) return segment.text;

  const ansiStyle = hasRuntimeStyle ? validateAnsiColors(segment.style) : undefined;
  // Arbitrary ANSI 24-bit colors cannot be expressed as a finite set of CSS classes.
  return <span style={ansiStyle}>{segment.text}</span>;
}
