"use client";

import { useRef, useState, type PointerEvent, type RefObject } from "react";
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
}: Props) {
  const { t } = useI18n();
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const activePointer = useRef<number | null>(null);
  const visibleIndex = previewIndex ?? currentIndex;

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (steps.length === 1 || bounds.width <= 20) return 0;
    const fraction = (event.clientX - bounds.left - 10) / (bounds.width - 20);
    return Math.max(0, Math.min(steps.length - 1, Math.round(fraction * (steps.length - 1))));
  };

  const cancelDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setPreviewIndex(null);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div data-model-power-view className={styles.view}>
      <div className={styles.controlRow}>
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
        <div className={styles.sliderRow}>
          <div className={styles.effortLabel}>{steps[visibleIndex]?.sliderLabel ?? effortLabel}</div>
          {effortStage && modelName && <div className={styles.effortModelName} data-model-effort-name>{modelName}</div>}
          <div
            className={styles.track}
            aria-label={t("chat.effort")}
            aria-disabled={!canChangeEffort}
            data-power-track
            onPointerDown={(event) => {
              if (event.button !== 0 || !canChangeEffort || activePointer.current !== null) return;
              const index = indexAt(event);
              activePointer.current = event.pointerId;
              setPreviewIndex(index);
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (activePointer.current !== event.pointerId) return;
              const index = indexAt(event);
              setPreviewIndex(index);
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
        </div>
      ) : (
        <div className={styles.empty}>{t("chat.noEffortLevels")}</div>
      )}
    </div>
  );
}
