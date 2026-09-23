"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import type { PowerSelection, ThinkingStep } from "@/lib/model-selector";
import { useI18n } from "@/hooks/useI18n";
import { MenuItem } from "@/components/ui/Menu";
import styles from "./ModelPowerSlider.module.css";

interface Props {
  steps: readonly PowerSelection[];
  currentStepId?: string;
  effortLabel: string;
  modelName: string | null;
  effortStage?: boolean;
  modelTriggerRef: RefObject<HTMLButtonElement | null>;
  modelMenuOpen: boolean;
  canSelectModel: boolean;
  canChangeEffort: boolean;
  onOpenModels: () => void;
  onSelectEffort: (level: ThinkingStep) => void;
  explicitModelOverride?: boolean;
  onResetToDefault?: () => void;
  stageTransition?: "enter" | "leave" | null;
}

export function ModelPowerSlider({
  steps,
  currentStepId,
  effortLabel,
  modelName,
  effortStage = false,
  modelTriggerRef,
  modelMenuOpen,
  canSelectModel,
  canChangeEffort,
  onOpenModels,
  onSelectEffort,
  explicitModelOverride = false,
  onResetToDefault,
  stageTransition = null,
}: Props) {
  const { t } = useI18n();
  const instructionsId = useId();
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  const [previewStepId, setPreviewStepId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const activePointer = useRef<number | null>(null);
  const previewIndex = steps.findIndex((step) => step.id === previewStepId);
  const visibleIndex = previewIndex >= 0 ? previewIndex : currentIndex;
  const isTopStep = visibleIndex >= 0 && steps[visibleIndex]?.thinkingLevel === "max";

  useEffect(() => {
    setPreviewStepId(null);
  }, [currentStepId]);

  const handlePowerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canChangeEffort || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    if (steps.length === 0) return;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const from = visibleIndex >= 0 ? visibleIndex : direction === 1 ? -1 : 0;
    const nextIndex = (from + direction + steps.length) % steps.length;
    const step = steps[nextIndex];
    if (nextIndex === visibleIndex) return;
    setPreviewStepId(step.id);
    const value = `${modelName ?? step.model.modelId} ${step.sliderLabel}`;
    const status = t("chat.powerKeyboardValue", { value, position: nextIndex + 1, total: steps.length });
    const isStepMax = step.thinkingLevel === "max";
    setAnnouncement(isStepMax ? `${status} ${t("chat.ultraUsageWarning")}` : status);
    onSelectEffort(step.thinkingLevel);
  };

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (steps.length === 1 || bounds.width <= 20) return 0;
    const fraction = (event.clientX - bounds.left - 10) / (bounds.width - 20);
    return Math.max(0, Math.min(steps.length - 1, Math.round(fraction * (steps.length - 1))));
  };

  const cancelDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setPreviewStepId(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div data-model-power-view data-stage-transition={stageTransition ?? undefined} className={styles.view}>
      <div data-stage-panel="top" data-stage-transition={stageTransition ?? undefined} className={styles.controlRow}>
        <MenuItem
          ref={modelTriggerRef}
          data-model-menu-row="model"
          aria-label={t("chat.selectModel")}
          aria-haspopup="menu"
          aria-expanded={modelMenuOpen}
          disabled={!canSelectModel}
          onClick={onOpenModels}
          className={styles.modelToggle}
          surface="plain"
        >
          <span data-model-effort-placeholder={effortStage ? "true" : undefined}>{t(effortStage ? "chat.selectEffort" : "chat.selectModel")}</span>
          {!effortStage && modelName && <span className={styles.modelName}>{modelName}</span>}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6.5 5 3 3-3 3" />
          </svg>
        </MenuItem>
      </div>
      {steps.length > 0 ? (
        <div data-slider-row data-stage-panel="slider" data-stage-transition={stageTransition ?? undefined} className={styles.sliderRow}>
          <div className={styles.sliderHeader}>
            {(explicitModelOverride || isTopStep) && (
              <div className={styles.sliderStart} data-slider-start>
                {explicitModelOverride && (
                  <button
                    type="button"
                    data-reset-control
                    className={`${styles.resetControl} ${isTopStep ? styles.resetControlHidden : ""}`}
                    aria-label={t("chat.resetToDefault")}
                    title={t("chat.resetToDefault")}
                    tabIndex={isTopStep ? -1 : 0}
                    aria-hidden={isTopStep ? "true" : undefined}
                    disabled={isTopStep}
                    hidden={isTopStep}
                    onClick={(event) => {
                      event.preventDefault();
                      onResetToDefault?.();
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.5 2.5v4h4" />
                      <path d="M2.7 6.5A6 6 0 1 1 2 8" />
                    </svg>
                  </button>
                )}
                {isTopStep && (
                  <span className={styles.usageWarning} data-usage-warning aria-hidden="true">
                    <span className={styles.usageWarningText}>
                      {t("chat.ultraUsageWarning")}
                    </span>
                  </span>
                )}
              </div>
            )}
            <div className={styles.effortLabel}>{steps[visibleIndex]?.sliderLabel ?? effortLabel}</div>
            {effortStage && modelName && <div className={styles.effortModelName} data-model-effort-name>{modelName}</div>}
          </div>
          <div
            className={styles.track}
            aria-label={t("chat.effort")}
            aria-disabled={!canChangeEffort}
            data-power-track
            onPointerDown={(event) => {
              if (event.button !== 0 || !canChangeEffort || activePointer.current !== null) return;
              const index = indexAt(event);
              activePointer.current = event.pointerId;
              setPreviewStepId(steps[index].id);
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (activePointer.current !== event.pointerId) return;
              const index = indexAt(event);
              setPreviewStepId(steps[index].id);
            }}
            onPointerUp={(event) => {
              if (activePointer.current !== event.pointerId) return;
              const index = indexAt(event);
              cancelDrag(event);
              if (steps[index].id !== currentStepId) onSelectEffort(steps[index].thinkingLevel);
            }}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
          >
            <MenuItem
              className={styles.keyboardControl}
              surface="plain"
              aria-label={t("chat.powerKeyboardLabel")}
              aria-keyshortcuts="ArrowLeft ArrowRight"
              aria-describedby={instructionsId}
              disabled={!canChangeEffort}
              onKeyDown={handlePowerKeyDown}
            />
            <span id={instructionsId} className={styles.visuallyHidden}>
              {t("chat.powerKeyboardInstructions")}
            </span>
            <div className={styles.rail}>
              {steps.map((step, index) => {
                const position = steps.length === 1 ? 50 : (index / (steps.length - 1)) * 100;
                return <span
                  key={step.id}
                  className={styles.dot}
                  data-power-dot
                  data-effort={step.effort}
                  data-filled={index < visibleIndex ? "true" : "false"}
                  style={{ left: `${position}%` }}
                />;
              })}
              {visibleIndex >= 0 && <span
                className={styles.thumb}
                data-power-thumb
                data-step={steps[visibleIndex].thinkingLevel}
                style={{ left: `${steps.length === 1 ? 50 : (visibleIndex / (steps.length - 1)) * 100}%` }}
              />}
            </div>
          </div>
          <span role="status" aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>
            {announcement}
          </span>
        </div>
      ) : (
        <div className={styles.empty}>{t("chat.noEffortLevels")}</div>
      )}
    </div>
  );
}
