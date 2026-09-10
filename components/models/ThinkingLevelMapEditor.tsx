"use client";

import { Button } from "../ui/Button";
import styles from "./thinking-level-map-editor.module.css";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type ThinkingLevel = typeof THINKING_LEVELS[number];

/**
 * Map each omp thinking level onto the value the model expects.
 * A level is Default when the map omits it, Disabled when the map holds null,
 * and Custom when the map holds a string.
 */
export function ThinkingLevelMapEditor({
  value,
  onChange,
}: {
  value: Record<string, string | null> | undefined;
  onChange: (v: Record<string, string | null> | undefined) => void;
}) {
  const map = value ?? {};

  const setLevel = (level: ThinkingLevel, entry: string | null | "omit") => {
    const next = { ...map };
    if (entry === "omit") {
      delete next[level];
    } else {
      next[level] = entry;
    }
    onChange(Object.keys(next).length ? next : undefined);
  };

  return (
    <div className={styles.levelList}>
      {THINKING_LEVELS.map((level) => {
        const raw = map[level];
        const state: "omit" | "null" | "string" =
          !(level in map) ? "omit" : raw === null ? "null" : "string";
        const strVal = typeof raw === "string" ? raw : "";

        return (
          <div key={level} className={styles.levelRow}>
            <div className={styles.levelBadge}>
              <span className={styles.levelDot} data-level={level} data-disabled={state === "null"} />
              <span className={styles.levelText} data-disabled={state === "null"}>
                {level}
              </span>
            </div>

            <div className={styles.presetGroup} role="group" aria-label={level}>
              <Button
                onClick={() => setLevel(level, "omit")}
                tone="ghost"
                size="sm"
                className={styles.presetButton}
                aria-pressed={state === "omit"}
                data-active={state === "omit"}
              >
                Default
              </Button>
              <Button
                onClick={() => setLevel(level, null)}
                tone="ghost"
                size="sm"
                className={styles.presetButton}
                aria-pressed={state === "null"}
                data-state="disabled"
                data-active={state === "null"}
              >
                Disabled
              </Button>
            </div>

            <div className={styles.customGroup} data-active={state === "string"}>
              <Button
                onClick={() => setLevel(level, strVal || level)}
                tone="ghost"
                size="sm"
                className={styles.presetButton}
                aria-pressed={state === "string"}
                data-active={state === "string"}
                data-custom="true"
              >
                Custom
              </Button>
              <input
                value={strVal}
                onChange={(e) => setLevel(level, e.target.value)}
                onFocus={() => { if (state !== "string") setLevel(level, strVal || level); }}
                placeholder={level}
                maxLength={10}
                aria-label={`${level} custom value`}
                className={styles.customInput}
                data-active={state === "string"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
