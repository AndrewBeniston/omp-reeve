"use client";

import type { RefObject } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { buildModelSelectorState } from "@/lib/model-selector";
import { MenuItem } from "@/components/ui/Menu";
import styles from "./ModelList.module.css";

type Selector = ReturnType<typeof buildModelSelectorState>;

interface Props {
  selector: Selector;
  filter: string;
  showFilter: boolean;
  filterRef: RefObject<HTMLInputElement | null>;
  isMobile: boolean;
  isAutoModelSelection?: boolean;
  onFilterChange: (value: string) => void;
  onDefault?: () => void;
  onModel: (provider: string, modelId: string, selected: boolean) => void;
}

function SelectionMark({ selected }: { selected: boolean }) {
  return selected ? (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.selectionMark} aria-hidden="true">
      <path d="m1 5 2.5 2.5L9 2" />
    </svg>
  ) : <span className={styles.selectionSpacer} />;
}

export function ModelList({
  selector,
  filter,
  showFilter,
  filterRef,
  isMobile,
  isAutoModelSelection,
  onFilterChange,
  onDefault,
  onModel,
}: Props) {
  const { t } = useI18n();
  const { defaultRow, defaultRowSelected, modelRowsByProvider } = selector;

  return (
    <div className={styles.list}>
      <div className={styles.heading} data-model-list-heading>{t("chat.selectModel")}</div>
      {showFilter && (
        <div className={styles.filterWrap}>
          <input
            ref={filterRef}
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={t("chat.filterModels")}
            aria-label={t("chat.filterModels")}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className={styles.filter}
            data-mobile={isMobile ? "true" : "false"}
          />
        </div>
      )}
      <div className={styles.scroller} data-model-list-scroller>
        {defaultRow && onDefault && !filter.trim() && (
          <MenuItem
            onClick={onDefault}
            className={styles.choice}
            data-selected={defaultRowSelected ? "true" : "false"}
            data-model-default
            role="menuitemradio"
            checked={defaultRowSelected}
            surface="plain"
          >
            <SelectionMark selected={defaultRowSelected} />
            <span className={styles.defaultCopy}>
              <span className={styles.label}>{defaultRow.label}</span>
              <span className={styles.description}>{defaultRow.description}</span>
            </span>
          </MenuItem>
        )}
        {modelRowsByProvider.length === 0 ? (
          <div className={styles.empty}>{filter.trim() ? t("chat.noMatchingModels") : t("chat.noAvailableModels")}</div>
        ) : modelRowsByProvider.map((group, groupIndex) => (
          <div key={group.provider} data-model-provider={group.provider}>
            {(modelRowsByProvider.length > 1 || group.label !== group.provider) && (
              <div className={styles.groupLabel} data-divided={groupIndex > 0 ? "true" : "false"}>{group.label}</div>
            )}
            {group.options.map((option) => {
              const selected = option.selected && !defaultRowSelected;
              return (
                <MenuItem
                  key={`${option.provider}:${option.modelId}`}
                  onClick={() => onModel(option.provider, option.modelId, selected && !isAutoModelSelection)}
                  className={styles.choice}
                  data-selected={selected ? "true" : "false"}
                  data-selection-id={option.selectionId}
                  role="menuitemradio"
                  checked={selected}
                  surface="plain"
                >
                  <SelectionMark selected={selected} />
                  <span className={styles.label} title={option.name}>{option.name}</span>
                </MenuItem>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
