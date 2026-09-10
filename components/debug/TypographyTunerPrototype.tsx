"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { smoothStreamingRate, STREAMING_METRIC_FPS, StreamingMetrics } from "../MessageView";
import styles from "./TypographyTunerPrototype.module.css";

const FONT_TOKENS = [
  "--text-2xs",
  "--text-xs",
  "--text-sm",
  "--text-base",
  "--text-ui",
  "--text-title",
] as const;

type FontToken = (typeof FONT_TOKENS)[number];
type PanelPosition = "bottom-right" | "bottom-left" | "top-left" | "top-right";

type TokenValue = {
  original: number;
  value: number;
};

type TargetValue = {
  id: number;
  node: HTMLElement;
  label: string;
  selector: string;
  original: number;
  value: number;
};

const POSITION_ORDER: PanelPosition[] = ["bottom-right", "bottom-left", "top-left", "top-right"];

function readPixels(value: string): number {
  const pixels = Number.parseFloat(value);
  return Number.isFinite(pixels) ? pixels : 0;
}

function clampFontSize(value: number): number {
  return Math.min(48, Math.max(6, Math.round(value * 4) / 4));
}

function getTextLabel(node: HTMLElement): string {
  const text = node.innerText.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, 64) : node.getAttribute("aria-label") ?? node.tagName.toLowerCase();
}

function getReadableSelector(node: HTMLElement): string {
  if (node.id) return `#${node.id}`;
  const testId = node.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;
  const classes = Array.from(node.classList).slice(0, 3);
  return `${node.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join("")}`;
}

function isPanelNode(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-typography-tuner-panel="true"]'));
}

export function TypographyTunerPrototype() {
  const [tokenValues, setTokenValues] = useState<Partial<Record<FontToken, TokenValue>>>({});
  const [targets, setTargets] = useState<TargetValue[]>([]);
  const [pickerActive, setPickerActive] = useState(false);
  const [position, setPosition] = useState<PanelPosition>("bottom-right");
  const [collapsed, setCollapsed] = useState(false);
  const [copyStatus, setCopyStatus] = useState("Copy changes");
  const [metricPreview, setMetricPreview] = useState({ estimatedTokens: 101, tokensPerSecond: 999 });
  const hoveredNodeRef = useRef<HTMLElement | null>(null);
  const targetIdRef = useRef(0);
  const targetsRef = useRef<TargetValue[]>([]);
  targetsRef.current = targets;

  useEffect(() => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const initialValues: Partial<Record<FontToken, TokenValue>> = {};
    for (const token of FONT_TOKENS) {
      const value = readPixels(rootStyles.getPropertyValue(token));
      initialValues[token] = { original: value, value };
    }
    setTokenValues(initialValues);
  }, []);

  useEffect(() => {
    const renderInterval = 1000 / STREAMING_METRIC_FPS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextRenderTime = performance.now() + renderInterval;
    let frameCount = 0;
    const tick = () => {
      const frameTime = performance.now();
      while (frameTime >= nextRenderTime) nextRenderTime += renderInterval;
      frameCount += 1;
      const targetRate = frameCount % 30 < 12 ? 999 : 0;
      setMetricPreview((current) => ({
        estimatedTokens: current.estimatedTokens >= 999 ? 101 : current.estimatedTokens + 1,
        tokensPerSecond: smoothStreamingRate(current.tokensPerSecond, targetRate),
      }));
      timer = setTimeout(tick, Math.max(0, nextRenderTime - performance.now()));
    };
    timer = setTimeout(tick, renderInterval);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!pickerActive) return;

    const clearHover = () => {
      hoveredNodeRef.current?.removeAttribute("data-typography-tuner-hover");
      hoveredNodeRef.current = null;
    };
    const handlePointerOver = (event: PointerEvent) => {
      if (isPanelNode(event.target)) return;
      const node = event.target instanceof HTMLElement ? event.target : null;
      if (!node || node === hoveredNodeRef.current) return;
      clearHover();
      node.setAttribute("data-typography-tuner-hover", "true");
      hoveredNodeRef.current = node;
    };
    const handleClick = (event: MouseEvent) => {
      if (isPanelNode(event.target)) return;
      const node = event.target instanceof HTMLElement ? event.target : null;
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      clearHover();

      setTargets((current) => {
        const existing = current.find((target) => target.node === node);
        if (existing) return current;
        const size = readPixels(window.getComputedStyle(node).fontSize);
        const id = ++targetIdRef.current;
        node.setAttribute("data-typography-tuner-selected", "true");
        node.setAttribute("data-typography-tuner-target", String(id));
        return [
          ...current,
          {
            id,
            node,
            label: getTextLabel(node),
            selector: getReadableSelector(node),
            original: size,
            value: size,
          },
        ];
      });
      setPickerActive(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerActive(false);
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearHover();
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerActive]);

  const overrideCss = useMemo(() => {
    const tokenRules = FONT_TOKENS.flatMap((token) => {
      const current = tokenValues[token];
      return current && current.value !== current.original ? [`${token}: ${current.value}px;`] : [];
    });
    const targetRules = targets
      .filter((target) => target.value !== target.original)
      .map((target) => `[data-typography-tuner-target="${target.id}"] { font-size: ${target.value}px !important; }`);
    const interactionRules = [
      '[data-typography-tuner-hover="true"] { outline: 2px solid var(--ui-accent) !important; outline-offset: 2px !important; cursor: crosshair !important; }',
      '[data-typography-tuner-selected="true"] { box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent) 60%, transparent) !important; }',
    ];
    const rootRule = tokenRules.length ? `:root { ${tokenRules.join(" ")} }` : "";
    return [...interactionRules, rootRule, ...targetRules].filter(Boolean).join("\n");
  }, [targets, tokenValues]);

  useEffect(() => {
    return () => {
      for (const target of targetsRef.current) {
        target.node.removeAttribute("data-typography-tuner-selected");
        target.node.removeAttribute("data-typography-tuner-target");
      }
    };
  }, []);

  const setTokenValue = useCallback((token: FontToken, nextValue: number) => {
    const value = clampFontSize(nextValue);
    setTokenValues((current) => ({
      ...current,
      [token]: { original: current[token]?.original ?? value, value },
    }));
    setCopyStatus("Copy changes");
  }, []);

  const setTargetValue = useCallback((id: number, nextValue: number) => {
    const value = clampFontSize(nextValue);
    setTargets((current) => current.map((target) => {
      if (target.id !== id) return target;
      return { ...target, value };
    }));
    setCopyStatus("Copy changes");
  }, []);

  const removeTarget = useCallback((id: number) => {
    setTargets((current) => {
      const target = current.find((entry) => entry.id === id);
      if (!target) return current;
      target.node.removeAttribute("data-typography-tuner-selected");
      target.node.removeAttribute("data-typography-tuner-target");
      return current.filter((entry) => entry.id !== id);
    });
    setCopyStatus("Copy changes");
  }, []);

  const changedTokens = useMemo(
    () => FONT_TOKENS.filter((token) => {
      const current = tokenValues[token];
      return current && current.value !== current.original;
    }),
    [tokenValues],
  );
  const changedTargets = useMemo(
    () => targets.filter((target) => target.value !== target.original),
    [targets],
  );

  const resetAll = useCallback(() => {
    setTokenValues((current) => {
      const resetValues = { ...current };
      for (const token of FONT_TOKENS) {
        const original = current[token]?.original ?? 0;
        resetValues[token] = { original, value: original };
      }
      return resetValues;
    });
    for (const target of targets) {
      target.node.removeAttribute("data-typography-tuner-selected");
      target.node.removeAttribute("data-typography-tuner-target");
    }
    setTargets([]);
    setCopyStatus("Copy changes");
  }, [targets]);

  const copyChanges = useCallback(async () => {
    const tokenLines = changedTokens.length
      ? changedTokens.map((token) => {
          const current = tokenValues[token]!;
          return `${token}: ${current.original}px -> ${current.value}px`;
        })
      : ["No token changes"];
    const targetLines = changedTargets.length
      ? changedTargets.flatMap((target) => [
          `\"${target.label}\"`,
          `selector: ${target.selector}`,
          `font-size: ${target.original}px -> ${target.value}px`,
        ])
      : ["No element changes"];
    const output = [
      "Reeve typography tuning",
      `Viewport: ${window.innerWidth}x${window.innerHeight}`,
      "",
      "Token changes:",
      ...tokenLines,
      "",
      "Element changes:",
      ...targetLines,
    ].join("\n");
    await navigator.clipboard.writeText(output);
    setCopyStatus("Copied");
  }, [changedTargets, changedTokens, tokenValues]);

  const movePanel = () => {
    const currentIndex = POSITION_ORDER.indexOf(position);
    setPosition(POSITION_ORDER[(currentIndex + 1) % POSITION_ORDER.length]);
  };

  return (
    <>
      <style data-typography-tuner-overrides="true">{overrideCss}</style>
      <aside
        className={styles.panel}
        data-position={position}
        data-typography-tuner-panel="true"
        aria-label="Typography tuner"
      >
      <div className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.title}>Typography tuner</div>
          <div className={styles.subtitle}>Development prototype</div>
        </div>
        <button type="button" className={`${styles.button} ${styles.iconButton}`} onClick={movePanel} title="Move panel">
          ↗
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.iconButton}`}
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "Expand panel" : "Collapse panel"}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className={styles.content}>
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Streaming preview</div>
              <div className={styles.metricPreview}>
                <StreamingMetrics
                  estimatedTokens={metricPreview.estimatedTokens}
                  tokensPerSecond={metricPreview.tokensPerSecond}
                  title="Synthetic streaming metrics"
                />
              </div>
            </section>
            <section className={styles.section}>
              <div className={styles.sectionTitle}>Shared sizes</div>
              <div className={styles.hint}>These controls update every element that uses a shared typography token.</div>
              {FONT_TOKENS.map((token) => {
                const current = tokenValues[token];
                if (!current) return null;
                return (
                  <div className={styles.row} key={token}>
                    <span className={styles.rowLabel} title={token}>{token}</span>
                    <div className={styles.controls}>
                      <button type="button" className={`${styles.button} ${styles.iconButton}`} onClick={() => setTokenValue(token, current.value - 0.25)}>−</button>
                      <input
                        className={styles.number}
                        type="number"
                        min="6"
                        max="48"
                        step="0.25"
                        value={current.value}
                        onChange={(event) => setTokenValue(token, Number(event.target.value))}
                        aria-label={`${token} font size`}
                      />
                      <button type="button" className={`${styles.button} ${styles.iconButton}`} onClick={() => setTokenValue(token, current.value + 0.25)}>+</button>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>Individual text</div>
              <div className={styles.hint}>Select any remaining text. Press Escape to cancel selection.</div>
              <button
                type="button"
                className={styles.button}
                data-active={pickerActive}
                onClick={() => setPickerActive((value) => !value)}
              >
                {pickerActive ? "Select text on the page" : "Pick text"}
              </button>
              {targets.map((target) => (
                <div className={styles.targetCard} key={target.id}>
                  <div className={styles.targetText} title={target.label}>{target.label}</div>
                  <div className={styles.targetSelector} title={target.selector}>{target.selector}</div>
                  <div className={styles.row}>
                    <span className={styles.hint}>{target.original}px original</span>
                    <div className={styles.controls}>
                      <button type="button" className={`${styles.button} ${styles.iconButton}`} onClick={() => setTargetValue(target.id, target.value - 0.25)}>−</button>
                      <input
                        className={styles.number}
                        type="number"
                        min="6"
                        max="48"
                        step="0.25"
                        value={target.value}
                        onChange={(event) => setTargetValue(target.id, Number(event.target.value))}
                        aria-label={`${target.label} font size`}
                      />
                      <button type="button" className={`${styles.button} ${styles.iconButton}`} onClick={() => setTargetValue(target.id, target.value + 0.25)}>+</button>
                      <button type="button" className={`${styles.button} ${styles.iconButton}`} onClick={() => removeTarget(target.id)} title="Remove selection">×</button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.button}
              onClick={() => void copyChanges()}
              disabled={changedTokens.length === 0 && changedTargets.length === 0}
            >
              {copyStatus}
            </button>
            <button type="button" className={styles.button} onClick={resetAll}>Reset</button>
            <span className={styles.status}>{changedTokens.length + changedTargets.length} changed</span>
          </div>
        </>
      )}
      </aside>
    </>
  );
}
