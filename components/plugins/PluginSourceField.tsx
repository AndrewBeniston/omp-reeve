"use client";

import { useEffect, useRef } from "react";
import type { InputHTMLAttributes } from "react";

interface PluginSourceFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onPaste" | "onBlur" | "onKeyDown" | "style"
> {
  source: string;
  busy: boolean;
  onSourceChange: (value: string) => void;
  onInstall: () => void;
}

export function normalizePluginSourceInput(value: string): string {
  const match = value.trim().match(/^\$?\s*omp\s+plugin\s+(?:add|install)\s+(\S+)\s*$/);
  return match?.[1] ?? value;
}

export function PluginSourceField({
  source,
  busy,
  onSourceChange,
  onInstall,
  ...inputProps
}: PluginSourceFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      {...inputProps}
      ref={inputRef}
      value={source}
      onChange={(event) => onSourceChange(event.target.value)}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData("text");
        const normalized = normalizePluginSourceInput(pasted);
        if (normalized === pasted) return;
        event.preventDefault();
        onSourceChange(normalized);
      }}
      onBlur={(event) => onSourceChange(normalizePluginSourceInput(event.currentTarget.value))}
      placeholder="@scope/package or github:user/repo"
      onKeyDown={(event) => {
        if (event.key === "Enter" && source.trim() && !busy) onInstall();
      }}
    />
  );
}
