"use client";

import React, { useEffect, useRef } from "react";
import type {
  ComposerSuggestion,
  ComposerSuggestionGroup,
  ComposerSuggestionSection,
} from "@/lib/composer-intelligence";
import { SlashCommandIcon } from "./SlashCommandIcon";
import cssModule from "./composer-autocomplete.module.css";

const styles = new Proxy(cssModule as Record<string, string>, {
  get(target, property: string) {
    return target[property] ?? property;
  },
});

function SuggestionIcon({ item }: { item: ComposerSuggestion }) {
  if (item.kind === "agent") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="6" r="2.75" />
        <path d="M3.25 13.5c.45-2.35 2.05-3.5 4.75-3.5s4.3 1.15 4.75 3.5" />
      </svg>
    );
  }
  if (item.kind === "file") {
    return item.isDirectory ? (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.75 4.25A1.5 1.5 0 0 1 3.25 2.75h3l1.25 1.5h5.25a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5v-6.5Z" />
      </svg>
    ) : (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 1.75h6l4 4v8.5H3V1.75Z" />
        <path d="M9 1.75v4h4" />
      </svg>
    );
  }
  if (item.kind === "computer-use" || item.kind === "plugin") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.25" width="12" height="8.5" rx="1.5" />
        <path d="M5.5 13.75h5M8 10.75v3" />
      </svg>
    );
  }
  if (item.kind === "skill") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m8 1.75 1.35 3.4 3.65.2-2.8 2.35.95 3.55L8 9.25l-3.15 2 .95-3.55L3 5.35l3.65-.2L8 1.75Z" />
      </svg>
    );
  }
  return <SlashCommandIcon name={item.icon} />;
}

export function ComposerAutocomplete({
  sections,
  activeIndex,
  loading,
  label,
  emptyText,
  groupLabels,
  loadingText,
  onActiveIndexChange,
  onSelect,
}: {
  sections: ComposerSuggestionSection[];
  activeIndex: number;
  loading: boolean;
  label: string;
  emptyText: string;
  groupLabels: Record<ComposerSuggestionGroup, string>;
  loadingText: string;
  onActiveIndexChange: (index: number) => void;
  onSelect: (item: ComposerSuggestion) => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const items = sections.flatMap((section) => section.items);

  useEffect(() => {
    itemRefs.current.length = items.length;
  }, [items.length]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let index = 0;
  return (
    <div className={styles.menu} data-composer-autocomplete role="listbox" aria-label={label}>
      <div className={styles.scroller}>
        {loading && items.length === 0 ? (
          <div className={styles.loadingRow} role="status">
            <span className={styles.srOnly}>{loadingText}</span>
            <span className={styles.loadingIcon} aria-hidden="true" />
            <span className={styles.loadingLine} aria-hidden="true" />
          </div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>{emptyText}</div>
        ) : sections.map((section) => (
          <section key={`${section.id}:${section.title ?? ""}`} className={styles.section} aria-label={section.title ?? groupLabels[section.id]}>
            {section.showTitle === false ? null : (
              <div className={styles.sectionTitle}>{section.title ?? groupLabels[section.id]}</div>
            )}
            {section.items.map((item) => {
              const itemIndex = index;
              index += 1;
              const active = itemIndex === activeIndex;
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    itemRefs.current[itemIndex] = node;
                  }}
                  type="button"
                  className={styles.item}
                  data-active={active ? "true" : "false"}
                  role="option"
                  aria-selected={active}
                  title={item.detail}
                  onMouseEnter={() => onActiveIndexChange(itemIndex)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(item);
                  }}
                >
                  <span className={styles.icon} data-kind={item.kind}>
                    <SuggestionIcon item={item} />
                  </span>
                  <span className={styles.content}>
                    <span className={styles.label}>{item.label}</span>
                    {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
                  </span>
                  {item.rightLabel ? <span className={styles.rightLabel}>{item.rightLabel}</span> : null}
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
