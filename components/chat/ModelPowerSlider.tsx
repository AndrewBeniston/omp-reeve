"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import type { PowerSelection, ThinkingStep } from "@/lib/model-selector";
import { useI18n } from "@/hooks/useI18n";
import { MenuItem } from "@/components/ui/Menu";
import { DynamicStyleVars } from "../ui/DynamicStyleVars";
import styles from "./ModelPowerSlider.module.css";

interface Props {
  steps: readonly PowerSelection[];
  modelSteps?: readonly PowerSelection[];
  currentStepId?: string;
  effortLabel: string;
  modelName: string | null;
  effortStage?: boolean;
  modelTriggerRef: RefObject<HTMLButtonElement | null>;
  modelMenuOpen: boolean;
  canSelectModel: boolean;
  canChangeEffort: boolean;
  onOpenModels: () => void;
  onSelectEffort: (level: ThinkingStep | "auto") => void;
  /** Opens the Advanced menu. The trigger is a small icon at the top right. */
  onOpenAdvanced?: () => void;
  advancedOpen?: boolean;
  advancedTriggerRef?: RefObject<HTMLButtonElement | null>;
  stageTransition?: "enter" | "leave" | null;
}

/** A slider position. Auto is the first position and lets OMP pick the effort. */
type SliderStep = Omit<PowerSelection, "thinkingLevel"> & { thinkingLevel: ThinkingStep | "auto" };

export function ModelPowerSlider({
  steps,
  modelSteps,
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
  onOpenAdvanced,
  advancedOpen = false,
  advancedTriggerRef,
  stageTransition = null,
}: Props) {
  const { t } = useI18n();
  const instructionsId = useId();
  const levelSteps: readonly SliderStep[] = modelSteps ?? steps;
  const autoStep: SliderStep | null = canChangeEffort && levelSteps.length > 0
    ? {
      ...levelSteps[0],
      id: "auto",
      thinkingLevel: "auto",
      effortLabel: t("chat.effortAuto"),
      sliderLabel: t("chat.effortAuto"),
    }
    : null;
  const visibleSteps: readonly SliderStep[] = autoStep ? [autoStep, ...levelSteps] : levelSteps;
  const matchedIndex = visibleSteps.findIndex((step) => step.id === currentStepId);
  // No matching level means the Session runs at Auto.
  const currentIndex = matchedIndex >= 0 ? matchedIndex : autoStep ? 0 : -1;
  const [previewStepId, setPreviewStepId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const activePointer = useRef<number | null>(null);
  const previewIndex = visibleSteps.findIndex((step) => step.id === previewStepId);
  const visibleIndex = previewIndex >= 0 ? previewIndex : currentIndex;
  const isTopStep = visibleIndex >= 0 && visibleSteps[visibleIndex]?.thinkingLevel === "max";
  // 0 to 1 along the track. The CSS keeps the first and last dots one thumb
  // radius inside the rail ends, so every gap between dots is equal.
  const progress = visibleSteps.length === 1 ? 0.5 : visibleIndex < 0 ? 0 : visibleIndex / (visibleSteps.length - 1);

  useEffect(() => {
    setPreviewStepId(null);
  }, [currentStepId]);

  const handlePowerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canChangeEffort || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    if (visibleSteps.length === 0) return;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const from = visibleIndex >= 0 ? visibleIndex : direction === 1 ? -1 : 0;
    const nextIndex = (from + direction + visibleSteps.length) % visibleSteps.length;
    const step = visibleSteps[nextIndex];
    if (nextIndex === visibleIndex) return;
    setPreviewStepId(step.id);
    const value = `${modelName ?? step.model.modelId} ${step.sliderLabel}`;
    const status = t("chat.powerKeyboardValue", { value, position: nextIndex + 1, total: visibleSteps.length });
    const isStepMax = step.thinkingLevel === "max";
    setAnnouncement(isStepMax ? `${status} ${t("chat.ultraUsageWarning")}` : status);
    onSelectEffort(step.thinkingLevel);
  };

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (visibleSteps.length === 1 || bounds.width <= 20) return 0;
    // The rail sits 8px inside the track on each side (2px margin plus 6px
    // padding), and the thumb centre travels 14px inside the rail ends.
    const fraction = (event.clientX - bounds.left - 20) / (bounds.width - 40);
    return Math.max(0, Math.min(visibleSteps.length - 1, Math.round(fraction * (visibleSteps.length - 1))));
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
      <div data-model-effort-header className={styles.sliderHeader}>
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
          {effortStage && <span className={styles.visuallyHidden} data-model-effort-placeholder="true">{t("chat.selectEffort")}</span>}
          <span className={styles.effortLabel} data-model-effort-label>{visibleSteps[visibleIndex]?.sliderLabel ?? effortLabel}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6.5 5 3 3-3 3" />
          </svg>
        </MenuItem>
        {modelName && <div className={styles.effortModelName} data-model-effort-name>{modelName}</div>}
        {onOpenAdvanced && (
          <button
            type="button"
            ref={advancedTriggerRef}
            data-model-menu-row="advanced"
            role="menuitem"
            className={styles.headerAction}
            aria-label={t("chat.advanced")}
            title={t("chat.advanced")}
            aria-haspopup="menu"
            aria-expanded={advancedOpen}
            data-open={advancedOpen ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onOpenAdvanced();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
              <circle cx="10" cy="4.5" r="1.5" />
              <circle cx="6" cy="11.5" r="1.5" />
            </svg>
          </button>
        )}
      </div>
      {visibleSteps.length > 0 ? (
        <div data-slider-row data-stage-panel="slider" data-stage-transition={stageTransition ?? undefined} className={styles.sliderRow}>
          <div
            className={styles.track}
            data-previewing={previewIndex >= 0 ? "true" : undefined}
            aria-label={t("chat.effort")}
            aria-disabled={!canChangeEffort}
            data-power-track
            onPointerDown={(event) => {
              if (event.button !== 0 || !canChangeEffort || activePointer.current !== null) return;
              const index = indexAt(event);
              activePointer.current = event.pointerId;
              setPreviewStepId(visibleSteps[index].id);
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (activePointer.current !== event.pointerId) return;
              const index = indexAt(event);
              setPreviewStepId(visibleSteps[index].id);
            }}
            onPointerUp={(event) => {
              if (activePointer.current !== event.pointerId) return;
              const index = indexAt(event);
              cancelDrag(event);
              if (visibleSteps[index].id !== currentStepId) onSelectEffort(visibleSteps[index].thinkingLevel);
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
            <DynamicStyleVars className={styles.rail} data-auto={visibleSteps[visibleIndex]?.thinkingLevel === "auto" ? "true" : undefined} variables={{ "--ui-power-progress": String(progress) }}>
              {visibleSteps.map((step, index) => {
                const position = visibleSteps.length === 1 ? 0.5 : index / (visibleSteps.length - 1);
                return <DynamicStyleVars
                  as="span"
                  key={step.id}
                  className={styles.dot}
                  data-power-dot
                  data-step-id={step.id}
                  data-effort={step.id === "auto" ? "auto" : step.effort}
                  data-filled={index < visibleIndex ? "true" : "false"}
                  variables={{ "--ui-power-position": String(position) }}
                />
              })}
              {visibleIndex >= 0 && <DynamicStyleVars
                as="span"
                className={styles.thumb}
                data-power-thumb
                data-step={visibleSteps[visibleIndex].thinkingLevel}
                variables={{ "--ui-power-position": String(progress) }}
              />}
            </DynamicStyleVars>
          </div>
          <div className={styles.usageWarning} data-usage-warning data-visible={isTopStep ? "true" : "false"} aria-hidden="true">
            <span className={styles.usageWarningText}>{t("chat.ultraUsageWarning")}</span>
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
