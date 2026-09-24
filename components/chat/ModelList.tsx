"use client";

import { useRef, type KeyboardEvent } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { buildModelSelectorState } from "@/lib/model-selector";
import { MenuItem } from "@/components/ui/Menu";
import styles from "./ModelList.module.css";

type Selector = ReturnType<typeof buildModelSelectorState>;

interface Props {
  selector: Selector;
  filter?: string;
  onFilterChange?: (value: string) => void;
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
  filter = "",
  onFilterChange,
  isAutoModelSelection,
  onDefault,
  onModel,
  stageTransition = null,
}: Props) {
  const { t } = useI18n();
  const { defaultRow, defaultRowSelected, modelRowsByProvider } = selector;
  const modelCount = modelRowsByProvider.reduce((count, group) => count + group.options.length, 0);
  const hasDefaultRow = Boolean(defaultRow && onDefault);
  const firstModelChoice = modelRowsByProvider[0]?.options[0];
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const moveFocusToSearch = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp") return;
    event.preventDefault();
    searchRef.current?.focus();
  };

  const moveFocusFromSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const rows = listRef.current?.querySelectorAll<HTMLElement>(
        "[role='menuitem'],[role='menuitemradio']",
      );
      if (rows?.length) {
        event.preventDefault();
        event.stopPropagation();
        rows[event.key === "ArrowDown" ? 0 : rows.length - 1]?.focus();
      }
      return;
    }
    if (["Enter", " ", "Home", "End"].includes(event.key)) {
      if (event.key === "Enter") event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div ref={listRef} data-model-list data-stage-transition={stageTransition ?? undefined} className={styles.list}>
      <div className={styles.heading} data-model-list-heading>{t("chat.selectModel")}</div>
      <div className={styles.searchRow}>
        <input
          ref={searchRef}
          type="search"
          value={filter}
          onChange={(event) => onFilterChange?.(event.target.value)}
          onKeyDown={moveFocusFromSearch}
          placeholder={t("chat.searchModels")}
          aria-label={t("chat.searchModels")}
          className={styles.search}
          data-model-search
        />
      </div>
      <div className={styles.scroller} data-model-list-scroller>
        {defaultRow && onDefault && (
          <MenuItem
            onClick={onDefault}
            className={styles.choice}
            data-selected={defaultRowSelected ? "true" : "false"}
            data-model-default
            onKeyDown={moveFocusToSearch}
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
        {modelCount === 0 ? (
          <div className={styles.empty}>{t(filter.trim() ? "chat.noMatchingModels" : "chat.noAvailableModels")}</div>
        ) : modelRowsByProvider.map((group) => (
          <section key={group.provider} className={styles.providerGroup}>
            <div className={styles.providerHeading} data-model-provider>{group.label}</div>
            {group.options.map((option) => {
              const selected = option.selected && !defaultRowSelected;
              return (
                <MenuItem
                  key={`${option.provider}:${option.modelId}`}
                  onClick={() => onModel(option.provider, option.modelId, selected && !isAutoModelSelection)}
                  onKeyDown={!hasDefaultRow && option === firstModelChoice ? moveFocusToSearch : undefined}
                  className={styles.choice}
                  data-selected={selected ? "true" : "false"}
                  data-selection-id={option.selectionId}
                  role="menuitemradio"
                  checked={selected}
                  aria-label={`${group.label}, ${option.name}`}
                  surface="plain"
                >
                  <span className={styles.label} title={option.name}>{option.name}</span>
                  <SelectionMark selected={selected} />
                </MenuItem>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
