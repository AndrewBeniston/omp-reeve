"use client";

import { useI18n } from "@/hooks/useI18n";
import type { buildModelSelectorState } from "@/lib/model-selector";
import { MenuItem } from "@/components/ui/Menu";
import styles from "./ModelList.module.css";

type Selector = ReturnType<typeof buildModelSelectorState>;

interface Props {
  selector: Selector;
  isAutoModelSelection?: boolean;
  onDefault?: () => void;
  onModel: (provider: string, modelId: string, selected: boolean) => void;
  stageTransition?: "enter" | "leave" | null;
}

function SelectionMark({ selected }: { selected: boolean }) {
  return selected ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={styles.selectionMark} data-model-selection-check aria-hidden="true">
      <path d="m3.5 8 3 3 6-7" />
    </svg>
  ) : <span className={styles.selectionSpacer} />;
}

export function ModelList({
  selector,
  isAutoModelSelection,
  onDefault,
  onModel,
  stageTransition = null,
}: Props) {
  const { t } = useI18n();
  const { defaultRow, defaultRowSelected, modelRowsByProvider } = selector;
  const modelRows = modelRowsByProvider.flatMap((group) => group.options);

  return (
    <div data-model-list data-stage-transition={stageTransition ?? undefined} className={styles.list}>
      <div className={styles.heading} data-model-list-heading>{t("chat.selectModel")}</div>
      <div className={styles.scroller} data-model-list-scroller>
        {defaultRow && onDefault && (
          <MenuItem
            onClick={onDefault}
            className={styles.choice}
            data-selected={defaultRowSelected ? "true" : "false"}
            data-model-default
            role="menuitemradio"
            checked={defaultRowSelected}
            surface="plain"
          >
            <span className={styles.defaultCopy}>
              <span className={styles.label}>{defaultRow.label}</span>
              <span className={styles.description}>{defaultRow.description}</span>
            </span>
            <SelectionMark selected={defaultRowSelected} />
          </MenuItem>
        )}
        {modelRows.length === 0 ? (
          <div className={styles.empty}>{t("chat.noAvailableModels")}</div>
        ) : modelRows.map((option) => {
              const selected = option.selected && !defaultRowSelected;
              const route = modelRowsByProvider.find((group) => group.provider === option.provider)?.label ?? option.provider;
              return (
                <MenuItem
                  key={`${option.provider}:${option.modelId}`}
                  onClick={() => onModel(option.provider, option.modelId, selected && !isAutoModelSelection)}
                  className={styles.choice}
                  data-selected={selected ? "true" : "false"}
                  data-selection-id={option.selectionId}
                  role="menuitemradio"
                  checked={selected}
                  aria-label={`${route}, ${option.name}`}
                  surface="plain"
                >
                  <span className={styles.label} title={option.name}>{option.name}</span>
                  <SelectionMark selected={selected} />
                </MenuItem>
              );
            })}
      </div>
    </div>
  );
}
